'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { createEngine } = require('../assets/masaflow-store.js');

const root = path.join(__dirname, '..');
const copy = value => JSON.parse(JSON.stringify(value));
async function mixedCurrencyState() {
  const engine = createEngine(); await engine.openShift(10000, 'Cashier');
  for (let index = 0; index < 3; index++) {
    const order = await engine.createDraft({ customerName: 'Guest', items: [{ menuItemId: 'huarache', quantity: 1, optionIds: ['white'] }] });
    await engine.payOrder(order.id, 10000);
  }
  const state = engine.getState();
  // A preserved USD shift is still open while the MXN receipts are historical.
  state.shifts[0].currency = 'USD';
  state.shifts.push({ ...state.shifts[0], id: 'mxn-shift', currency: 'MXN', closedAt: new Date().toISOString(), expectedCentsAtClose: 17000, actualCents: 17000, varianceCents: 0 });
  state.orders[0].currency = state.payments[0].currency = 'USD';
  state.orders[0].items.forEach(line => { line.currency = 'USD'; line.options.forEach(option => { option.currency = 'USD'; }); });
  state.payments[1].shiftId = state.payments[2].shiftId = 'mxn-shift';
  state.payments[2].currency = 'USD'; // An inconsistent record the shared validator must exclude everywhere.
  return state;
}
async function printedSummary(state) {
  const engine = createEngine({ state }); let printed = '';
  const popup = { document: { open() {}, write(html) { printed += html; }, close() {} }, focus() {}, print() {} };
  const sandbox = {
    window: { MasaFlow: engine, open: () => popup },
    document: { addEventListener() {}, querySelector: () => null },
    console, Intl, Date, setTimeout
  };
  vm.runInNewContext(await fs.readFile(path.join(root, 'assets/masaflow-ui.js'), 'utf8'), sandbox);
  sandbox.window.MasaFlowUI.printDailySummary();
  return { html: printed, engine };
}
async function actualFunction(name) {
  const html = await fs.readFile(path.join(root, 'apps/html/history.html'), 'utf8');
  const match = html.match(new RegExp(`  function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}`));
  assert.ok(match, `Cannot find ${name} in the ledger screen`);
  return match[0];
}

test('daily print uses verified receipts, keeps USD and MXN apart, and formats the legacy drawer in USD', async () => {
  const { html, engine } = await printedSummary(await mixedCurrencyState());
  const verified = engine.verifiedReceipts();
  assert.equal(verified.receipts.length, 2); assert.equal(verified.excluded, 1);
  assert.match(html, /<h2>MXN<\/h2>[\s\S]*?<span>Cash receipts<\/span><b>\$85\.00<\/b>/);
  assert.match(html, /<h2>USD<\/h2>[\s\S]*?<span>Cash receipts<\/span><b>USD\s?85\.00<\/b>/);
  assert.match(html, /<span>Expected in drawer<\/span><b>USD\s?185\.00<\/b>/);
  assert.match(html, /<span>Inconsistent cash receipts excluded \(all dates\)<\/span><b>1<\/b>/);
  assert.ok(!html.includes('255.00'), 'Invalid receipts or mixed-currency totals reached the printout');
});

test('an empty daily print leaves average ticket absent', async () => {
  const { html } = await printedSummary(createEngine().getState());
  assert.match(html, /<span>Average ticket<\/span><b>—<\/b>/);
  assert.match(html, /<span>Paid orders<\/span><b>0<\/b>/);
});

test('ledger rows use the same exclusions as analytics for bad currencies, duplicate IDs and null records', async () => {
  const source = await actualFunction('ledgerRows');
  const baseline = await mixedCurrencyState();
  for (const mutate of [
    state => {},
    state => { state.payments.push(copy(state.payments[0])); },
    state => { state.orders[1].items[0].lineTotalCents++; },
    state => { state.payments.push(null); state.orders.push(null); }
  ]) {
    const state = copy(baseline); mutate(state); const engine = createEngine({ state });
    const sandbox = { MasaFlow: engine, filters: { scope: 'all', status: 'all', search: '' }, dayBounds: () => ['', ''], STATUS: {}, Date };
    vm.runInNewContext(`${source}; this.result = ledgerRows(MasaFlow.getState());`, sandbox);
    assert.equal(sandbox.result.total, engine.verifiedReceipts().receipts.length);
    assert.equal(sandbox.result.excluded, engine.verifiedReceipts().excluded);
    assert.equal(sandbox.result.rows.length, engine.verifiedReceipts().receipts.length);
  }
});

test('ledger CSV records an explicit currency for every exported amount', async () => {
  const state = await mixedCurrencyState(); const engine = createEngine({ state }); let blob;
  const sandbox = {
    exportRows: engine.verifiedReceipts().receipts, today: '2026-10-01', STATUS: {},
    plainMoney: cents => (cents / 100).toFixed(2), csvCell: value => String(value),
    URL: { createObjectURL(value) { blob = value; return 'blob:test'; }, revokeObjectURL() {} }, Blob,
    document: { createElement: () => ({ click() {}, remove() {} }), body: { append() {} } },
    MasaFlowUI: { toast() {} }, setTimeout: () => {}
  };
  vm.runInNewContext(`${await actualFunction('exportCsv')}; exportCsv();`, sandbox);
  const text = await blob.text();
  assert.match(text, /Items,Currency,Total,Tendered,Change/);
  assert.match(text, /,USD,85\.00,100\.00,15\.00,/);
  assert.match(text, /,MXN,85\.00,100\.00,15\.00,/);
  assert.equal(text.trim().split('\r\n').length, 3);
});
