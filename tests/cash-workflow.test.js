'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { createEngine, parseMoney } = require('../apps/html/assets/masaflow-store.js');
const { createService, DRAWER_PULSE } = require('../server.js');
const draftData = (quantity = 1) => ({ customerName: 'Ana', orderType: 'takeout', tableNumber: null, items: [{ menuItemId: 'huarache', quantity, optionIds: ['blue', 'cheese'], notes: 'No onions' }] });

test('strict cents parsing and modifier totals avoid floating-point cash errors', async () => {
  assert.equal(parseMoney('12.50'), 1250); assert.equal(parseMoney('0.01'), 1);
  for (const amount of ['12.345', '-5', 'NaN', '1e3', '', '2,000', 'Infinity']) assert.throws(() => parseMoney(amount));
  const store = createEngine(); const order = await store.createDraft(draftData(2));
  assert.equal(order.subtotalCents, 2700); assert.equal(order.totalCents, 2700); assert.equal(order.paymentStatus, 'unpaid');
  await assert.rejects(store.createDraft({ ...draftData(), items: [{ menuItemId: 'huarache', quantity: 1, optionIds: [] }] }), /one masa/);
});

test('cash gate rejects dispatch, closed shift and short tender; duplicate finalization charges once', async () => {
  const store = createEngine(); const order = await store.createDraft(draftData());
  await assert.rejects(store.advanceOrder(order.id), /payment must be verified/);
  await assert.rejects(store.payOrder(order.id, 2000), /starting float/);
  await store.openShift(20000, 'Ana cashier');
  await assert.rejects(store.payOrder(order.id, 1000), /Insufficient cash/);
  assert.equal(store.getState().payments.length, 0); assert.equal(store.getOrder(order.id).status, 'draft');
  const [first, second] = await Promise.all([store.payOrder(order.id, 2000, 'Ana cashier'), store.payOrder(order.id, 5000, 'Ana cashier')]);
  assert.equal(first.payment.changeCents, 650); assert.equal(first.payment.totalCents, 1350);
  assert.equal(second.alreadyPaid, true); assert.equal(second.payment.tenderedCents, 2000);
  assert.equal(store.getState().payments.length, 1); assert.equal(store.getOrder(order.id).status, 'pending');
  assert.equal((await store.advanceOrder(order.id)).status, 'preparing');
  assert.equal((await store.advanceOrder(order.id)).status, 'ready');
  assert.equal((await store.advanceOrder(order.id)).status, 'completed');
  await assert.rejects(store.advanceOrder(order.id), /cannot advance/);
});

test('drawer balance uses tender minus change, drops and float; shift audit freezes its variance', async () => {
  const store = createEngine(); const shift = await store.openShift(20000);
  const order = await store.createDraft(draftData()); await store.payOrder(order.id, 2000);
  assert.deepEqual(store.shiftSummary(), { floatCents: 20000, tenderedCents: 2000, changeCents: 650, salesCents: 1350, dropsCents: 0, expectedCents: 21350, orderCount: 1 });
  await assert.rejects(store.recordCashDrop(22000, 'safe'), /exceeds/);
  await store.recordCashDrop(10000, 'safe'); assert.equal(store.shiftSummary().expectedCents, 11350);
  const audit = await store.closeShift(11300); assert.equal(audit.varianceCents, -50); assert.equal(audit.expectedCentsAtClose, 11350);
  await store.openShift(5000); assert.equal(store.shiftSummary().expectedCents, 5000); assert.equal(store.shiftSummary(shift.id).expectedCents, 11350);
  const newOrder = await store.createDraft(draftData()); await store.payOrder(newOrder.id, 2000);
  assert.equal(store.getState().shifts[0].varianceCents, -50);
});

test('unavailable item or option blocks draft/payment while price snapshots remain immutable', async () => {
  const store = createEngine(); await store.openShift(10000); const order = await store.createDraft(draftData());
  await store.updateMenuItem('huarache', { priceCents: 1500 });
  assert.equal(store.getOrder(order.id).totalCents, 1350);
  await store.updateMenuOption('huarache', 'blue', { available: false });
  await assert.rejects(store.payOrder(order.id, 2000), /sold out/); assert.equal(store.getState().payments.length, 0);
  await assert.rejects(store.createDraft(draftData()), /modifier is unavailable/);
  await store.updateMenuOption('huarache', 'blue', { available: true });
  await store.updateMenuItem('huarache', { available: false });
  await assert.rejects(store.payOrder(order.id, 2000), /sold out/);
});

