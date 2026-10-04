'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const vm = require('node:vm');
const { createEngine, initialState, migrateState, verifiedReceipts, money, parseMoney } = require('../assets/masaflow-store.js');
const { createService, DRAWER_PULSE } = require('../legacy-server.cjs');
const draftData = (quantity = 1) => ({ customerName: 'Ana', orderType: 'takeout', tableNumber: null, items: [{ menuItemId: 'huarache', quantity, optionIds: ['blue', 'cheese'], notes: 'No onions' }] });
const copy = value => JSON.parse(JSON.stringify(value));

test('MXN demo seed, formatting and rounded tax use integer minor units', async () => {
  const state = initialState();
  assert.equal(state.version, 2); assert.equal(state.settings.currency, 'MXN');
  assert.equal(state.settings.timeZone, 'America/Mexico_City'); assert.equal(state.settings.taxConfigured, false);
  assert.deepEqual(state.menu.map(item => item.priceCents), [8500, 3500, 5000, 3000, 4500]);
  assert.deepEqual(state.menu[0].options.map(option => option.priceCents), [0, 0, 1000, 1500]);
  assert.match(money(8500, 'USD', 'en'), /\$85\.00/);
  assert.match(money(8500, { currency: 'MXN', locale: 'en' }), /MX\$85\.00/);
  state.settings.taxBasisPoints = 825;
  const store = createEngine({ state }); const order = await store.createDraft(draftData());
  assert.equal(order.taxCents, 784); assert.equal(order.totalCents, 10284);
  await store.openShift(0); const payment = (await store.payOrder(order.id, 20000)).payment;
  assert.equal(payment.currency, 'MXN'); assert.equal(payment.taxCents, 784);
  assert.equal(verifiedReceipts(store.getState()).receipts.length, 1);
});

test('draft submission UUID survives restart and concurrent retries without repricing; conflicts reject', async () => {
  const submissionId = crypto.randomUUID(); const input = { ...draftData(), submissionId };
  const store = createEngine();
  const [first, retry] = await Promise.all([store.createDraft(input), store.createDraft(input)]);
  assert.equal(first.id, retry.id); assert.equal(store.getState().orders.length, 1);
  await store.updateMenuItem('huarache', { priceCents: 12000, available: false });
  const restarted = createEngine({ state: store.getState() });
  const original = await restarted.createDraft({ ...input, items: [{ ...input.items[0], optionIds: ['cheese', 'blue'] }] });
  assert.equal(original.id, first.id); assert.equal(original.totalCents, 9500);
  await assert.rejects(restarted.createDraft({ ...input, customerName: 'Beatriz' }), error => error.statusCode === 409 && error.code === 'SUBMISSION_CONFLICT');
  await assert.rejects(restarted.createDraft({ ...input, submissionId: 'not-a-uuid' }), error => error.code === 'INVALID_SUBMISSION_ID');
  assert.equal(restarted.getState().orders.length, 1);
});

