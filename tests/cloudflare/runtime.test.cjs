'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');
const { createEngine } = require('../../shared/realtime/engine.js');
const root = path.resolve(__dirname, '../..');
const PASSWORD = 'cloud-runtime-test-password';
const MIGRATION = 'cloud-runtime-migration-secret-test-123456789';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function startRuntime(directory, port) {
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const options = convertV4MiniflareOptions({
    name: 'zapata-test', port, modules: true,
    scriptPath: path.join(root, 'cloudflare/.wrangler/cloud-build/worker.js'),
    compatibilityDate: '2026-10-14', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { RESTAURANT: { className: 'Restaurant', useSQLite: true } },
    durableObjectsPersist: directory,
    bindings: { STAFF_PASSWORD: PASSWORD, MIGRATION_KEY: MIGRATION, CUSTOMER_DOMAIN: 'loshuarachesdezapata.live', STAFF_DOMAIN: 'zapatapos.live' },
    assets: { directory: path.join(root, 'cloudflare/public'), binding: 'ASSETS', run_worker_first: true, assetConfig: { html_handling: 'none', not_found_handling: 'none' } },
  });
  options.workers[0].config.assets.hasUserWorker = true;
  options.resourcePersistencePath = directory;
  options.unsafeEnableSharedStorage = true;
  options.isolatedResourcePersistencePath = path.join(directory, 'isolated');
  options.unsafeDevRegistryPath = path.join(directory, 'registry');
  const runtime = new Miniflare(options);
  await runtime.ready;
  return { url: `http://localhost:${port}`, fetch: runtime.dispatchFetch.bind(runtime), miniflare: runtime, stop: () => runtime.dispose() };
}
async function connect(url, sessionId = randomUUID(), token = '', origin = url) {
  const socket = new WebSocket(url.replace('http:', 'ws:') + '/api/realtime', { origin });
  const pending = new Map();
  const snapshots = [];
  const listeners = [];
  let serial = 0;
  socket.on('message', bytes => {
    const text = bytes.toString(); if (text === 'pong') return;
    const packet = JSON.parse(text);
    if (packet.id && pending.has(packet.id)) {
      pending.get(packet.id)(packet.reply); pending.delete(packet.id);
    }
    if (['init_data', 'state_delta'].includes(packet.event)) {
      snapshots.push(packet.payload);
      for (const callback of listeners.splice(0)) callback(packet.payload);
    }
  });
  const next = () => new Promise(resolve => listeners.push(resolve));
  const command = (event, payload) => new Promise((resolve, reject) => {
    const id = String(++serial);
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`No ack: ${event}`)); }, 4000);
    pending.set(id, reply => { clearTimeout(timeout); resolve(reply); });
    socket.send(JSON.stringify({ event, payload, id }));
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const initial = next(); await command('hello', { sessionId, token }); await initial;
  return { socket, command, next, snapshots, sessionId };
}
function order(engine, sessionId) {
  return { orderId: randomUUID(), sessionId, shiftId: engine.getState().shiftId, customerName: 'Cloud test', items: [{ menuItemId: 'huarache-bistec', quantity: 1, modifierIds: ['prep-comal'] }] };
}
test('Cloudflare runtime preserves imported ledger, privacy, auth and payment retries through restart', { timeout: 90000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zapata-cf-test-'));
  const seed = path.join(directory, 'seed');
  const engine = createEngine({ directory: seed });
  const sessionId = randomUUID();
  const data = order(engine, sessionId);
  engine.dispatch('submit_client_order', data);
  const imported = engine.getState();
  const net = require('node:net');
  const reserve = net.createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  let runtime = await startRuntime(path.join(directory, 'runtime'), port);
  const sockets = [];
  t.after(async () => { for (const socket of sockets) socket.terminate(); await runtime.stop(); fs.rmSync(directory, { recursive: true, force: true }); });
  const api = (route, options) => runtime.fetch(`${runtime.url}${route}`, options);
  const pageResponse = await api('/order/');
  assert.equal(pageResponse.status, 200, await pageResponse.text());
  assert.equal((await api('/pos/')).status, 200);
  const bundle = JSON.stringify({ format: 'masaflow-cloud-v1', files: { 'data.json': imported } });
  const request = { method: 'POST', headers: { Authorization: `Bearer ${MIGRATION}`, 'Content-Type': 'application/json' }, body: bundle };
  assert.equal((await api('/api/admin/import', { ...request, headers: { Authorization: 'Bearer bad' } })).status, 403);
  const corrupt = structuredClone(imported); corrupt.activeOrders[0].totalCents = -1;
  const corruptResponse = await api('/api/admin/import', { ...request, body: JSON.stringify({ format: 'masaflow-cloud-v1', files: { 'data.json': corrupt } }) });
  assert.equal(corruptResponse.status, 400, await corruptResponse.text());
  assert.equal((await api('/api/admin/import', request)).status, 200);
  const customer = await connect(runtime.url, sessionId); sockets.push(customer.socket);
  const outsider = await connect(runtime.url); sockets.push(outsider.socket);
  assert.equal(customer.snapshots.at(-1).activeOrders[0].id, data.orderId);
  assert.equal(outsider.snapshots.at(-1).activeOrders.length, 0);
  assert.equal(outsider.snapshots.at(-1).salesMetrics, null);
  assert.equal((await outsider.command('submit_client_order', data)).ok, false);
  assert.equal((await customer.command('pos_order_paid', { orderId: data.orderId, tenderedCents: 10000 })).code, 'UNAUTHORIZED');
  assert.equal((await customer.command('submit_client_order', data)).ok, true);
  const health = await (await api('/api/health')).json();
  if (!health.ordersOpen) assert.equal((await customer.command('submit_client_order', { ...data, orderId: randomUUID() })).code, 'RESTAURANT_CLOSED');
  for (const route of ['/pos/', '/%70os/realtime.html', '/analytics/', '/api/admin/export']) assert.equal((await runtime.fetch(`https://loshuarachesdezapata.live${route}`)).status, 404);
  assert.equal((await runtime.fetch('https://zapatapos.live/api/realtime', { headers: { Upgrade: 'websocket', Origin: 'https://evil.example' } })).status, 403);
  const staff = await connect(runtime.url); sockets.push(staff.socket);
  assert.equal((await staff.command('staff_login', 'incorrect')).ok, false);
  const login = await staff.command('staff_login', PASSWORD); assert.equal(login.ok, true, JSON.stringify(login));
  await runtime.miniflare.unsafeEvictDurableObject('zapata-test', 'Restaurant', { name: 'restaurant-v1', webSockets: 'hibernate' });
  assert.equal((await staff.command('request_init')).ok, true);
  assert.equal(staff.snapshots.at(-1).staff, true);
  assert.equal((await staff.command('pos_update_status', { orderId: data.orderId, status: 'cooking' })).ok, true);
  assert.equal((await staff.command('pos_update_status', { orderId: data.orderId, status: 'ready' })).ok, true);
  const payment = { orderId: data.orderId, tenderedCents: 10000 };
  assert.equal((await staff.command('pos_order_paid', payment)).ok, true);
  assert.equal((await staff.command('pos_order_paid', payment)).ok, true);
  const exported = await (await api('/api/admin/export', { headers: { Authorization: `Bearer ${login.token}` } })).json();
  assert.equal(exported.files['data.json'].salesMetrics.paidOrders, 1);
  assert.equal(exported.files['data.json'].completedOrders.length, 1);
  assert.equal((await api('/api/admin/export')).status, 403);
  assert.equal((await api('/api/admin/import', request)).status, 200);
  assert.equal((await api('/api/admin/import', { ...request, body: JSON.stringify({ format: 'masaflow-cloud-v1', files: { 'data.json': engine.getState(), 'archive_test.json': engine.getState() } }) })).status, 400);
  for (const socket of sockets) socket.terminate();
  await runtime.stop();
  runtime = await startRuntime(path.join(directory, 'runtime'), port);
  const reconnected = await connect(runtime.url, randomUUID(), login.token); sockets.push(reconnected.socket);
  assert.equal(reconnected.snapshots.at(-1).shiftId, imported.shiftId, "Persisted shift changed after restart");
  assert.equal(reconnected.snapshots.at(-1).staff, true);
  assert.equal(reconnected.snapshots.at(-1).salesMetrics.paidOrders, 1);
  assert.equal((await reconnected.command('pos_order_paid', payment)).ok, true);
  const state = reconnected.snapshots.at(-1);
  assert.equal((await reconnected.command('pos_close_shift', { shiftId: state.shiftId, expectedRevision: state.revision })).ok, true);
  const archived = await (await api('/api/admin/export', { headers: { Authorization: `Bearer ${login.token}` } })).json();
  assert.ok(Object.keys(archived.files).some(name => name.startsWith('archive_')));
  assert.equal(archived.files['data.json'].salesMetrics.paidOrders, 0);
  await reconnected.command('staff_logout');
  assert.equal((await reconnected.command('pos_toggle_accepting_orders', { acceptingOrders: true })).code, 'UNAUTHORIZED');
  assert.equal((await api('/api/admin/export', { headers: { Authorization: `Bearer ${login.token}` } })).status, 403);
});
