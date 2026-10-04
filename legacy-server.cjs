'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { createEngine, initialState, clientActions, verifiedReceipts } = require('./assets/masaflow-store.js');
const { buildAnalytics } = require('./shared/analytics.js');
const { createSummaryService } = require('./shared/sales-summary.js');
const { acquireLock, identity, validateState, atomicWrite, createBackupManager, listBackups } = require('./shared/local-data.js');

const { customerState, customerOrder, UUID } = require('./shared/customer-data.js');
const { createStaffAccess } = require('./shared/staff-access.js');

const DRAWER_PULSE = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
async function createService({ dataDirectory = process.env.MASAFLOW_DATA_DIR || path.join(__dirname, '.masaflow'), printerHost = process.env.MASAFLOW_PRINTER_HOST, printerPort = Number(process.env.MASAFLOW_PRINTER_PORT || 9100), summaryOptions = {}, backupOptions = {}, staffPassword = process.env.MASAFLOW_STAFF_PASSWORD || '', publicOrigin = process.env.MASAFLOW_PUBLIC_ORIGIN || '' } = {}) {
  const access = createStaffAccess({ password: staffPassword, publicOrigin });
  const releaseLock = await acquireLock(dataDirectory);
  try {
  dataDirectory = await fs.realpath(dataDirectory);
  const workspaceId = await identity(dataDirectory);
  const backups = createBackupManager(dataDirectory, backupOptions);
  let started = false, closedSignature = '';
  let closing = false;
  const activeRequests = new Set();
  const dataFile = path.join(dataDirectory, 'state.json');
  let state;
  try { state = validateState(JSON.parse(await fs.readFile(dataFile, 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; state = initialState(); }
  async function persist(next) {
    try { await atomicWrite(dataFile, JSON.stringify(next, null, 2)); }
    catch (error) { error.statusCode = 500; error.code = 'PERSISTENCE_FAILED'; throw error; }
    const signature = next.shifts.filter(shift => shift?.closedAt).map(shift => `${shift.id}:${shift.closedAt}`).join('|');
    if (started) await backups.automatic(next, signature !== closedSignature);
    closedSignature = signature;
  }
  const engine = createEngine({ state, persist });
  // Commit schema migration before serving requests or recovering hardware jobs.
  await persist(engine.getState());
  const summaries = createSummaryService({ ...summaryOptions, getState: engine.getState });
  const streams = new Map();
  function sendState(stream, client, next) {
    if (!client.customer && !access.authorized(client.req)) { stream.end(); return; }
    stream.write(`data: ${JSON.stringify(client.customer ? customerState(next, client.query) : next)}\n\n`);
  }
  engine.subscribe(next => streams.forEach((client, stream) => sendState(stream, client, next)));
  for (const job of engine.getState().hardwareJobs.filter(j => j && j.status === 'reserved')) await engine.finishHardwareJob(job.key, 'unknown', 'Service restarted during this pulse. Check the physical drawer before requesting a manual pulse.');
  function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
  async function body(req) {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Error('Send application/json.');
    let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 262144) throw new Error('Request is too large.'); }
    try { return JSON.parse(text); } catch (_) { throw new Error('Invalid JSON.'); }
  }
  async function kick(paymentId, manualKey) {
    const key = paymentId ? `payment:${paymentId}` : `manual:${manualKey}`;
    const reserved = await engine.reserveHardwareJob(key, paymentId);
    if (reserved.duplicate) return { ...reserved.job, duplicate: true };
    if (!printerHost) return engine.finishHardwareJob(key, 'simulated', 'Drawer pulse simulated. No physical printer is configured.');
    let status = 'sent';
    let message = 'ESC/POS pulse sent to the configured printer. Check the drawer; no physical-open sensor is connected.';
    try {
      await new Promise((resolve, reject) => {
        let connected = false;
        const socket = net.createConnection({ host: printerHost, port: printerPort });
        socket.setTimeout(3000);
        socket.on('connect', () => { connected = true; socket.end(DRAWER_PULSE); });
        socket.on('timeout', () => socket.destroy(new Error('Printer connection timed out.')));
        socket.on('error', error => { error.bytesMayHaveBeenSent = connected; reject(error); });
        socket.on('close', hadError => { if (!hadError) resolve(); });
      });
    } catch (error) {
      status = error.bytesMayHaveBeenSent ? 'unknown' : 'failed';
      message = error.bytesMayHaveBeenSent ? 'Printer response is uncertain. Check the drawer before requesting another pulse.' : 'Could not connect to printer. Payment is saved; inspect the connection and use a manual pulse when ready.';
    }
    // A completion-save error after delivery must not be reported as a connection failure.
    // The persisted reservation remains unknown until it can be reconciled.
    return engine.finishHardwareJob(key, status, message);
  }
  // Payment may have committed immediately before a crash that prevented reservation.
  // With no durable reservation, no pulse bytes could have been sent, so recovery is safe.
  for (const { payment } of verifiedReceipts(engine.getState()).receipts.filter(({ payment }) => payment.drawerKickStatus === 'pending' && !engine.getState().hardwareJobs.some(j => j && j.paymentId === payment.id))) await kick(payment.id, null);
  await backups.automatic(engine.getState(), true);
  started = true;
  const root = path.join(__dirname, 'apps/html');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    const work = handleRequest(req, res); activeRequests.add(work);
    work.finally(() => activeRequests.delete(work)).catch(() => {});
  });
  async function handleRequest(req, res) {
    try {
      if (closing) return json(res, 503, { error: 'MasaFlow is stopping. Retry after restart.' });
      const requestUrl = new URL(req.url, 'http://localhost');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.method === 'POST') access.checkOrigin(req);
      if (requestUrl.pathname === '/api/session' && req.method === 'GET') return json(res, 200, { required: access.enabled, authenticated: access.authorized(req) });
      if (requestUrl.pathname === '/api/session/login' && req.method === 'POST') {
        const data = await body(req); access.login(req, res, data.password); return json(res, 200, { authenticated: true });
      }
      if (requestUrl.pathname === '/api/session/logout' && req.method === 'POST') {
        access.logout(req, res); streams.forEach((client, stream) => { if (!client.customer && !access.authorized(client.req)) stream.end(); });
        return json(res, 200, { authenticated: false });
      }
      if (requestUrl.pathname.startsWith('/api/') && !requestUrl.pathname.startsWith('/api/customer/') && requestUrl.pathname !== '/api/health') access.require(req);
      if ((requestUrl.pathname === '/api/recent-orders' || requestUrl.pathname === '/api/transactions/recent') && req.method === 'GET') {
        const verified = verifiedReceipts(engine.getState());
        const sorted = [...verified.receipts].sort((a, b) => {
          const timeA = Date.parse(a.payment?.paidAt || a.order?.paidAt || a.order?.createdAt || 0);
          const timeB = Date.parse(b.payment?.paidAt || b.order?.paidAt || b.order?.createdAt || 0);
          return timeB - timeA;
        });
        const limit = Math.min(Math.max(1, Number(requestUrl.searchParams.get('limit') || 10)), 50);
        const lastTransactions = sorted.slice(0, limit).map(({ order, payment }) => ({
          id: payment.id,
          paymentId: payment.id,
          orderId: order.id,
          orderNumber: order.number,
          customerName: order.customerName,
          customerPhone: order.customerPhone || null,
          orderType: order.orderType,
          tableNumber: order.tableNumber,
          status: order.status,
          currency: payment.currency,
          totalCents: payment.totalCents,
          tenderedCents: payment.tenderedCents,
          changeCents: payment.changeCents,
          method: payment.method,
          paidAt: payment.paidAt,
          cashierId: payment.cashierId,
          drawerKickStatus: payment.drawerKickStatus,
          itemCount: Array.isArray(order.items) ? order.items.reduce((acc, i) => acc + (i.quantity || 1), 0) : 0,
          items: Array.isArray(order.items) ? order.items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            lineTotalCents: item.lineTotalCents,
            options: Array.isArray(item.options) ? item.options.map(o => o.name) : []
          })) : []
        }));
        return json(res, 200, {
          transactions: lastTransactions,
          count: lastTransactions.length,
          total: verified.receipts.length,
          updatedAt: new Date().toISOString()
        });
      }
      if (requestUrl.pathname === '/api/customer/state' && req.method === 'GET') return json(res, 200, customerState(engine.getState(), requestUrl.searchParams));
      if (requestUrl.pathname === '/api/customer/orders' && req.method === 'POST') {
        access.limitSubmission(req);
        const data = await body(req);
        if (data.action !== 'createDraft' || !Array.isArray(data.args) || data.args.length !== 1 || !UUID.test(data.args[0]?.submissionId || '')) throw new Error('Submit one order with a persistent submission UUID.');
        const order = await engine.createDraft(data.args[0]);
        const snapshot = customerState(engine.getState(), new URLSearchParams({ order: order.id }));
        return json(res, 200, { result: customerOrder(order, snapshot.orders[0].verifiedPaid), state: snapshot });
      }
      if (requestUrl.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { service: 'masaflow', version: '0.2.0', workspaceId, status: 'ready', ...(access.authorized(req) ? { backup: backups.status() } : {}) });
      if (requestUrl.pathname === '/api/backups' && req.method === 'GET') return json(res, 200, { backups: await listBackups(dataDirectory) });
      if (requestUrl.pathname === '/api/backups/create' && req.method === 'POST') return json(res, 200, { backup: await backups.create(engine.getState()) });
      if (requestUrl.pathname === '/api/state' && req.method === 'GET') return json(res, 200, engine.getState());
      if (requestUrl.pathname === '/api/analytics' && req.method === 'GET') return json(res, 200, buildAnalytics(engine.getState(), requestUrl.searchParams, { summaryAvailable: summaries.available() }));
      if (requestUrl.pathname === '/api/analytics/summary' && req.method === 'POST') return json(res, 200, await summaries.summarize(await body(req)));
      if (['/api/events', '/api/customer/events'].includes(requestUrl.pathname) && req.method === 'GET') {
        if (streams.size >= 200) return json(res, 503, { error: 'Connection capacity reached. Please retry shortly.' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        const client = { req, customer: requestUrl.pathname === '/api/customer/events', query: requestUrl.searchParams };
        sendState(res, client, engine.getState()); streams.set(res, client);
        const heartbeat = setInterval(() => {
          if (!client.customer && !access.authorized(req)) res.end(); else res.write(': keepalive\n\n');
        }, 20000);
        req.on('close', () => { clearInterval(heartbeat); streams.delete(res); }); return;
      }
      if (requestUrl.pathname === '/api/action' && req.method === 'POST') {
        const data = await body(req);
        if (!clientActions.includes(data.action) || !Array.isArray(data.args) || data.args.length > 4) throw new Error('Unsupported action.');
        const result = await engine[data.action](...data.args);
        // The service owns this side effect: it still runs if the cashier browser closes immediately after payment.
        if (data.action === 'payOrder') {
          try { await kick(result.payment.id, null); }
          catch (_) { result.hardwareWarning = 'Payment is saved. The drawer pulse result could not be recorded; inspect the drawer and service before requesting a manual pulse.'; }
        }
        return json(res, 200, { result, state: engine.getState() });
      }
      if (requestUrl.pathname === '/api/cash-drawer/kick' && req.method === 'POST') {
        const data = await body(req);
        if (data.paymentId && !/^[a-f0-9-]{36}$/i.test(data.paymentId)) throw new Error('Invalid payment reference.');
        if (!data.paymentId && !/^[a-f0-9-]{36}$/i.test(data.requestId || '')) throw new Error('Manual pulse requires a request ID.');
        let result;
        try { result = await kick(data.paymentId || null, data.requestId); }
        catch (_) { throw new Error('Drawer pulse result could not be recorded. Inspect the physical drawer before requesting any new pulse.'); }
        return json(res, 200, result);
      }
      if (requestUrl.pathname.startsWith('/api/')) return json(res, 404, { error: 'Endpoint not found.' });
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
      const entrances = { '/': '/MenuUI.html', '/order': '/MenuUI.html', '/track': '/readypickupUI.html', '/pos': '/businessDashbord.html', '/insights': '/analytics/' };
      if (entrances[requestUrl.pathname]) { res.writeHead(302, { Location: entrances[requestUrl.pathname] + requestUrl.search }); res.end(); return; }
      const staffPage = ['/businessDashbord.html', '/metricsDashbord.html', '/MenuManagment.html', '/history.html', '/analytics'].includes(requestUrl.pathname) || requestUrl.pathname.startsWith('/analytics/');
      if (staffPage && !access.authorized(req)) { res.writeHead(302, { Location: `/staff-login.html?next=${encodeURIComponent(requestUrl.pathname + requestUrl.search)}`, 'Cache-Control': 'no-store' }); res.end(); return; }
      if (requestUrl.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      if (requestUrl.pathname === '/analytics') { res.writeHead(302, { Location: `/analytics/${requestUrl.search}` }); res.end(); return; }
      const isAnalytics = requestUrl.pathname.startsWith('/analytics/');
      const isAsset = requestUrl.pathname.startsWith('/assets/');
      const staticRoot = isAnalytics ? path.join(__dirname, 'apps/analytics/dist') : isAsset ? path.join(__dirname, 'assets') : root;
      const fileName = isAnalytics ? requestUrl.pathname.slice('/analytics/'.length) || 'index.html' : isAsset ? requestUrl.pathname.slice('/assets/'.length) : requestUrl.pathname.slice(1);
      const requested = path.resolve(staticRoot, decodeURIComponent(fileName));
      if (!requested.startsWith(`${staticRoot}${path.sep}`) || !types[path.extname(requested)]) return json(res, 404, { error: 'File not found.' });
      if (['businessDashbord.html', 'metricsDashbord.html', 'MenuManagment.html', 'history.html'].includes(path.basename(requested)) && !access.authorized(req)) { res.writeHead(302, { Location: '/staff-login.html', 'Cache-Control': 'no-store' }); res.end(); return; }
      const content = await fs.readFile(requested);
      res.writeHead(200, { 'Content-Type': types[path.extname(requested)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) { if (!res.headersSent) json(res, error.code === 'ENOENT' ? 404 : error.statusCode || 400, { error: error.message, code: error.code || 'ACTION_REJECTED' }); else res.end(); }
  }
  let closePromise;
  return { server, engine, dataFile, kick, close: () => {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {
      streams.forEach((_client, stream) => stream.end()); server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await Promise.allSettled([...activeRequests]);
      await engine.whenIdle(); await backups.idle(); await releaseLock();
    })();
    return closePromise;
  } };
  } catch (error) { await releaseLock(); throw error; }
}

if (require.main === module) {
  const host = process.env.MASAFLOW_HOST || process.env.HOST || '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.MASAFLOW_STAFF_PASSWORD) {
    process.stderr.write('Set MASAFLOW_STAFF_PASSWORD before listening on a network interface.\n'); process.exitCode = 1;
  } else createService().then(app => {
    const { server } = app;
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; await app.close(); };
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
    server.once('error', async error => { await stop(); process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
    const port = Number(process.env.PORT || 3000);
    server.listen(port, host, () => process.stdout.write(`MasaFlow running at http://${host}:${port}\n`));
  }).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
module.exports = { createService, DRAWER_PULSE };
