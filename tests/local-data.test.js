'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { createEngine, initialState, verifiedReceipts } = require('../assets/masaflow-store.js');
const { createBackupManager, validateState, validateBackup, backupEnvelope, acquireLock, identity, saveBackup, listBackups, pruneAutomatic, prepareRestore, restoreBackup } = require('../shared/local-data.js');
const { createService } = require('../server.js');
const { configuration, probeHealth } = require('../scripts/mac-start.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
const draft = () => ({ submissionId: crypto.randomUUID(), customerName: 'Backup fixture', orderType: 'takeout', items: [{ menuItemId: 'sope', quantity: 1, optionIds: ['white'] }] });
const cleanup = new WeakMap();

async function directory(t) {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'masaflow-backup-test-'));
  const tasks = []; cleanup.set(t, tasks);
  t.after(async () => { for (const close of tasks) await close(); await fs.rm(target, { recursive: true, force: true }); });
  return target;
}
async function service(t, target, options = {}) {
  const app = await createService({ dataDirectory: target, printerHost: '', summaryOptions: { apiKey: '' }, ...options });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  if (cleanup.has(t)) cleanup.get(t).push(() => app.close()); else t.after(() => app.close());
  return { app, url: `http://127.0.0.1:${app.server.address().port}` };
}
async function until(check, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await check(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.fail('Expected backup was not committed before timeout.');
}

test('backup checksums and configuration validate without deleting inconsistent financial evidence', () => {
  const state = initialState(); state.payments.push(null, { id: 'bad-payment', orderId: 'missing' });
  const backup = backupEnvelope(state, 'manual', '2026-10-03T12:00:00.000Z');
  assert.equal(validateBackup(backup).state.payments.length, 2);
  assert.equal(verifiedReceipts(backup.state).excluded, 2);
  const damaged = copy(backup); damaged.state.nextOrderNumber++;
  assert.throws(() => validateBackup(damaged), /checksum/i);
  const changedRevision = copy(backup); changedRevision.revision++;
  assert.throws(() => validateBackup(changedRevision), /revision/i);
  for (const mutate of [s => { s.settings.currency = 'EUR'; }, s => { s.settings.taxBasisPoints = -1; }, s => { s.settings.locale = 'fr'; }, s => { s.settings.timeZone = 'Invalid/Zone'; }, s => { s.orders = {}; }, s => { s.revision = Number.MAX_SAFE_INTEGER + 1; }]) {
    const invalid = copy(state); mutate(invalid); assert.throws(() => validateState(invalid));
  }
});

test('one writer owns each canonical data directory, including symlink aliases', async t => {
  const target = await directory(t), alias = `${target}-link`; await fs.symlink(target, alias); t.after(() => fs.rm(alias, { force: true }));
  const release = await acquireLock(target);
  try {
    assert.equal(await identity(target), await identity(alias));
    await assert.rejects(acquireLock(alias), { code: 'DATA_IN_USE' });
    const state = initialState(); const backup = await saveBackup(target, state);
    await assert.rejects(restoreBackup(alias, path.join(target, 'backups', backup.fileName)), { code: 'DATA_IN_USE' });
  } finally { await release(); }
  const again = await acquireLock(alias); await again();
});

test('backup metadata and private files retain automatic, manual, and safety snapshots', async t => {
  const target = await directory(t), state = initialState();
  const auto = await saveBackup(target, state, 'auto', '2026-10-01T12:00:00.000Z');
  const manual = await saveBackup(target, state, 'manual', '2026-10-02T12:00:00.000Z');
  const safety = await saveBackup(target, state, 'pre-restore', '2026-10-03T12:00:00.000Z');
  assert.deepEqual((await listBackups(target)).map(item => item.fileName), [safety.fileName, manual.fileName, auto.fileName]);
  assert.equal((await fs.stat(path.join(target, 'backups', auto.fileName))).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.join(target, 'backups'))).mode & 0o777, 0o700);
  await fs.writeFile(path.join(target, 'backups', 'manual-damaged.json'), '{}');
  assert.equal((await listBackups(target)).find(item => item.fileName === 'manual-damaged.json').damaged, true);
});

test('thirty-day retention prunes only expired automatic backups', async t => {
  const target = await directory(t), state = initialState(), old = '2026-09-01T00:00:00.000Z';
  const expired = await saveBackup(target, state, 'auto', old);
  const retained = [await saveBackup(target, state, 'manual', old), await saveBackup(target, state, 'pre-restore', old), await saveBackup(target, state, 'auto', '2026-10-02T00:00:00.000Z')];
  await pruneAutomatic(target, Date.parse('2026-10-03T00:00:00.000Z'));
  await assert.rejects(fs.access(path.join(target, 'backups', expired.fileName)), { code: 'ENOENT' });
  for (const entry of retained) await fs.access(path.join(target, 'backups', entry.fileName));
});

