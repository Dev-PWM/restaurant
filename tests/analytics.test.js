'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine, verifiedReceipts, shiftSummary, initialState } = require('../assets/masaflow-store.js');
const { buildAnalytics, normalizeScope, dateParts } = require('../shared/analytics.js');

const input = quantity => ({ customerName: 'PRIVATE CUSTOMER', orderType: 'takeout', items: [{ menuItemId: 'huarache', quantity, optionIds: ['white', 'cheese'] }] });
async function fixture(times) {
  const engine = createEngine(); await engine.openShift(50000);
  for (const time of times) { const draft = await engine.createDraft(input(1)); await engine.payOrder(draft.id, 10000); }
  const state = engine.getState();
  state.payments.forEach((payment, index) => { payment.paidAt = times[index]; state.orders[index].paidAt = times[index]; });
  return state;
}
const observedAt = '2026-10-01T06:30:00.000Z'; // 00:30 in Mexico City, 23:30 the prior day in Los Angeles.
const scope = { tab: 'owner', period: 'day', date: '2026-09-30', lang: 'es' };

test('payment-time recognition uses Mexico City boundaries and reconciles exact evidence', async () => {
  const state = await fixture(['2026-09-30T05:59:59.999Z', '2026-09-30T06:00:00.000Z', '2026-10-01T05:59:59.999Z', '2026-10-01T06:00:00.000Z']);
  const dto = buildAnalytics(state, scope, { observedAt });
  assert.equal(dto.sales.ticketCount, 2); assert.equal(dto.sales.receiptsCents, 19000);
  assert.equal(dto.sales.subtotalCents, 19000); assert.equal(dto.sales.averageCents, 9500);
  assert.equal(dto.sales.buckets.reduce((sum, row) => sum + row.receiptsCents, 0), dto.sales.receiptsCents);
  assert.equal(dto.sales.buckets[0].ticketCount, 1); assert.equal(dto.sales.buckets[23].ticketCount, 1);
  assert.equal(dto.sales.topItems[0].quantity, 2);
  assert.equal(dto.sales.recentReceipts.reduce((sum, row) => sum + row.totalCents, 0), dto.sales.receiptsCents);
  assert.equal(dto.operations.activeCount, 4); // The live queue is independent of sales date.
  assert.equal(dto.operations.currentShift.expectedCents, 50000 + 38000);
  assert.equal(dto.timeZone, 'America/Mexico_City'); assert.equal(dto.observedAt, observedAt);
});

test('pickup cohort uses today completion time including overnight receipts, with invalid durations disclosed', async () => {
  const state = await fixture(['2026-10-01T05:50:00.000Z', '2026-10-01T06:00:00.000Z', '2026-10-01T06:00:00.000Z', '2026-09-30T12:00:00.000Z']);
  const completions = ['2026-10-01T06:10:00.000Z', '2026-10-01T06:10:00.000Z', '2026-10-01T05:59:00.000Z', '2026-09-30T12:10:00.000Z'];
  state.orders.forEach((order, i) => { order.status = 'completed'; order.completedAt = completions[i]; });
  const dto = buildAnalytics(state, scope, { observedAt });
  assert.equal(dto.operations.medianPickupMinutes, 15); assert.equal(dto.operations.completedSampleCount, 2);
  assert.equal(dto.operations.completedDate, '2026-10-01'); assert.equal(dto.quality.invalidCompletionTimes, 1);
  assert.equal(dto.operations.activeCount, 0);
});

test('empty periods have zero buckets, absent averages and medians, without fabricated samples', () => {
  const dto = buildAnalytics(initialState(), scope, { observedAt });
  assert.equal(dto.sales.averageCents, null); assert.equal(dto.sales.receiptsCents, 0);
  assert.equal(dto.sales.buckets.length, 24); assert.equal(dto.operations.medianPickupMinutes, null);
  assert.equal(dto.operations.oldestAgeMinutes, null); assert.equal(dto.operations.completedSampleCount, 0);
  assert.deepEqual(dto.sales.recentReceipts, []);
});