test('legacy USD migration preserves amounts and frozen audits; requires closing and explicitly repricing', async () => {
  const legacySeed = initialState(); legacySeed.settings.currency = 'USD'; legacySeed.settings.timeZone = 'America/Los_Angeles';
  legacySeed.menu.forEach((item, index) => {
    item.currency = 'USD'; item.priceCents = [1250, 850, 1000, 800, 950][index];
    item.options.forEach(option => { option.currency = 'USD'; if (option.id === 'cheese') option.priceCents = 100; if (option.id === 'avocado') option.priceCents = 150; });
  });
  const legacyStore = createEngine({ state: legacySeed }); const firstShift = await legacyStore.openShift(10000);
  const paid = await legacyStore.createDraft(draftData()); await legacyStore.payOrder(paid.id, 2000);
  const audit = await legacyStore.closeShift(11300); assert.equal(audit.varianceCents, -50);
  await legacyStore.openShift(5000); const held = await legacyStore.createDraft(draftData());
  const legacy = legacyStore.getState(); legacy.version = 1;
  for (const key of ['menu', 'orders', 'payments', 'shifts', 'cashDrops']) legacy[key].forEach(record => { delete record.currency; });
  legacy.menu.forEach(item => item.options.forEach(option => { delete option.currency; }));
  legacy.orders.forEach(order => order.items.forEach(line => { delete line.currency; line.options.forEach(option => { delete option.currency; }); }));
  const before = copy(legacy), migrated = migrateState(legacy);
  assert.deepEqual(legacy, before); assert.equal(migrated.version, 2); assert.equal(migrated.settings.currency, 'MXN');
  assert.equal(migrated.orders[0].currency, 'USD'); assert.equal(migrated.payments[0].totalCents, 1350);
  assert.equal(migrated.menu[0].priceCents, 1250); assert.equal(migrated.menu[0].currency, 'USD');
  assert.equal(migrated.shifts[0].varianceCents, audit.varianceCents);
  assert.deepEqual(migrateState(migrated), migrated);
  const store = createEngine({ state: migrated });
  await assert.rejects(store.openShift(5000), /Close the legacy USD/);
  await assert.rejects(store.payOrder(held.id, 10000), error => error.code === 'LEGACY_ORDER_CURRENCY');
  await assert.rejects(store.createDraft(draftData()), error => error.code === 'LEGACY_MENU_CURRENCY');
  await store.updateMenuItem('huarache', { available: true }); assert.equal(store.getState().menu[0].currency, 'USD');
  await store.updateMenuItem('huarache', { priceCents: 8500 });
  await assert.rejects(store.createDraft(draftData()), /modifier has legacy/);
  await store.updateMenuOption('huarache', 'cheese', { priceCents: 1000 });
  const mxnOrder = await store.createDraft(draftData()); assert.equal(mxnOrder.totalCents, 9500);
  await assert.rejects(store.payOrder(mxnOrder.id, 10000), error => error.code === 'SHIFT_CURRENCY_MISMATCH');
  await store.closeShift(5000); const mxnShift = await store.openShift(10000);
  await store.payOrder(mxnOrder.id, 10000); await store.recordCashDrop(1000);
  assert.equal(mxnShift.currency, 'MXN'); assert.equal(store.getState().cashDrops[0].currency, 'MXN');
  assert.equal(store.shiftSummary().salesCents, 9500); assert.equal(store.shiftSummary(firstShift.id).expectedCents, 11350);
  assert.deepEqual(verifiedReceipts(store.getState()).receipts.map(receipt => receipt.payment.currency), ['USD', 'MXN']);
  const damaged = store.getState(); damaged.payments[0].totalCents += 1;
  assert.equal(createEngine({ state: damaged }).shiftSummary(firstShift.id).expectedCents, 11350);
});

test('legacy tax snapshots survive migration while new MXN drafts start with zero unconfigured tax', async () => {
  const legacySeed = initialState();
  legacySeed.settings.currency = 'USD'; legacySeed.settings.taxBasisPoints = 825; legacySeed.settings.taxConfigured = true;
  legacySeed.menu.forEach(item => { item.currency = 'USD'; item.options.forEach(option => { option.currency = 'USD'; }); });
  const legacyStore = createEngine({ state: legacySeed }); await legacyStore.openShift(0);
  const legacyOrder = await legacyStore.createDraft(draftData()); await legacyStore.payOrder(legacyOrder.id, 20000);
  await legacyStore.closeShift(legacyOrder.totalCents);
  const legacy = legacyStore.getState(); legacy.version = 1;
  const migrated = createEngine({ state: legacy });
  assert.equal(migrated.getState().settings.taxBasisPoints, 0); assert.equal(migrated.getState().settings.taxConfigured, false);
  assert.equal(migrated.getOrder(legacyOrder.id).taxCents, 784);
  assert.equal(migrated.getState().payments[0].taxCents, 784);
  assert.equal(migrated.getState().payments[0].totalCents, 10284);
  await migrated.updateMenuItem('huarache', { priceCents: 8500 });
  await migrated.updateMenuOption('huarache', 'cheese', { priceCents: 1000 });
  const mxnOrder = await migrated.createDraft(draftData());
  assert.equal(mxnOrder.currency, 'MXN'); assert.equal(mxnOrder.taxCents, 0); assert.equal(mxnOrder.totalCents, 9500);
  assert.equal(migrated.verifiedReceipts().receipts[0].payment.taxCents, 784);
});

