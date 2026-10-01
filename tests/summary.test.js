'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { initialState, createEngine } = require('../assets/masaflow-store.js');
const { createSummaryService, summaryInput } = require('../shared/sales-summary.js');
const { buildAnalytics } = require('../shared/analytics.js');
const clock = Date.parse('2026-09-30T18:00:00.000Z');
const scope = { tab: 'owner', period: 'day', date: '2026-09-30', lang: 'es' };
const request = state => ({ scope, locale: 'es', revision: state.revision });
const choice = { headline: 'sales_overview', findings: [{ metricId: 'cash_receipts', commentary: 'scope_total' }, { metricId: 'ticket_count', commentary: 'scope_total' }] };
const response = selection => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(selection) } }] }) });

test('absent credentials is unavailable and stale/unnormalized scope is rejected before generation', async () => {
  const state = initialState(); const service = createSummaryService({ getState: () => state, apiKey: '', now: () => clock });
  assert.equal(service.available(), false);
  await assert.rejects(service.summarize(request(state)), { code: 'SUMMARY_UNAVAILABLE', statusCode: 503 });
  await assert.rejects(service.summarize({ ...request(state), revision: 1 }), { code: 'STALE_SCOPE' });
  await assert.rejects(service.summarize({ ...request(state), scope: { ...scope, date: 'bad' } }), { code: 'INVALID_SCOPE' });
  await assert.rejects(service.summarize({ ...request(state), locale: 'en' }), { code: 'STALE_SCOPE' });
});

test('concurrent identical requests deduplicate and cache for five minutes; numbers are authoritative', async () => {
  const state = initialState(); let calls = 0, time = clock;
  const service = createSummaryService({ getState: () => state, apiKey: 'test-only', now: () => time, fetchImpl: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return response(choice); } });
  const [a, b] = await Promise.all([service.summarize(request(state)), service.summarize(request(state))]);
  assert.equal(calls, 1); assert.deepEqual(a, b); assert.equal(a.summary.findings[0].value, 0);
  assert.equal(a.summary.findings[0].unit, 'MXN'); assert.equal(a.summary.headline, 'Resumen de ventas');
  assert.equal((await service.summarize(request(state))).cached, true);
  time += 300001; await service.summarize(request(state)); assert.equal(calls, 2);
});

test('Gateway receives aggregate definitions without customer, cashier or raw transaction records', async () => {
  const engine = createEngine(); await engine.openShift(50000, 'SECRET CASHIER');
  const draft = await engine.createDraft({ customerName: 'SECRET CUSTOMER', orderType: 'takeout', items: [{ menuItemId: 'sope', quantity: 1, optionIds: ['white'] }] }); await engine.payOrder(draft.id, 5000, 'SECRET CASHIER');
  const state = engine.getState(); state.orders[0].paidAt = state.payments[0].paidAt = new Date(clock).toISOString(); let body;
  const service = createSummaryService({ getState: () => state, apiKey: 'test-only', now: () => clock, fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return response(choice); } });
  const result = await service.summarize(request(state));
  assert.equal(result.summary.findings[0].value, 3500);
  const sent = JSON.stringify(body); assert.ok(!sent.includes('SECRET')); assert.ok(!sent.includes(draft.id)); assert.ok(!sent.includes('test-only'));
  assert.ok(sent.includes('metric')); assert.ok(sent.includes('definition')); assert.equal(body.model, 'openai/gpt-6-luna');
  const aggregate = summaryInput(buildAnalytics(state, scope, { observedAt: new Date(clock).toISOString() }));
  assert.ok(!('payments' in aggregate)); assert.ok(!('recentReceipts' in aggregate));
});

test('malformed, unsupported, duplicated and action-bearing summaries are rejected', async () => {
  const state = initialState();
  for (const selection of [null, { ...choice, headline: 'Sales will rise tomorrow' }, { ...choice, findings: [{ metricId: 'cash_receipts', commentary: 'scope_total', value: 999 }] }, { ...choice, findings: [{ metricId: 'forecast', commentary: 'scope_total' }] }, { ...choice, findings: [choice.findings[0], choice.findings[0]] }, { ...choice, findings: [{ metricId: 'cash_receipts', commentary: 'drawer_balance' }] }]) {
    const service = createSummaryService({ getState: () => state, apiKey: 'test-only', now: () => clock, fetchImpl: async () => response(selection) });
    await assert.rejects(service.summarize(request(state)), { code: 'INVALID_SUMMARY' });
  }
});

test('provider errors and timeout are bounded and return retryable errors without credentials', async () => {
  const state = initialState();
  const failed = createSummaryService({ getState: () => state, apiKey: 'sensitive-test-secret', now: () => clock, fetchImpl: async () => ({ ok: false }) });
  await assert.rejects(failed.summarize(request(state)), error => error.code === 'GATEWAY_ERROR' && !error.message.includes('sensitive'));
  const slow = createSummaryService({ getState: () => state, apiKey: 'test-only', now: () => clock, timeoutMs: 10, fetchImpl: async () => new Promise(() => {}) });
  await assert.rejects(slow.summarize(request(state)), { code: 'SUMMARY_TIMEOUT', statusCode: 504 });
  const slowBody = createSummaryService({ getState: () => state, apiKey: 'test-only', now: () => clock, timeoutMs: 10, fetchImpl: async () => ({ ok: true, json: async () => new Promise(() => {}) }) });
  await assert.rejects(slowBody.summarize(request(state)), { code: 'SUMMARY_TIMEOUT', statusCode: 504 });
});

test('rolling hourly limit counts new calls while cached requests remain available', async () => {
  const state = initialState(); let time = clock, calls = 0;
  const service = createSummaryService({ getState: () => state, apiKey: 'test-only', now: () => time, fetchImpl: async () => { calls++; return response(choice); } });
  for (let day = 1; day <= 10; day++) await service.summarize({ ...request(state), scope: { ...scope, date: `2026-09-${String(day).padStart(2, '0')}` } });
  await assert.rejects(service.summarize(request(state)), { code: 'SUMMARY_RATE_LIMIT', statusCode: 429 });
  assert.equal(calls, 10);
  assert.equal((await service.summarize({ ...request(state), scope: { ...scope, date: '2026-09-01' } })).cached, true);
  time += 3600001; await service.summarize(request(state)); assert.equal(calls, 11);
});

test('a revision changing during generation cannot return a stale summary', async () => {
  const state = initialState();
  const service = createSummaryService({ getState: () => state, apiKey: 'test-only', now: () => clock, fetchImpl: async () => { state.revision++; return response(choice); } });
  await assert.rejects(service.summarize({ scope, locale: 'es', revision: 0 }), { code: 'STALE_SCOPE', statusCode: 409 });
});