test('normalized links preserve valid scope and reject impossible dates; weeks start Monday', () => {
  const params = new URLSearchParams('view=sales&period=week&date=2026-09-30&lang=en');
  assert.deepEqual(normalizeScope(params, 'America/Mexico_City', observedAt), { tab: 'owner', view: 'owner', period: 'week', date: '2026-09-30', lang: 'en', startDate: '2026-09-28', endDate: '2026-10-05' });
  assert.equal(normalizeScope({ period: 'nonsense', date: '2026-02-30' }, 'America/Mexico_City', observedAt).date, '2026-10-01');
  assert.equal(normalizeScope({ period: 'month', date: '2024-02-29' }).endDate, '2024-03-01');
  assert.equal(normalizeScope({ period: 'year', date: '2026-12-31' }).endDate, '2027-01-01');
});

test('inconsistent receipts are excluded identically in analytics and live drawer calculations; closed audits stay frozen', async () => {
  const state = await fixture(['2026-09-30T12:00:00.000Z']);
  const shift = state.shifts[0]; Object.assign(shift, { closedAt: '2026-09-30T20:00:00.000Z', expectedCentsAtClose: 59500, actualCents: 59400, varianceCents: -100 });
  state.payments[0].changeCents += 1;
  assert.equal(verifiedReceipts(state).excluded, 1);
  const dto = buildAnalytics(state, scope, { observedAt });
  assert.equal(dto.sales.receiptsCents, 0); assert.equal(dto.quality.excludedReceipts, 1);
  assert.equal(shiftSummary(state, shift.id).salesCents, 0);
  assert.equal(shiftSummary(state, shift.id).expectedCents, 59500);
  assert.equal(dto.operations.latestAudit.varianceCents, -100);
  assert.equal(dto.operations.latestAudit.expectedCents, 59500);
});

test('currency totals remain separate and historical menu edits cannot reprice receipts', async () => {
  const state = await fixture(['2026-09-30T12:00:00.000Z', '2026-09-30T13:00:00.000Z']);
  const legacyShift = { ...state.shifts[0], id: 'legacy-shift', currency: 'USD', closedAt: '2026-09-30T14:00:00.000Z', expectedCentsAtClose: 50000, actualCents: 50000, varianceCents: 0 }; state.shifts.push(legacyShift);
  Object.assign(state.orders[0], { currency: 'USD' }); state.orders[0].items.forEach(line => { line.currency = 'USD'; line.options.forEach(option => { option.currency = 'USD'; }); });
  Object.assign(state.payments[0], { currency: 'USD', shiftId: legacyShift.id });
  state.menu[0].priceCents = 100000;
  const dto = buildAnalytics(state, scope, { observedAt });
  assert.equal(dto.sales.receiptsCents, 9500); assert.equal(dto.sales.ticketCount, 1);
  assert.deepEqual(dto.currencyTotals, [{ currency: 'MXN', receiptsCents: 9500, ticketCount: 1 }, { currency: 'USD', receiptsCents: 9500, ticketCount: 1 }]);
  assert.equal(dto.sales.topItems[0].receiptsCents, 9500);
  assert.equal(dto.operations.latestAudit.currency, 'USD');
});

test('tax snapshots reconcile gross receipts and subtotal', async () => {
  const state = initialState(); state.settings.taxBasisPoints = 1000; state.settings.taxConfigured = true;
  const engine = createEngine({ state }); await engine.openShift(0);
  const draft = await engine.createDraft(input(1)); await engine.payOrder(draft.id, 20000);
  const saved = engine.getState(); saved.orders[0].paidAt = saved.payments[0].paidAt = '2026-09-30T12:00:00.000Z';
  const dto = buildAnalytics(saved, scope, { observedAt });
  assert.equal(dto.sales.subtotalCents, 9500); assert.equal(dto.sales.taxCents, 950); assert.equal(dto.sales.receiptsCents, 10450);
  assert.equal(dto.taxConfigured, true); assert.equal(dto.taxBasisPoints, 1000);
  const definition = dto.metricDefinitions.find(metric => metric.id === 'tax_collected').definition;
  assert.match(definition, /10%/); assert.ok(!definition.includes('sin configurar'));
});