test('shared receipt validation excludes malformed, duplicate and cross-currency records without throwing', async () => {
  const store = createEngine(); const shift = await store.openShift(10000);
  const order = await store.createDraft(draftData()); await store.payOrder(order.id, 10000);
  const state = store.getState(); assert.equal(verifiedReceipts(state).receipts.length, 1);
  const mutations = [
    s => { s.payments[0].changeCents = -1; },
    s => { s.payments[0].totalCents++; },
    s => { s.payments[0].currency = 'USD'; },
    s => { s.orders[0].taxCents = 1; },
    s => { s.orders[0].items[0].lineTotalCents++; },
    s => { s.orders[0].items[0].name = ''; },
    s => { s.orders[0].items[0] = null; },
    s => { s.orders[0].status = 'draft'; },
    s => { s.orders[0].paidAt = s.payments[0].paidAt = '2026-02-30T12:00:00.000Z'; },
    s => { s.payments.push(copy(s.payments[0])); },
    s => { s.orders.push(copy(s.orders[0])); },
    s => { s.shifts.push(copy(s.shifts[0])); },
    s => { s.orders[0].items[0].options[0].currency = 'USD'; },
    s => { s.payments[0].shiftId = 'missing'; }
  ];
  for (const mutation of mutations) {
    const malformed = copy(state); mutation(malformed);
    const result = verifiedReceipts(malformed); assert.equal(result.receipts.length, 0); assert.ok(result.excluded > 0);
    assert.equal(createEngine({ state: malformed }).isVerifiedPaid(order), false);
    assert.equal(createEngine({ state: malformed }).shiftSummary(shift.id).salesCents, 0);
  }
  assert.deepEqual(verifiedReceipts({ orders: [], payments: [null], shifts: [] }), { receipts: [], excluded: 1 });
  assert.deepEqual(verifiedReceipts(null), { receipts: [], excluded: 0 });
});

