'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { createEngine, initialState, clientActions } = require('./apps/html/assets/masaflow-store.js');

const DRAWER_PULSE = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
async function createService({ dataDirectory = path.join(__dirname, '.masaflow'), printerHost = process.env.MASAFLOW_PRINTER_HOST, printerPort = Number(process.env.MASAFLOW_PRINTER_PORT || 9100) } = {}) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const dataFile = path.join(dataDirectory, 'state.json');
  let state;
  try { state = JSON.parse(await fs.readFile(dataFile, 'utf8')); if (state.version !== 1 || !Array.isArray(state.orders)) throw new Error('Unsupported or invalid saved data.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; state = initialState(); }
  const engine = createEngine({ state, persist: async next => {
    const temporary = `${dataFile}.tmp`;
    const file = await fs.open(temporary, 'w', 0o600);
    try { await file.writeFile(JSON.stringify(next, null, 2)); await file.sync(); } finally { await file.close(); }
    await fs.rename(temporary, dataFile);
  } });
  const streams = new Set();
  engine.subscribe(next => { const event = `data: ${JSON.stringify(next)}\n\n`; streams.forEach(stream => stream.write(event)); });
  for (const job of engine.getState().hardwareJobs.filter(j => j.status === 'reserved')) await engine.finishHardwareJob(job.key, 'unknown', 'Service restarted during this pulse. Check the physical drawer before requesting a manual pulse.');
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
  for (const payment of engine.getState().payments.filter(p => p.drawerKickStatus === 'pending' && !engine.getState().hardwareJobs.some(j => j.paymentId === p.id))) await kick(payment.id, null);
  const root = path.join(__dirname, 'apps/html');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, 'http://localhost');
      if (req.method === 'POST' && (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`))) { json(res, 403, { error: 'Cross-origin actions are not allowed.' }); return; }
      if (requestUrl.pathname === '/api/state' && req.method === 'GET') return json(res, 200, engine.getState());
      if (requestUrl.pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(`data: ${JSON.stringify(engine.getState())}\n\n`); streams.add(res);
        const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 20000);
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
      if (requestUrl.pathname === '/') { res.writeHead(302, { Location: '/businessDashbord.html' }); res.end(); return; }
      if (requestUrl.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const requested = path.resolve(root, `.${decodeURIComponent(requestUrl.pathname)}`);
      if (!requested.startsWith(`${root}${path.sep}`) || !types[path.extname(requested)]) return json(res, 404, { error: 'File not found.' });
      const content = await fs.readFile(requested);
      res.writeHead(200, { 'Content-Type': types[path.extname(requested)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) { if (!res.headersSent) json(res, error.code === 'ENOENT' ? 404 : 400, { error: error.message }); else res.end(); }
  });
  return { server, engine, dataFile, kick, close: () => { streams.forEach(s => s.end()); server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); } };
}
if (require.main === module) {
  createService().then(({ server }) => {
    const port = Number(process.env.PORT || 4173); const host = process.env.MASAFLOW_HOST || '127.0.0.1';
    server.listen(port, host, () => process.stdout.write(`MasaFlow running at http://${host}:${port}\n`));
  }).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
module.exports = { createService, DRAWER_PULSE };