test('restore preserves immutable receipts and frozen audits while advancing revision and ticket counter', async t => {
  const target = await directory(t), engine = createEngine(); await engine.openShift(10000);
  const order = await engine.createDraft(draft()); await engine.payOrder(order.id, 5000); await engine.closeShift(13400);
  const source = engine.getState(), originalAudit = copy(source.shifts[0]);
  source.payments.push({ id: 'invalid-payment', orderId: 'missing', drawerKickStatus: 'failed' });
  const metadata = await saveBackup(target, source);
  const current = initialState(); current.revision = 200; current.nextOrderNumber = 8000;
  await fs.writeFile(path.join(target, 'state.json'), JSON.stringify(current));
  const result = await restoreBackup(target, path.join(target, 'backups', metadata.fileName));
  assert.equal(result.revision, 201); assert.equal(result.excludedReceipts, 1); assert.equal(result.safetyBackup.kind, 'pre-restore');
  const restored = JSON.parse(await fs.readFile(path.join(target, 'state.json'), 'utf8'));
  assert.equal(restored.nextOrderNumber, 8000); assert.deepEqual(restored.orders[0], source.orders[0]); assert.deepEqual(restored.shifts[0], originalAudit);
  assert.equal(restored.audit.at(-1).action, 'data_restore'); assert.equal(restored.payments.at(-1).id, 'invalid-payment');
  const safety = validateBackup(JSON.parse(await fs.readFile(path.join(target, 'backups', result.safetyBackup.fileName), 'utf8')));
  assert.deepEqual(safety.state, current);
});

test('damaged backup restore leaves current bytes unchanged and releases its writer lock', async t => {
  const target = await directory(t), current = initialState(); current.revision = 12;
  const bytes = JSON.stringify(current); await fs.writeFile(path.join(target, 'state.json'), bytes);
  const backup = backupEnvelope(initialState(), 'manual'); backup.state.menu[0].priceCents++;
  const file = path.join(target, 'damaged.json'); await fs.writeFile(file, JSON.stringify(backup));
  await assert.rejects(restoreBackup(target, file), /checksum/i);
  assert.equal(await fs.readFile(path.join(target, 'state.json'), 'utf8'), bytes);
  const release = await acquireLock(target); await release();
});

test('restore cannot replace current data if its mandatory safety backup fails', async t => {
  const target = await directory(t), current = initialState(), file = path.join(target, 'source.json');
  const bytes = JSON.stringify(current); await fs.writeFile(path.join(target, 'state.json'), bytes);
  await fs.writeFile(file, JSON.stringify(backupEnvelope(initialState(), 'manual')));
  await fs.writeFile(path.join(target, 'backups'), 'blocks backup-directory creation');
  await assert.rejects(restoreBackup(target, file));
  assert.equal(await fs.readFile(path.join(target, 'state.json'), 'utf8'), bytes);
  const release = await acquireLock(target); await release();
});

test('legacy restore preserves USD amounts and closed audits without converting to MXN', async t => {
  const target = await directory(t), seed = initialState(); seed.settings.currency = 'USD'; seed.settings.timeZone = 'America/Los_Angeles';
  seed.menu.forEach(item => { item.currency = 'USD'; item.options.forEach(option => { option.currency = 'USD'; }); });
  const engine = createEngine({ state: seed }); await engine.openShift(2000);
  const order = await engine.createDraft(draft()); await engine.payOrder(order.id, 5000); await engine.closeShift(5500);
  const legacy = engine.getState(); legacy.version = 1;
  for (const key of ['menu', 'orders', 'payments', 'shifts', 'cashDrops']) legacy[key].forEach(row => { delete row.currency; });
  legacy.menu.forEach(item => item.options.forEach(option => { delete option.currency; }));
  legacy.orders.forEach(row => row.items.forEach(line => { delete line.currency; line.options.forEach(option => { delete option.currency; }); }));
  const file = path.join(target, 'legacy.json'); await fs.writeFile(file, JSON.stringify(backupEnvelope(legacy, 'manual')));
  await restoreBackup(target, file);
  const restored = JSON.parse(await fs.readFile(path.join(target, 'state.json'), 'utf8'));
  assert.equal(restored.version, 2); assert.equal(restored.settings.currency, 'MXN'); assert.equal(restored.payments[0].currency, 'USD');
  assert.equal(restored.payments[0].totalCents, 3500); assert.equal(restored.shifts[0].expectedCentsAtClose, 5500); assert.equal(restored.shifts[0].varianceCents, 0);
  assert.equal(verifiedReceipts(restored).receipts.length, 1);
});