test('strict completion timestamps exclude impossible calendar days and timezone-free datetimes', async () => {
  const state = await fixture(['2026-02-01T12:00:00.000Z', '2026-10-01T06:00:00.000Z', '2026-10-01T06:00:00.000Z']);
  const completions = ['2026-02-30T12:00:00.000Z', '2026-10-01T06:10:00', '2026-10-01T06:15:00.000Z'];
  state.orders.forEach((order, i) => { order.status = 'completed'; order.completedAt = completions[i]; });
  const dto = buildAnalytics(state, scope, { observedAt });
  assert.equal(dto.quality.invalidCompletionTimes, 2); assert.equal(dto.operations.completedSampleCount, 1);
  assert.equal(dto.operations.medianPickupMinutes, 15);
  assert.equal(dateParts('2026-02-30T12:00:00.000Z', 'America/Mexico_City'), null);
  assert.equal(dateParts('2026-10-01T06:10:00', 'America/Mexico_City'), null);
});

test('malformed audit records are excluded while legacy hardware metadata stays out of analytics', async () => {
  const state = await fixture(['2026-09-30T12:00:00.000Z']);
  state.shifts.push(null);
  const validAudit = { id: 'valid-audit', currency: 'USD', openedAt: '2026-09-30T12:00:00.000Z', closedAt: '2026-09-30T20:00:00.000Z', floatCents: 1000, expectedCentsAtClose: 3500, actualCents: 3450, varianceCents: -50 };
  state.shifts.push(validAudit);
  const mutations = [
    audit => { audit.currency = 'EUR'; },
    audit => { audit.closedAt = '2026-02-30T12:00:00.000Z'; },
    audit => { audit.expectedCentsAtClose = -1; },
    audit => { audit.actualCents = 3450.5; },
    audit => { audit.varianceCents = 50; },
    audit => { audit.id = ''; }
  ];
  mutations.forEach((mutate, index) => { const audit = { ...validAudit, id: `bad-audit-${index}`, closedAt: '2026-10-01T06:30:00.000Z' }; mutate(audit); state.shifts.push(audit); });
  state.hardwareJobs.push(null, { key: 'manual:test', paymentId: null, status: 'failed', createdAt: '2026-09-30T20:00:00.000Z' });
  const snapshot = JSON.parse(JSON.stringify(state));
  const dto = buildAnalytics(state, scope, { observedAt });
  assert.equal(dto.quality.invalidAudits, 6); assert.equal(dto.operations.latestAudit.id, 'valid-audit');
  assert.equal(dto.operations.latestAudit.expectedCents, 3500); assert.equal(dto.operations.latestAudit.varianceCents, -50);
  assert.equal(dto.operations.latestAudit.currency, 'USD'); assert.equal(dto.operations.currentShift.currency, 'MXN');
  assert.equal(dto.metricDefinitions.find(metric => metric.id === 'drawer_variance').unit, 'USD');
  assert.equal('drawerExceptions' in dto.operations, false);
  assert.equal(dto.sales.receiptsCents, 9500); assert.deepEqual(state, snapshot);
});

test('audit chronology compares timestamps rather than timezone-offset text', () => {
  const state = initialState();
  const audit = (id, closedAt) => ({ id, closedAt, currency: 'MXN', expectedCentsAtClose: 10000, actualCents: 10000, varianceCents: 0 });
  state.shifts.push(audit('earlier', '2026-09-30T21:00:00+02:00'), audit('later', '2026-09-30T20:00:00Z'));
  const dto = buildAnalytics(state, scope, { observedAt });
  assert.equal(dto.operations.latestAudit.id, 'later'); assert.equal(dto.quality.invalidAudits, 0);
});

test('queue and recent receipt chronology use actual instants for preserved timezone offsets', async () => {
  const state = await fixture(['2026-09-30T21:00:00+02:00', '2026-09-30T20:00:00Z']);
  const dto = buildAnalytics(state, scope, { observedAt });
  assert.deepEqual(dto.operations.activeOrders.map(order => order.id), state.orders.map(order => order.id));
  assert.deepEqual(dto.sales.recentReceipts.map(order => order.orderId), state.orders.map(order => order.id).reverse());
  assert.ok(dto.operations.activeOrders[0].ageMinutes > dto.operations.activeOrders[1].ageMinutes);
});
