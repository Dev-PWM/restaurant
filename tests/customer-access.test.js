'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createService } = require('../server.js');
const { createStaffAccess } = require('../shared/staff-access.js');
const PASSWORD = 'test-only-staff-password';
const input = name => ({ submissionId: crypto.randomUUID(), customerName: name, customerPhone: '5551234567', orderType: 'takeout', items: [{ menuItemId: 'huarache', quantity: 1, optionIds: ['white', 'cheese'], notes: 'Salsa on the side' }] });
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'masaflow-access-'));
  const app = await createService({ dataDirectory: directory, printerHost: '', staffPassword: PASSWORD, summaryOptions: { apiKey: '' }, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const request = (url, data, cookie, headers = {}) => fetch(base + url, { method: data ? 'POST' : 'GET', headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const login = async () => { const response = await request('/api/session/login', { password: PASSWORD }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; };
  return { ...app, base, request, login };
}
async function firstEvent(base, scope) {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 3000);
  try {
    const response = await fetch(base + '/api/customer/events' + scope, { signal: abort.signal });
    assert.equal(response.status, 200);
    let text = '';
    for await (const bytes of response.body) {
      text += Buffer.from(bytes).toString('utf8');
      const match = /data: (.+)\n\n/.exec(text);
      if (match) return JSON.parse(match[1]);
    }
    assert.fail('Expected an initial customer event.');
  } finally { clearTimeout(timeout); abort.abort(); }
}

test('customer entrances preserve links while staff pages and every financial API require sign-in', async t => {
  const app = await fixture(t);
  for (const [url, target] of [['/', '/MenuUI.html'], ['/order?lang=en', '/MenuUI.html?lang=en'], ['/track?order=abc', '/readypickupUI.html?order=abc'], ['/pos', '/businessDashbord.html']]) {
    const response = await fetch(app.base + url, { redirect: 'manual' }); assert.equal(response.status, 302); assert.equal(response.headers.get('location'), target);
  }
  for (const page of ['/businessDashbord.html', '/history.html', '/MenuManagment.html', '/metricsDashbord.html', '/analytics/']) {
    const response = await fetch(app.base + page, { redirect: 'manual' }); assert.equal(response.status, 302); assert.match(response.headers.get('location'), /^\/staff-login\.html\?next=/);
  }
  for (const url of ['/api/state', '/api/events', '/api/analytics', '/api/backups']) assert.equal((await app.request(url)).status, 401, url);
  for (const url of ['/api/action', '/api/cash-drawer/kick', '/api/backups/create', '/api/analytics/summary']) assert.equal((await app.request(url, {})).status, 401, url);
  assert.equal((await fetch(app.base + '/%62usinessDashbord.html', { redirect: 'manual' })).status, 302);
  assert.equal((await app.request('/MenuUI.html')).status, 200);
  const health = await (await app.request('/api/health')).json(); assert.equal(health.status, 'ready'); assert.equal(health.backup, undefined);
});

test('public order submission is priced by the server, retries safely, and earns no sales before staff collects cash', async t => {
  const app = await fixture(t), payload = { ...input('Customer One'), totalCents: 1, paymentStatus: 'paid', status: 'ready' };
  const post = () => app.request('/api/customer/orders', { action: 'createDraft', args: [payload] });
  const first = await (await post()).json(), second = await (await post()).json();
  assert.equal(first.result.id, second.result.id); assert.equal(first.result.totalCents, 9500); assert.equal(first.result.status, 'draft'); assert.equal(first.result.paymentStatus, 'unpaid');
  assert.equal(app.engine.getState().orders.length, 1); assert.equal(app.engine.getState().payments.length, 0);
  const cookie = await app.login();
  const action = (name, args) => app.request('/api/action', { action: name, args }, cookie);
  assert.equal((await action('advanceOrder', [first.result.id])).status, 400);
  const before = await (await app.request('/api/analytics?tab=owner', null, cookie)).json(); assert.equal(before.sales.receiptsCents, 0); assert.equal(before.sales.ticketCount, 0);
  await action('openShift', [50000, 'Cashier Private']);
  assert.equal((await action('payOrder', [first.result.id, 1000])).status, 400);
  assert.equal((await action('payOrder', [first.result.id, 10000])).status, 200);
  for (const period of ['day', 'month', 'year']) {
    const dto = await (await app.request('/api/analytics?tab=owner&period=' + period, null, cookie)).json();
    assert.equal(dto.sales.receiptsCents, 9500); assert.equal(dto.sales.ticketCount, 1); assert.equal(dto.sales.topItems[0].quantity, 1);
  }
  const tracked = await (await app.request('/api/customer/state?order=' + first.result.id)).json();
  assert.equal(tracked.orders[0].status, 'pending'); assert.equal(tracked.orders[0].verifiedPaid, true); assert.equal(tracked.payments[0].changeCents, 500);
  assert.equal(tracked.payments[0].cashierId, undefined); assert.equal(tracked.payments[0].shiftId, undefined); assert.equal(tracked.orders[0].customerPhone, undefined);
  const attempt = await app.request('/api/customer/orders', { action: 'payOrder', args: [first.result.id, 10000] }); assert.equal(attempt.status, 400);
  await action('advanceOrder', [first.result.id]); await action('advanceOrder', [first.result.id]); await action('advanceOrder', [first.result.id]);
  assert.equal((await firstEvent(app.base, '?order=' + first.result.id)).orders[0].status, 'completed');
});

test('public menu and board broadcasts omit other customers, tracking UUIDs, ledger records and financial details', async t => {
  const app = await fixture(t);
  await app.engine.openShift(10000, 'Private Cashier');
  const first = await app.engine.createDraft(input('Private Customer A')), second = await app.engine.createDraft(input('Private Customer B'));
  await app.engine.payOrder(first.id, 10000); await app.engine.payOrder(second.id, 10000);
  const menu = await firstEvent(app.base, ''); assert.deepEqual(menu.orders, []); assert.deepEqual(menu.payments, []);
  const board = await firstEvent(app.base, '?board=1'); assert.equal(board.orders.length, 2);
  const text = JSON.stringify(board); for (const secret of [first.id, second.id, first.submissionId, first.customerName, second.customerName, 'Private Cashier', '5551234567']) assert.ok(!text.includes(secret), secret);
  assert.equal(board.orders[0].totalCents, undefined); assert.deepEqual(board.shifts, []); assert.deepEqual(board.audit, []);
  const tracked = await firstEvent(app.base, '?order=' + first.id); assert.equal(tracked.orders.length, 1); assert.equal(tracked.orders[0].id, first.id); assert.ok(!JSON.stringify(tracked).includes(second.id));
  const recovered = await firstEvent(app.base, '?submissionId=' + first.submissionId); assert.equal(recovered.orders[0].id, first.id);
  const unknown = await firstEvent(app.base, '?order=MF-2084'); assert.deepEqual(unknown.orders, []);
});

test('staff cookies are private and revocable; wrong passwords and cross-origin cash actions fail', async t => {
  const app = await fixture(t);
  const wrong = await app.request('/api/session/login', { password: 'incorrect' }); assert.equal(wrong.status, 401);
  const response = await app.request('/api/session/login', { password: PASSWORD }); const header = response.headers.get('set-cookie');
  assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/); assert.ok(!header.includes(PASSWORD));
  const cookie = header.split(';')[0]; assert.equal((await app.request('/api/state', null, cookie)).status, 200);
  const attack = await app.request('/api/action', { action: 'openShift', args: [0] }, cookie, { Origin: 'https://outside.example' }); assert.equal(attack.status, 403);
  await app.request('/api/session/logout', {}, cookie); assert.equal((await app.request('/api/state', null, cookie)).status, 401);
});

test('public HTTPS configuration requires a staff password, uses secure cookies and accepts only its configured origin', async t => {
  assert.throws(() => createStaffAccess({ publicOrigin: 'https://orders.example.com' }), /PASSWORD/);
  assert.throws(() => createStaffAccess({ password: PASSWORD, publicOrigin: 'http://orders.example.com' }), /HTTPS/);
  assert.throws(() => createStaffAccess({ password: 'short' }), /12 to 256/);
  const app = await fixture(t, { publicOrigin: 'https://orders.example.com' });
  const result = await app.request('/api/session/login', { password: PASSWORD }, null, { Origin: 'https://orders.example.com' }); assert.equal(result.status, 200); assert.match(result.headers.get('set-cookie'), /; Secure/);
  assert.equal((await app.request('/api/session/login', { password: PASSWORD }, null, { Origin: 'https://elsewhere.example' })).status, 403);
});

test('staff sessions expire and sign-in attempts are bounded without locking out public ordering', () => {
  let time = 0, cookie;
  const access = createStaffAccess({ password: PASSWORD, now: () => time });
  const req = { headers: {}, socket: { remoteAddress: 'test-client' } }, res = { setHeader: (_name, value) => { cookie = value.split(';')[0]; } };
  access.login(req, res, PASSWORD); req.headers.cookie = cookie; assert.equal(access.authorized(req), true);
  time = 12 * 60 * 60 * 1000; assert.equal(access.authorized(req), false);
  for (let i = 0; i < 10; i++) assert.throws(() => access.login(req, res, 'bad'), { statusCode: 401 });
  assert.throws(() => access.login(req, res, PASSWORD), { statusCode: 429 });
  assert.doesNotThrow(() => access.limitSubmission(req));
  time += 15 * 60 * 1000; access.login(req, res, PASSWORD);
});

test('backup CLI signs in with the configured staff password while the ledger writer is running', async t => {
  const { spawn } = require('node:child_process');
  const app = await fixture(t);
  const before = app.engine.getState().revision;
  const child = spawn(process.execPath, ['scripts/data.cjs', 'backup', '--data-dir', path.dirname(app.dataFile)], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(app.server.address().port), MASAFLOW_STAFF_PASSWORD: PASSWORD }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  assert.equal(code, 0, stderr); assert.equal(JSON.parse(stdout).backup.kind, 'manual');
  assert.ok(!stdout.includes(PASSWORD)); assert.equal(app.engine.getState().revision, before);
});