test('failed durable save rolls back the cash transaction instead of dispatching it', async () => {
  let fail = false; const store = createEngine({ persist: async () => { if (fail) throw new Error('Disk unavailable'); } });
  await store.openShift(20000); const order = await store.createDraft(draftData()); fail = true;
  await assert.rejects(store.payOrder(order.id, 2000), /Disk unavailable/);
  assert.equal(store.getState().payments.length, 0); assert.equal(store.getOrder(order.id).status, 'draft');
});

test('concurrent stale kitchen actions cannot skip a fulfillment stage', async () => {
  const store = createEngine(); await store.openShift(0); const order = await store.createDraft(draftData()); await store.payOrder(order.id, 1350);
  const results = await Promise.allSettled([store.advanceOrder(order.id, 'pending'), store.advanceOrder(order.id, 'pending')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(store.getOrder(order.id).status, 'preparing');
});

test('restart safely recovers paid receipts with no pulse reservation and marks uncertain reservations unknown', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'masaflow-recovery-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createEngine(); await store.openShift(0);
  const first = await store.createDraft(draftData()); const firstPayment = (await store.payOrder(first.id, 2000)).payment;
  const second = await store.createDraft(draftData()); const secondPayment = (await store.payOrder(second.id, 2000)).payment;
  await store.reserveHardwareJob(`payment:${secondPayment.id}`, secondPayment.id);
  await fs.writeFile(path.join(directory, 'state.json'), JSON.stringify(store.getState()));
  const service = await createService({ dataDirectory: directory, printerHost: '' }); t.after(() => service.close());
  const state = service.engine.getState();
  assert.equal(state.payments.find(p => p.id === firstPayment.id).drawerKickStatus, 'simulated');
  assert.equal(state.payments.find(p => p.id === secondPayment.id).drawerKickStatus, 'unknown');
  assert.equal(state.hardwareJobs.length, 2);
});

test('service persists payment, automatically pulses exact ESC/POS bytes, and suppresses duplicate pulses across restart', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'masaflow-test-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const received = []; const printer = net.createServer(socket => { let data = Buffer.alloc(0); socket.on('data', bytes => { data = Buffer.concat([data, bytes]); }); socket.on('end', () => { received.push(data); socket.end(); }); });
  await new Promise(resolve => printer.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => printer.close(resolve)));
  const config = { dataDirectory: directory, printerHost: '127.0.0.1', printerPort: printer.address().port };
  let service = await createService(config);
  async function listen() { await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${service.server.address().port}`; }
  let url = await listen(); t.after(() => service.close());
  async function action(name, ...args) { const response = await fetch(`${url}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: name, args }) }); const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body.result; }
  await action('openShift', 20000, 'QA'); const order = await action('createDraft', draftData());
  const response = await fetch(`${url}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'payOrder', args: [order.id, 1000] }) }); assert.equal(response.status, 400);
  const paid = await action('payOrder', order.id, 2000, 'QA'); assert.equal(received.length, 1); assert.deepEqual(received[0], DRAWER_PULSE);
  await action('payOrder', order.id, 5000, 'QA'); assert.equal(received.length, 1);
  const crossOrigin = await fetch(`${url}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' }, body: JSON.stringify({ action: 'openShift', args: [0] }) }); assert.equal(crossOrigin.status, 403);
  const invalidKick = await fetch(`${url}/api/cash-drawer/kick`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId: order.id }) }); assert.equal(invalidKick.status, 400);
  await service.close(); service = await createService(config); url = await listen();
  assert.equal(service.engine.getOrder(order.id).paymentStatus, 'paid');
  const retry = await fetch(`${url}/api/cash-drawer/kick`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId: paid.payment.id }) }); const pulse = await retry.json(); assert.equal(pulse.duplicate, true); assert.equal(received.length, 1);
});
