'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createService } = require('../legacy-server.cjs');
const { initialState } = require('../assets/masaflow-store.js');

async function service(t, options = {}) {
  const directory = options.dataDirectory || await fs.mkdtemp(path.join(os.tmpdir(), 'masaflow-api-'));
  const app = await createService({ dataDirectory: directory, summaryOptions: { apiKey: '' }, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  return { ...app, url: `http://127.0.0.1:${app.server.address().port}` };
}
const action = (url, name, args) => fetch(`${url}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: name, args }) });

test('analytics API shares committed revisions with payments, source evidence and drawer balances', async t => {
  const app = await service(t);
  await action(app.url, 'openShift', [50000]);
  const input = { submissionId: crypto.randomUUID(), customerName: 'Ana', orderType: 'takeout', items: [{ menuItemId: 'sope', quantity: 2, optionIds: ['white'] }] };
  const first = await (await action(app.url, 'createDraft', [input])).json();
  const repeat = await (await action(app.url, 'createDraft', [input])).json(); assert.equal(first.result.id, repeat.result.id);
  const conflict = await action(app.url, 'createDraft', [{ ...input, customerName: 'Other' }]); assert.equal(conflict.status, 409);
  const paid = await (await action(app.url, 'payOrder', [first.result.id, 10000])).json();
  const dto = await (await fetch(`${app.url}/api/analytics?view=sales&period=day&lang=en`)).json();
  assert.equal(dto.revision, paid.state.revision); assert.equal(dto.scope.tab, 'owner'); assert.equal(dto.scope.lang, 'en');
  assert.equal(dto.sales.receiptsCents, 7000); assert.equal(dto.operations.currentShift.expectedCents, 57000);
  assert.equal(dto.sales.recentReceipts[0].orderId, first.result.id); assert.equal(dto.summaryAvailable, false);
  const unavailable = await fetch(`${app.url}/api/analytics/summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: dto.scope, locale: 'en', revision: dto.revision }) }); assert.equal(unavailable.status, 503);
  const stale = await fetch(`${app.url}/api/analytics/summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: dto.scope, locale: 'en', revision: 0 }) }); assert.equal(stale.status, 409);
  const css = await fetch(`${app.url}/assets/masaflow.css`); assert.equal(css.status, 200); assert.match(css.headers.get('content-type'), /text\/css/);
  const saved = JSON.parse(await fs.readFile(app.dataFile, 'utf8')); assert.equal(saved.revision, dto.revision);
});

test('version-one records migrate durably without converting USD, requiring legacy shift close', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'masaflow-legacy-'));
  const legacy = initialState(); legacy.version = 1; legacy.settings.currency = 'USD'; legacy.settings.timeZone = 'America/Los_Angeles';
  legacy.menu.forEach(item => { delete item.currency; item.options.forEach(option => { delete option.currency; }); });
  legacy.shifts.push({ id: 'old-shift', floatCents: 2000, cashierId: 'Legacy', openedAt: '2026-09-30T10:00:00.000Z', closedAt: null });
  await fs.writeFile(path.join(directory, 'state.json'), JSON.stringify(legacy));
  const app = await service(t, { dataDirectory: directory });
  const saved = JSON.parse(await fs.readFile(app.dataFile, 'utf8'));
  assert.equal(saved.version, 2); assert.equal(saved.settings.currency, 'MXN'); assert.equal(saved.menu[0].currency, 'USD'); assert.equal(saved.menu[0].priceCents, 8500);
  assert.equal(saved.shifts[0].currency, 'USD'); assert.equal(saved.shifts[0].floatCents, 2000);
  assert.equal((await action(app.url, 'openShift', [50000])).status, 400);
  assert.equal((await action(app.url, 'closeShift', [2000])).status, 200);
  const opened = await (await action(app.url, 'openShift', [50000])).json(); assert.equal(opened.result.currency, 'MXN');
});

test('summary API rejects cross-origin actions and accepts an explicitly requested localized aggregate summary', async t => {
  let requests = 0;
  const app = await service(t, { summaryOptions: { apiKey: 'test-only', fetchImpl: async () => { requests++; return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ headline: 'sales_overview', findings: [{ metricId: 'ticket_count', commentary: 'scope_total' }] }) } }] }) }; } } });
  const dto = await (await fetch(`${app.url}/api/analytics?tab=owner&lang=en`)).json();
  const data = { scope: dto.scope, locale: 'en', revision: dto.revision };
  const foreign = await fetch(`${app.url}/api/analytics/summary`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example' }, body: JSON.stringify(data) }); assert.equal(foreign.status, 403); assert.equal(requests, 0);
  const response = await fetch(`${app.url}/api/analytics/summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); assert.equal(response.status, 200);
  const summary = await response.json(); assert.equal(summary.summary.headline, 'Sales summary'); assert.equal(summary.summary.findings[0].value, 0); assert.equal(requests, 1);
});

test('an inconsistent legacy hardware receipt does not block service startup or leak into analytics', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'masaflow-invalid-recovery-'));
  const state = initialState(); state.payments.push({ id: 'invalid-payment', orderId: 'missing-order', drawerKickStatus: 'pending' });
  await fs.writeFile(path.join(directory, 'state.json'), JSON.stringify(state));
  const app = await service(t, { dataDirectory: directory });
  assert.equal(app.engine.getState().hardwareJobs.length, 0);
  const dto = await (await fetch(`${app.url}/api/analytics`)).json(); assert.equal(dto.quality.excludedReceipts, 1); assert.equal(dto.sales.ticketCount, 0);
  assert.equal('drawerExceptions' in dto.operations, false);
});
