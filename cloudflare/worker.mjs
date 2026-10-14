import { DurableObject } from 'cloudflare:workers';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import ledger from '../shared/realtime/engine.js';
import hours from '../shared/business-hours.js';
import schedule from '../config/server-schedule.json';
import { createSqlFiles } from './storage.mjs';
const { createEngine, validate, UUID, ensure } = ledger;
const { isOpen } = hours;
const commands = new Set(['submit_client_order', 'pos_order_paid', 'pos_update_status', 'pos_mark_noshow', 'admin_toggle_stock', 'admin_add_menu_item', 'pos_toggle_accepting_orders', 'pos_set_table', 'pos_close_shift']);
const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const fail = error => ({ ok: false, error: error?.code ? error.message : 'No se pudo completar la acción. Reconecta y verifica antes de reintentar.', code: error?.code || 'SERVER_ERROR' });
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const customerHost = (host, env) => host === env.CUSTOMER_DOMAIN;
function allowedHost(host, env) {
  return host === env.CUSTOMER_DOMAIN || host === env.STAFF_DOMAIN || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.workers.dev');
}
function normalizedPath(value) {
  try { return decodeURIComponent(value).replace(/\/+/g, '/').toLowerCase(); } catch { return null; }
}
function nextBoundary(now = new Date()) {
  // Mexico City no longer changes its UTC-6 offset. Calculate the next configured
  // opening/closing boundary without a polling timer that would prevent hibernation.
  const dayStart = new Date(now.getTime() - 6 * 3600000);
  dayStart.setUTCHours(0, 0, 0, 0);
  for (let day = 0; day < 8; day++) {
    const local = new Date(dayStart.getTime() + day * 86400000);
    if (!schedule.days.includes(local.getUTCDay())) continue;
    for (const time of [schedule.start, schedule.end]) {
      const [hour, minute] = time.split(':').map(Number);
      const at = local.getTime() + (hour + 6) * 3600000 + minute * 60000;
      if (at > now.getTime()) return at;
    }
  }
  throw new Error('No business-hours boundary');
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!allowedHost(url.hostname, env)) return new Response('Not found', { status: 404 });
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
      url.protocol = 'https:';
      return Response.redirect(url, 308);
    }
    const pathname = normalizedPath(url.pathname);
    if (!pathname) return new Response('Invalid path', { status: 400 });
    if (customerHost(url.hostname, env) && /^\/(pos|analytics|insights|api\/admin)(\/|$)/.test(pathname)) return new Response('Not found', { status: 404 });
    if (pathname.startsWith('/api/')) {
      return env.RESTAURANT.getByName('restaurant-v1').fetch(request);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    if (pathname === '/') return Response.redirect(new URL(customerHost(url.hostname, env) ? '/order/' : '/pos/', url), 302);
    if (pathname === '/insights') return Response.redirect(new URL('/analytics/', url), 302);
    if (['/order', '/pos', '/analytics'].includes(pathname)) return Response.redirect(new URL(`${pathname}/`, url), 302);
    const assetURL = new URL(url);
    if (/^\/(order|pos|analytics)\/$/.test(pathname)) assetURL.pathname = `${pathname}realtime.html`;
    const response = await env.ASSETS.fetch(new Request(assetURL, request));
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'same-origin');
    headers.set('X-Frame-Options', 'DENY');
    if (assetURL.pathname.endsWith('.html') || pathname.endsWith('/sw.js')) headers.set('Cache-Control', 'no-cache');
    return new Response(response.body, { status: response.status, headers });
  },
};
export class Restaurant extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.files = createSqlFiles(this.sql);
    this.sql.exec('CREATE TABLE IF NOT EXISTS staff_sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL, credential TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.loadEngine();
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  loadEngine() {
    // Build inside a transaction so migration backups and the current ledger agree.
    this.engine = this.ctx.storage.transactionSync(() => createEngine({
      directory: '/ledger', fileSystem: this.files.fs, persist: this.files.write,
      ordersOpen: () => isOpen(schedule),
    }));
  }
  credential() {
    const password = this.env.STAFF_PASSWORD || '';
    ensure(password.length >= 12 && password.length <= 256, 'Configura la contraseña del personal.', 'CONFIGURATION_ERROR');
    return password;
  }
  authenticated(data) {
    if (!data.staffAllowed || !data.token) return false;
    const rows = [...this.sql.exec('SELECT expires, credential FROM staff_sessions WHERE token = ?', hash(data.token))];
    return rows.length === 1 && rows[0].expires > Date.now() && rows[0].credential === hash(this.credential());
  }
  limit(key, maximum, duration) {
    const now = Date.now();
    this.sql.exec('DELETE FROM rate_limits WHERE expires <= ?', now);
    const rows = [...this.sql.exec('SELECT count, expires FROM rate_limits WHERE key = ?', key)];
    ensure(rows.length || [...this.sql.exec('SELECT COUNT(*) AS count FROM rate_limits')][0].count < 5000, 'Intenta más tarde.', 'RATE_LIMITED');
    const count = (rows[0]?.count || 0) + 1;
    this.sql.exec('INSERT OR REPLACE INTO rate_limits VALUES (?, ?, ?)', key, count, rows[0]?.expires || now + duration);
    ensure(count <= maximum, 'Demasiados intentos. Intenta más tarde.', 'RATE_LIMITED');
  }
  send(ws, event, payload) {
    try { ws.send(JSON.stringify({ event, payload })); } catch { try { ws.close(1011, 'Reconnect'); } catch {} }
  }
  snapshot(data, incremental = false) {
    const state = this.engine.getState();
    const staff = this.authenticated(data);
    const cursor = incremental && data.shiftId === state.shiftId && data.staff === staff ? (data.cursor || 0) : 0;
    const open = isOpen(schedule);
    const result = {
      shiftId: state.shiftId, shiftOpenedAt: state.shiftOpenedAt, revision: state.revision,
      observedAt: new Date().toISOString(), staffAuthMode: 'password', staff,
      acceptingOrders: state.acceptingOrders && (staff || open), orderingHours: { ...schedule, open },
      menuItems: state.menuItems, modifiers: state.modifiers, tables: state.tables,
      queueNumbers: state.activeOrders.filter(order => ['review', 'cooking'].includes(order.status)).map(order => order.number),
      activeOrders: state.activeOrders.filter(order => staff || order.sessionId === data.sessionId),
      completedOrders: state.completedOrders.slice(cursor).filter(order => staff || order.sessionId === data.sessionId),
      salesMetrics: staff ? state.salesMetrics : null,
    };
    data.cursor = state.completedOrders.length; data.shiftId = state.shiftId; data.staff = staff;
    return result;
  }
  publish(ws, event = 'init_data', incremental = false) {
    const data = ws.deserializeAttachment();
    if (!data?.sessionId) return;
    if (data.token && !this.authenticated(data)) {
      data.token = ''; this.send(ws, 'staff_expired');
    }
    this.send(ws, event, this.snapshot(data, incremental));
    ws.serializeAttachment(data);
  }
  broadcast() {
    for (const ws of this.ctx.getWebSockets()) this.publish(ws, 'state_delta', true);
  }
  async scheduleAlarm() {
    const sockets = this.ctx.getWebSockets();
    if (!sockets.length) { await this.ctx.storage.deleteAlarm(); return; }
    let at = nextBoundary();
    for (const ws of sockets) {
      const data = ws.deserializeAttachment();
      if (!data?.token) continue;
      const rows = [...this.sql.exec('SELECT expires FROM staff_sessions WHERE token = ?', hash(data.token))];
      if (rows[0]?.expires > Date.now()) at = Math.min(at, rows[0].expires);
    }
    await this.ctx.storage.setAlarm(at);
  }
  async alarm() {
    this.sql.exec('DELETE FROM staff_sessions WHERE expires <= ?', Date.now());
    this.broadcast();
    await this.scheduleAlarm();
  }
  async fetch(request) {
    const url = new URL(request.url);
    const path = normalizedPath(url.pathname);
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    try {
      this.credential();
      if (path === '/api/health' && request.method === 'GET') return json({ service: 'masaflow', status: 'ready', storage: 'cloudflare-sqlite', ordersOpen: isOpen(schedule), migrationComplete: !![...this.sql.exec("SELECT 1 FROM metadata WHERE key = 'imported'")].length });
      if (path === '/api/realtime') {
        ensure(request.method === 'GET' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket', 'WebSocket required.', 'INVALID_INPUT');
        ensure(request.headers.get('Origin') === url.origin, 'Origen inválido.', 'FORBIDDEN');
        this.limit(`connect:${ip}`, 120, 60000);
        ensure(this.ctx.getWebSockets().length < 500, 'Demasiadas conexiones.', 'RATE_LIMITED');
        const pair = new WebSocketPair();
        this.ctx.acceptWebSocket(pair[1]);
        pair[1].serializeAttachment({ ip, staffAllowed: !customerHost(url.hostname, this.env), sessionId: '', token: '' });
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      if (path === '/api/admin/export' && request.method === 'GET') {
        const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
        ensure(!customerHost(url.hostname, this.env) && this.authenticated({ token, staffAllowed: true }), 'Ingresa la contraseña del personal.', 'UNAUTHORIZED');
        this.limit(`export:${hash(token)}`, 5, 60000);
        return json({ format: 'masaflow-cloud-v1', exportedAt: new Date().toISOString(), files: Object.fromEntries(this.files.names().map(name => [name, JSON.parse(this.files.read(name))])) });
      }
      if (path === '/api/admin/import' && request.method === 'POST') {
        const secret = this.env.MIGRATION_KEY || '';
        ensure(secret.length >= 32 && equal(request.headers.get('Authorization') || '', `Bearer ${secret}`), 'Acceso inválido.', 'UNAUTHORIZED');
        const text = await request.text();
        ensure(text.length <= 16 * 1024 * 1024, 'La migración es demasiado grande.', 'INVALID_INPUT');
        const digest = hash(text);
        const prior = [...this.sql.exec("SELECT value FROM metadata WHERE key = 'imported'")][0];
        if (prior?.value === digest) return json({ ok: true, alreadyImported: true });
        ensure(!prior, 'La migración ya se realizó.', 'IMPORT_EXISTS');
        const bundle = JSON.parse(text);
        ensure(bundle.format === 'masaflow-cloud-v1' && bundle.files && Object.hasOwn(bundle.files, 'data.json'), 'Archivo inválido.', 'INVALID_INPUT');
        for (const [name, value] of Object.entries(bundle.files)) {
          ensure(/^(data\.json|archive_[A-Za-z0-9_.-]+\.json|data\.before-[A-Za-z0-9_.-]+\.json)$/.test(name), 'Nombre de archivo inválido.', 'INVALID_INPUT');
          validate(value);
        }
        // Recheck after awaiting the body: a live command may have run in between.
        const latest = this.engine.getState();
        ensure(latest.revision === 0 && !latest.activeOrders.length && !latest.completedOrders.length && !latest.closedShifts.length, 'El servidor ya tiene actividad.', 'IMPORT_EXISTS');
        try {
          this.ctx.storage.transactionSync(() => {
            for (const [name, value] of Object.entries(bundle.files)) this.files.write(name, value);
            this.sql.exec("INSERT INTO metadata VALUES ('imported', ?)", digest);
            this.loadEngine();
          });
        } catch (error) { this.loadEngine(); throw error; }
        this.broadcast();
        return json({ ok: true, shiftId: this.engine.getState().shiftId, revision: this.engine.getState().revision });
      }
      return new Response('Not found', { status: 404 });
    } catch (error) {
      return json(fail(error), ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.code) ? 403 : 400);
    }
  }
  async webSocketMessage(ws, message) {
    let packet;
    try {
      ensure(typeof message === 'string' && message.length <= 65536, 'Solicitud demasiado grande.', 'INVALID_INPUT');
      packet = JSON.parse(message);
      ensure(packet && typeof packet.event === 'string', 'Solicitud inválida.', 'INVALID_INPUT');
      const data = ws.deserializeAttachment();
      const { event, payload } = packet;
      let reply = { ok: true };
      if (event === 'hello') {
        this.limit(`hello:${data.ip}`, 120, 60000);
        ensure(!data.sessionId && payload && UUID.test(payload.sessionId), 'Sesión inválida.', 'INVALID_INPUT');
        data.sessionId = payload.sessionId;
        data.token = data.staffAllowed && typeof payload.token === 'string' && payload.token.length <= 256 ? payload.token : '';
        ws.serializeAttachment(data);
        this.publish(ws);
        await this.scheduleAlarm();
      } else {
        ensure(data.sessionId, 'Sesión inválida.', 'UNAUTHORIZED');
        if (event === 'request_init') {
          this.limit(`init:${data.ip}`, 60, 60000); this.publish(ws);
        } else if (event === 'staff_login') {
          ensure(data.staffAllowed, 'Acceso exclusivo del personal.', 'FORBIDDEN');
          this.limit(`login:${data.ip}`, 8, 60000);
          ensure(typeof payload === 'string' && payload.length <= 256 && equal(payload, this.credential()), 'Contraseña incorrecta.', 'UNAUTHORIZED');
          this.sql.exec('DELETE FROM staff_sessions WHERE expires <= ?', Date.now());
          ensure([...this.sql.exec('SELECT COUNT(*) AS count FROM staff_sessions')][0].count < 1000, 'Demasiadas sesiones.', 'RATE_LIMITED');
          if (data.token) this.sql.exec('DELETE FROM staff_sessions WHERE token = ?', hash(data.token));
          data.token = randomBytes(32).toString('base64url');
          this.sql.exec('INSERT INTO staff_sessions VALUES (?, ?, ?)', hash(data.token), Date.now() + 12 * 3600000, hash(this.credential()));
          ws.serializeAttachment(data); this.publish(ws);
          reply = { ok: true, token: data.token };
          await this.scheduleAlarm();
        } else if (event === 'staff_logout') {
          if (data.token) this.sql.exec('DELETE FROM staff_sessions WHERE token = ?', hash(data.token));
          data.token = ''; ws.serializeAttachment(data); this.broadcast();
        } else {
          ensure(commands.has(event), 'Acción inválida.', 'INVALID_INPUT');
          if (event === 'submit_client_order') {
            this.limit(`orders:${data.ip}`, 60, 60000);
            ensure(payload?.sessionId === data.sessionId, 'Sesión de pedido inválida.', 'INVALID_INPUT');
          } else {
            ensure(this.authenticated(data), 'Ingresa la contraseña del personal.', 'UNAUTHORIZED');
            this.limit(`staff:${data.ip}`, 300, 60000);
          }
          try {
            reply = this.ctx.storage.transactionSync(() => this.engine.dispatch(event, payload));
          } catch (error) {
            // Restore in-memory state from durable SQLite after any failed transaction.
            this.loadEngine();
            throw error;
          }
          this.broadcast();
        }
      }
      if (typeof packet.id === 'string') ws.send(JSON.stringify({ id: packet.id, reply }));
    } catch (error) {
      if (error.code === 'UNAUTHORIZED') { this.send(ws, 'staff_expired'); this.publish(ws); }
      if (typeof packet?.id === 'string') { try { ws.send(JSON.stringify({ id: packet.id, reply: fail(error) })); } catch {} }
      else this.send(ws, 'storage_error', fail(error));
    }
  }
  async webSocketClose(ws, code, reason) { try { ws.close(code === 1006 ? 1000 : code, reason); } catch {} await this.scheduleAlarm(); }
  async webSocketError(ws) { try { ws.close(1011, 'Reconnect'); } catch {} await this.scheduleAlarm(); }
}