async function browserFixture(fetch) {
  const streams = [], events = [];
  const sandbox = {
    module: { exports: {} }, crypto: globalThis.crypto, console, fetch, URLSearchParams,
    localStorage: { getItem: () => 'en' },
    document: { dispatchEvent: event => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    EventSource: class { constructor() { streams.push(this); } }
  };
  vm.runInNewContext(await fs.readFile(path.join(__dirname, '../assets/masaflow-store.js'), 'utf8'), sandbox);
  return { store: sandbox.module.exports.createBrowserStore(), streams, events };
}

test('browser recovers an initial failure via SSE, retains confirmed data offline and rejects stale snapshots', async () => {
  let calls = 0;
  const fixture = await browserFixture(async () => {
    calls++; if (calls === 1) throw new Error('Offline');
    if (calls === 2) return { ok: false, status: 409, json: async () => ({ error: 'Conflicting submission', code: 'SUBMISSION_CONFLICT' }) };
    throw new Error('Lost response');
  });
  const { store, streams } = fixture; let notifications = 0; store.subscribe(() => notifications++);
  await assert.rejects(store.ready, error => error.code === 'SERVICE_UNAVAILABLE');
  assert.equal(store.getConnection().hasConfirmedState, false);
  const confirmed = initialState(); confirmed.revision = 8;
  streams[0].onmessage({ data: JSON.stringify(confirmed) }); await store.ready;
  assert.equal(notifications, 1); assert.equal(store.getConnection().connected, true);
  const syncedAt = store.getConnection().syncedAt;
  const stale = copy(confirmed); stale.revision = 7; stale.menu[0].priceCents = 1;
  streams[0].onmessage({ data: JSON.stringify(stale) });
  assert.equal(store.getState().menu[0].priceCents, 8500); assert.equal(notifications, 1);
  assert.equal(store.getConnection().syncedAt, syncedAt);
  streams[0].onerror(); assert.equal(store.getConnection().connected, false);
  assert.equal(store.getConnection().hasConfirmedState, true); assert.equal(store.getState().revision, 8);
  confirmed.revision = 9; streams[0].onmessage({ data: JSON.stringify(confirmed) });
  assert.equal(store.getConnection().connected, true); assert.equal(notifications, 2);
  assert.match(store.money(8500), /MX\$85\.00/); assert.match(store.money(8500, 'USD'), /\$85\.00/);
  await assert.rejects(store.createDraft({ ...draftData(), submissionId: crypto.randomUUID() }), error => error.code === 'SUBMISSION_CONFLICT' && error.statusCode === 409);
  await assert.rejects(store.createDraft({ ...draftData(), submissionId: crypto.randomUUID() }), error => error.code === 'TRANSACTION_UNCONFIRMED');
  assert.equal(store.getConnection().connected, false);
});

test('a delayed initial HTTP failure cannot undo an already confirmed SSE recovery', async () => {
  let rejectInitial;
  const initial = new Promise((_, reject) => { rejectInitial = reject; });
  const { store, streams } = await browserFixture(() => initial);
  const originalReady = store.ready; const confirmed = initialState(); confirmed.revision = 11;
  streams[0].onmessage({ data: JSON.stringify(confirmed) }); rejectInitial(new Error('Late failure'));
  await originalReady;
  assert.equal(store.getConnection().connected, true); assert.equal(store.getState().revision, 11);
});

test('strict cents parsing and modifier totals avoid floating-point cash errors', async () => {
  assert.equal(parseMoney('12.50'), 1250); assert.equal(parseMoney('0.01'), 1);
  for (const amount of ['12.345', '-5', 'NaN', '1e3', '', '2,000', 'Infinity']) assert.throws(() => parseMoney(amount));
  const store = createEngine(); const order = await store.createDraft(draftData(2));
  assert.equal(order.subtotalCents, 19000); assert.equal(order.totalCents, 19000); assert.equal(order.paymentStatus, 'unpaid');
  await assert.rejects(store.createDraft({ ...draftData(), items: [{ menuItemId: 'huarache', quantity: 1, optionIds: [] }] }), /one masa/);
});

test('cash gate rejects dispatch, closed shift and short tender; duplicate finalization charges once', async () => {
  const store = createEngine(); const order = await store.createDraft(draftData());
  await assert.rejects(store.advanceOrder(order.id), /payment must be verified/);
  await assert.rejects(store.payOrder(order.id, 10000), /starting float/);
  await store.openShift(20000, 'Ana cashier');
  await assert.rejects(store.payOrder(order.id, 1000), /Insufficient cash/);
  assert.equal(store.getState().payments.length, 0); assert.equal(store.getOrder(order.id).status, 'draft');
  const [first, second] = await Promise.all([store.payOrder(order.id, 10000, 'Ana cashier'), store.payOrder(order.id, 20000, 'Ana cashier')]);
  assert.equal(first.payment.changeCents, 500); assert.equal(first.payment.totalCents, 9500);
  assert.equal(second.alreadyPaid, true); assert.equal(second.payment.tenderedCents, 10000);
  assert.equal(store.getState().payments.length, 1); assert.equal(store.getOrder(order.id).status, 'pending');
  assert.equal((await store.advanceOrder(order.id)).status, 'preparing');
  assert.equal((await store.advanceOrder(order.id)).status, 'ready');
  assert.equal((await store.advanceOrder(order.id)).status, 'completed');
  await assert.rejects(store.advanceOrder(order.id), /cannot advance/);
});

test('drawer balance uses tender minus change, drops and float; shift audit freezes its variance', async () => {
  const store = createEngine(); const shift = await store.openShift(20000);
  const order = await store.createDraft(draftData()); await store.payOrder(order.id, 10000);
  assert.deepEqual(store.shiftSummary(), { currency: 'MXN', floatCents: 20000, tenderedCents: 10000, changeCents: 500, salesCents: 9500, dropsCents: 0, expectedCents: 29500, orderCount: 1, excludedReceipts: 0 });
  await assert.rejects(store.recordCashDrop(30000, 'safe'), /exceeds/);
  await store.recordCashDrop(10000, 'safe'); assert.equal(store.shiftSummary().expectedCents, 19500);
  const audit = await store.closeShift(19450); assert.equal(audit.varianceCents, -50); assert.equal(audit.expectedCentsAtClose, 19500);
  await store.openShift(5000); assert.equal(store.shiftSummary().expectedCents, 5000); assert.equal(store.shiftSummary(shift.id).expectedCents, 19500);
  const newOrder = await store.createDraft(draftData()); await store.payOrder(newOrder.id, 10000);
  assert.equal(store.getState().shifts[0].varianceCents, -50);
});

test('unavailable item or option blocks draft/payment while price snapshots remain immutable', async () => {
  const store = createEngine(); await store.openShift(10000); const order = await store.createDraft(draftData());
  await store.updateMenuItem('huarache', { priceCents: 15000 });
  assert.equal(store.getOrder(order.id).totalCents, 9500);
  await store.updateMenuOption('huarache', 'blue', { available: false });
  await assert.rejects(store.payOrder(order.id, 10000), /sold out/); assert.equal(store.getState().payments.length, 0);
  await assert.rejects(store.createDraft(draftData()), /modifier is unavailable/);
  await store.updateMenuOption('huarache', 'blue', { available: true });
  await store.updateMenuItem('huarache', { available: false });
  await assert.rejects(store.payOrder(order.id, 10000), /sold out/);
});

test('failed durable save rolls back the cash transaction instead of dispatching it', async () => {
  let fail = false; const store = createEngine({ persist: async () => { if (fail) throw new Error('Disk unavailable'); } });
  await store.openShift(20000); const order = await store.createDraft(draftData()); fail = true;
  await assert.rejects(store.payOrder(order.id, 10000), /Disk unavailable/);
  assert.equal(store.getState().payments.length, 0); assert.equal(store.getOrder(order.id).status, 'draft');
});

test('concurrent stale kitchen actions cannot skip a fulfillment stage', async () => {
  const store = createEngine(); await store.openShift(0); const order = await store.createDraft(draftData()); await store.payOrder(order.id, 9500);
  const results = await Promise.allSettled([store.advanceOrder(order.id, 'pending'), store.advanceOrder(order.id, 'pending')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(store.getOrder(order.id).status, 'preparing');
});

test('restart safely recovers paid receipts with no pulse reservation and marks uncertain reservations unknown', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'masaflow-recovery-'));
  const store = createEngine(); await store.openShift(0);
  const first = await store.createDraft(draftData()); const firstPayment = (await store.payOrder(first.id, 10000)).payment;
  const second = await store.createDraft(draftData()); const secondPayment = (await store.payOrder(second.id, 10000)).payment;
  await store.reserveHardwareJob(`payment:${secondPayment.id}`, secondPayment.id);
  await fs.writeFile(path.join(directory, 'state.json'), JSON.stringify(store.getState()));
  const service = await createService({ dataDirectory: directory, printerHost: '' }); t.after(async () => { await service.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const state = service.engine.getState();
  assert.equal(state.payments.find(p => p.id === firstPayment.id).drawerKickStatus, 'simulated');
  assert.equal(state.payments.find(p => p.id === secondPayment.id).drawerKickStatus, 'unknown');
  assert.equal(state.hardwareJobs.length, 2);
});

test('null legacy records do not block startup pulse recovery or duplicate payment and pulse prevention', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'masaflow-null-recovery-'));
  const store = createEngine(); await store.openShift(0);
  const order = await store.createDraft(draftData()); const payment = (await store.payOrder(order.id, 10000)).payment;
  const state = store.getState(); state.hardwareJobs.unshift(null); state.payments.unshift(null); state.orders.unshift(null);
  await fs.writeFile(path.join(directory, 'state.json'), JSON.stringify(state));
  const service = await createService({ dataDirectory: directory, printerHost: '' }); t.after(async () => { await service.close(); await fs.rm(directory, { recursive: true, force: true }); });
  assert.equal(service.engine.getState().payments.find(p => p && p.id === payment.id).drawerKickStatus, 'simulated');
  const retry = await service.engine.payOrder(order.id, 10000);
  assert.equal(retry.alreadyPaid, true); assert.equal(retry.payment.id, payment.id);
  assert.equal((await service.kick(payment.id)).duplicate, true);
  assert.equal(service.engine.getState().hardwareJobs.filter(Boolean).length, 1);
  assert.equal(service.engine.verifiedReceipts().receipts.length, 1); assert.equal(service.engine.verifiedReceipts().excluded, 1);
});