test('restored pending and reserved drawer jobs never replay at service startup', async t => {
  const target = await directory(t), engine = createEngine(); await engine.openShift(10000);
  for (let i = 0; i < 2; i++) { const order = await engine.createDraft(draft()); await engine.payOrder(order.id, 5000); }
  const source = engine.getState(); source.hardwareJobs.push({ key: `payment:${source.payments[0].id}`, paymentId: source.payments[0].id, status: 'reserved', createdAt: new Date().toISOString() });
  const restored = prepareRestore(backupEnvelope(source, 'manual'), null);
  assert.ok(restored.payments.every(row => row.drawerKickStatus === 'unknown')); assert.ok(restored.hardwareJobs.every(row => row.status === 'unknown'));
  await fs.writeFile(path.join(target, 'state.json'), JSON.stringify(restored));
  let connections = 0;
  const printer = net.createServer(socket => { connections++; socket.resume(); socket.end(); });
  await new Promise(resolve => printer.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => printer.close(resolve)));
  const { app } = await service(t, target, { printerHost: '127.0.0.1', printerPort: printer.address().port });
  assert.equal(connections, 0); assert.ok(app.engine.getState().payments.every(row => row.drawerKickStatus === 'unknown'));
});

test('actual service exposes launcher health identity and manual backups without changing financial revision', async t => {
  const target = await directory(t), { app, url } = await service(t, target);
  const config = configuration({ workspace: path.join(__dirname, '..'), env: { MASAFLOW_DATA_DIR: target } }); config.url = url;
  const health = await (await fetch(`${url}/api/health`)).json();
  assert.equal(health.service, 'masaflow'); assert.equal(health.status, 'ready'); assert.equal(health.workspaceId, await identity(target));
  assert.equal((await probeHealth(config)).state, 'ready'); assert.equal(typeof health.backup, 'object');
  const before = app.engine.getState();
  const response = await fetch(`${url}/api/backups/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 200);
  assert.deepEqual(app.engine.getState(), before);
  const metadata = await (await fetch(`${url}/api/backups`)).json();
  assert.ok(metadata.backups.some(item => item.kind === 'auto'));
  assert.ok(metadata.backups.some(item => item.kind === 'manual' && item.revision === before.revision));
  await assert.rejects(createService({ dataDirectory: target }), { code: 'DATA_IN_USE' });
});

test('closed shift receives an automatic backup of its frozen final audit', async t => {
  const target = await directory(t), { app } = await service(t, target);
  await app.engine.openShift(50000); const order = await app.engine.createDraft(draft()); await app.engine.payOrder(order.id, 5000); await app.engine.closeShift(53500);
  const committed = app.engine.getState();
  const metadata = await until(async () => (await listBackups(target)).find(item => item.kind === 'auto' && item.revision === committed.revision));
  const backup = validateBackup(JSON.parse(await fs.readFile(path.join(target, 'backups', metadata.fileName), 'utf8')));
  assert.deepEqual(backup.state.shifts[0], committed.shifts[0]);
});

test('failed service startup releases its data-directory lock', async t => {
  const target = await directory(t); await fs.writeFile(path.join(target, 'state.json'), '{invalid-json');
  await assert.rejects(createService({ dataDirectory: target }));
  const release = await acquireLock(target); await release();
});

test('restoring over damaged current data preserves original bytes and any valid counter baseline', async t => {
  const target = await directory(t), damaged = JSON.stringify({ version: 9, revision: 900, nextOrderNumber: 9000, orders: 'broken' });
  await fs.writeFile(path.join(target, 'state.json'), damaged);
  const source = path.join(target, 'source.json'); await fs.writeFile(source, JSON.stringify(backupEnvelope(initialState(), 'manual')));
  const result = await restoreBackup(target, source);
  assert.equal(result.revision, 901); assert.equal(result.safetyBackup.damaged, true);
  const archive = JSON.parse(await fs.readFile(path.join(target, 'backups', result.safetyBackup.fileName), 'utf8'));
  assert.equal(archive.format, 'masaflow-damaged-state'); assert.equal(archive.rawState, damaged);
  assert.equal(archive.sha256, require('node:crypto').createHash('sha256').update(damaged).digest('hex'));
  assert.equal(JSON.parse(await fs.readFile(path.join(target, 'state.json'), 'utf8')).nextOrderNumber, 9000);
});

test('automatic backup cadence uses changed committed revisions, with forced close and no empty-hour copies', async () => {
  let time = 0; const calls = [];
  const manager = createBackupManager('unused-test-path', { now: () => time, prune: async () => {}, save: async (_dir, state, kind) => { calls.push({ revision: state.revision, kind }); return { createdAt: new Date(time).toISOString(), revision: state.revision, kind }; } });
  const state = initialState(); await manager.automatic(state); assert.equal(calls.length, 1);
  state.revision++; time = 3599999; await manager.automatic(state); assert.equal(calls.length, 1);
  time = 3600000; await manager.automatic(state); assert.equal(calls.length, 2);
  time = 7200000; await manager.automatic(state); assert.equal(calls.length, 2);
  state.revision++; await manager.automatic(state, true); assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call.kind), ['auto', 'auto', 'auto']);
});

test('backup failures remain visible and the serialized manager recovers on its next successful save', async () => {
  let unavailable = true; const state = initialState(), before = copy(state);
  const manager = createBackupManager('unused-test-path', { prune: async () => {}, save: async (_dir, snapshot, kind) => { if (unavailable) throw new Error('test storage unavailable'); return { createdAt: '2026-10-03T12:00:00.000Z', revision: snapshot.revision, kind }; } });
  assert.equal(await manager.automatic(state), null); assert.match(manager.status().error, /could not be saved/i); assert.deepEqual(state, before);
  await assert.rejects(manager.create(state), /storage unavailable/); assert.match(manager.status().error, /could not be saved/i);
  unavailable = false; await manager.create(state); await manager.idle();
  assert.equal(manager.status().error, null); assert.equal(manager.status().lastBackupRevision, state.revision);
});

test('service backup failure stays visible without rolling back saved cash payment or closed audit', async t => {
  const target = await directory(t), { app, url } = await service(t, target, { backupOptions: { save: async () => { throw new Error('test unavailable backup storage'); } } });
  await app.engine.openShift(50000); const order = await app.engine.createDraft(draft());
  const paid = await app.engine.payOrder(order.id, 5000); await app.engine.closeShift(53500);
  const state = app.engine.getState(), saved = JSON.parse(await fs.readFile(app.dataFile, 'utf8'));
  assert.equal(paid.payment.totalCents, 3500); assert.equal(verifiedReceipts(state).receipts.length, 1);
  assert.equal(saved.revision, state.revision); assert.equal(saved.shifts[0].expectedCentsAtClose, 53500);
  const health = await (await fetch(`${url}/api/health`)).json();
  assert.equal(health.status, 'ready'); assert.match(health.backup.error, /could not be saved/i);
});

test('graceful close keeps the writer lock until an active backup request finishes', async t => {
  const target = await directory(t); let finishBackup, announceStarted;
  const started = new Promise(resolve => { announceStarted = resolve; });
  const hold = new Promise(resolve => { finishBackup = resolve; });
  const { app, url } = await service(t, target, { backupOptions: { save: async (dir, state, kind) => { if (kind === 'manual') { announceStarted(); await hold; } return saveBackup(dir, state, kind); } } });
  const request = fetch(`${url}/api/backups/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
  await started;
  const closed = app.close();
  await assert.rejects(acquireLock(target), { code: 'DATA_IN_USE' });
  finishBackup(); await closed; await request;
  assert.ok((await listBackups(target)).some(item => item.kind === 'manual'));
  const release = await acquireLock(target); await release();
});

test('backup CLI verifies offline snapshots and requires explicit confirmation for restore', async t => {
  const { main } = require('../scripts/data.cjs');
  const target = await directory(t); await fs.writeFile(path.join(target, 'state.json'), JSON.stringify(initialState()));
  const backup = await main(['backup', '--data-dir', target]);
  const source = path.join(target, 'backups', backup.backup.fileName);
  assert.equal((await main(['verify', source, '--data-dir', target])).verified, true);
  assert.equal((await main(['list', '--data-dir', target])).backups.length, 1);
  await assert.rejects(main(['restore', source, '--data-dir', target]), /--confirm/);
  const { app } = await service(t, target);
  await assert.rejects(main(['restore', source, '--confirm', '--data-dir', target]), { code: 'DATA_IN_USE' });
  await app.close();
  const restored = await main(['restore', source, '--confirm', '--data-dir', target]);
  assert.ok(restored.revision > backup.backup.revision); assert.equal(restored.safetyBackup.kind, 'pre-restore');
});