test('service persists payment, automatically pulses exact ESC/POS bytes, and suppresses duplicate pulses across restart', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'masaflow-test-'));
  const received = []; const printer = net.createServer(socket => { let data = Buffer.alloc(0); socket.on('data', bytes => { data = Buffer.concat([data, bytes]); }); socket.on('end', () => { received.push(data); socket.end(); }); });
  await new Promise(resolve => printer.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => printer.close(resolve)));
  const config = { dataDirectory: directory, printerHost: '127.0.0.1', printerPort: printer.address().port };
  let service = await createService(config);
  async function listen() { await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${service.server.address().port}`; }
  let url = await listen(); t.after(async () => { await service.close(); await fs.rm(directory, { recursive: true, force: true }); });
  async function action(name, ...args) { const response = await fetch(`${url}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: name, args }) }); const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body.result; }
  await action('openShift', 20000, 'QA'); const order = await action('createDraft', draftData());
  const response = await fetch(`${url}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'payOrder', args: [order.id, 1000] }) }); assert.equal(response.status, 400);
  const paid = await action('payOrder', order.id, 10000, 'QA'); assert.equal(received.length, 1); assert.deepEqual(received[0], DRAWER_PULSE);
  await action('payOrder', order.id, 20000, 'QA'); assert.equal(received.length, 1);
  const crossOrigin = await fetch(`${url}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' }, body: JSON.stringify({ action: 'openShift', args: [0] }) }); assert.equal(crossOrigin.status, 403);
  const invalidKick = await fetch(`${url}/api/cash-drawer/kick`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId: order.id }) }); assert.equal(invalidKick.status, 400);
  await service.close(); service = await createService(config); url = await listen();
  assert.equal(service.engine.getOrder(order.id).paymentStatus, 'paid');
  const retry = await fetch(`${url}/api/cash-drawer/kick`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId: paid.payment.id }) }); const pulse = await retry.json(); assert.equal(pulse.duplicate, true); assert.equal(received.length, 1);
});
