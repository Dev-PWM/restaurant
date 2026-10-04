'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { migrateState, verifiedReceipts } = require('../assets/masaflow-store.js');
const collections = ['menu', 'orders', 'payments', 'shifts', 'cashDrops', 'audit', 'hardwareJobs'];
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function validateState(state) {
  if (!state || typeof state !== 'object' || ![1, 2].includes(state.version)) throw new Error('Unsupported saved data version.');
  for (const key of collections) if (!Array.isArray(state[key])) throw new Error(`Invalid saved ${key} data.`);
  if (!Number.isSafeInteger(state.revision) || state.revision < 0 || !Number.isSafeInteger(state.nextOrderNumber) || state.nextOrderNumber < 1) throw new Error('Invalid saved revision or ticket counter.');
  const s = state.settings;
  if (!s || !['MXN', 'USD'].includes(s.currency) || !Number.isInteger(s.taxBasisPoints) || s.taxBasisPoints < 0 || s.taxBasisPoints > 10000) throw new Error('Invalid saved currency or tax configuration.');
  if (state.version === 2 && (!['es', 'en'].includes(s.locale) || typeof s.taxConfigured !== 'boolean')) throw new Error('Invalid saved language or tax status.');
  try { new Intl.DateTimeFormat('en', { timeZone: s.timeZone || (state.version === 1 ? 'America/Mexico_City' : '') }); } catch { throw new Error('Invalid saved timezone.'); }
  return state;
}
async function atomicWrite(fileName, text) {
  const temporary = `${fileName}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, fileName);
    const directory = await fs.open(path.dirname(fileName), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}
async function identity(directory) { return digest(await fs.realpath(directory)).slice(0, 16); }
async function acquireLock(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(await fs.realpath(directory), '.writer-lock');
  const owner = { pid: process.pid, hostname: os.hostname(), token: crypto.randomUUID(), startedAt: new Date().toISOString() };
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await fs.mkdir(lock, { mode: 0o700 });
      try { await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify(owner), { flag: 'wx', mode: 0o600 }); }
      catch (error) { await fs.rm(lock, { recursive: true, force: true }); throw error; }
      let released = false;
      return async () => {
        if (released) return;
        const actual = JSON.parse(await fs.readFile(path.join(lock, 'owner.json'), 'utf8'));
        if (actual.token !== owner.token) throw new Error('Data lock ownership changed.');
        await fs.rm(lock, { recursive: true }); released = true;
      };
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    let existing;
    try { existing = JSON.parse(await fs.readFile(path.join(lock, 'owner.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') { await wait(25); continue; } throw new Error('Unreadable data lock. Inspect .writer-lock before restarting.'); }
    if (existing.hostname !== os.hostname() || !Number.isInteger(existing.pid) || !existing.token) throw new Error('Unknown data lock owner. Inspect .writer-lock before restarting.');
    let alive = true;
    try { process.kill(existing.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    if (alive) { const error = new Error(`MasaFlow data is in use by process ${existing.pid}. Stop that service before restoring or starting another writer.`); error.code = 'DATA_IN_USE'; throw error; }
    // Only one stale-lock reclaimer proceeds. Re-read the ownership token after
    // taking the recovery mutex so another reclaimer cannot remove a fresh lock.
    let recovery;
    try { recovery = await fs.open(path.join(lock, 'reclaim'), 'wx', 0o600); }
    catch (error) { if (['EEXIST', 'ENOENT'].includes(error.code)) { await wait(25); continue; } throw error; }
    try {
      const actual = JSON.parse(await fs.readFile(path.join(lock, 'owner.json'), 'utf8'));
      if (actual.token === existing.token) {
        const abandoned = `${lock}.abandoned-${owner.token}`;
        await fs.rename(lock, abandoned); await fs.rm(abandoned, { recursive: true, force: true });
      } else await fs.rm(path.join(lock, 'reclaim'), { force: true });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    finally { await recovery.close(); }
  }
  throw new Error('Could not acquire the data lock. Inspect .writer-lock before restarting.');
}
function backupEnvelope(state, kind, createdAt = new Date().toISOString()) {
  validateState(state);
  return { format: 'masaflow-backup', version: 1, createdAt, kind, revision: state.revision, sha256: digest(JSON.stringify(state)), state };
}
function validateBackup(value) {
  if (!value || value.format !== 'masaflow-backup' || value.version !== 1 || !Number.isFinite(Date.parse(value.createdAt)) || value.sha256 !== digest(JSON.stringify(value.state))) throw new Error('Invalid or damaged MasaFlow backup. Checksum verification failed.');
  validateState(value.state);
  if (value.revision !== value.state.revision) throw new Error('Backup revision does not match its saved state.');
  return value;
}
async function saveBackup(directory, state, kind = 'manual', createdAt) {
  if (!['auto', 'manual', 'pre-restore'].includes(kind)) throw new Error('Invalid backup kind.');
  const envelope = backupEnvelope(state, kind, createdAt);
  const backups = path.join(directory, 'backups'); await fs.mkdir(backups, { recursive: true, mode: 0o700 });
  const fileName = `${kind}-${envelope.createdAt.replace(/[:.]/g, '-')}-r${state.revision}-${crypto.randomUUID().slice(0, 8)}.json`;
  await atomicWrite(path.join(backups, fileName), JSON.stringify(envelope, null, 2));
  return { fileName, createdAt: envelope.createdAt, revision: state.revision, kind };
}
async function listBackups(directory) {
  const backups = path.join(directory, 'backups'); let files;
  try { files = await fs.readdir(backups); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const fileName of files.filter(name => /^(auto|manual|pre-restore)-[^/]+\.json$/.test(name))) {
    try { const value = validateBackup(JSON.parse(await fs.readFile(path.join(backups, fileName), 'utf8'))); result.push({ fileName, createdAt: value.createdAt, revision: value.revision, kind: value.kind }); }
    catch { result.push({ fileName, damaged: true }); }
  }
  return result.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
async function pruneAutomatic(directory, now = Date.now()) {
  const cutoff = now - 30 * 86400000;
  for (const backup of await listBackups(directory)) if (backup.kind === 'auto' && Date.parse(backup.createdAt) < cutoff) await fs.unlink(path.join(directory, 'backups', backup.fileName));
}
function prepareRestore(backup, current) {
  const restored = migrateState(backup.state);
  const revision = Math.max(restored.revision, current?.revision || 0);
  if (revision >= Number.MAX_SAFE_INTEGER) throw new Error('Saved revision cannot be advanced safely.');
  restored.revision = revision + 1;
  restored.nextOrderNumber = Math.max(restored.nextOrderNumber, current?.nextOrderNumber || 0);
  const at = new Date().toISOString();
  for (const job of restored.hardwareJobs) if (job && job.status === 'reserved') { job.status = 'unknown'; job.completedAt = at; job.message = 'Restored backup; physical drawer status is uncertain. Inspect before a manual pulse.'; }
  for (const payment of restored.payments) if (payment && (payment.drawerKickStatus === 'pending' || restored.hardwareJobs.some(job => job && job.paymentId === payment.id && job.status === 'unknown'))) {
    payment.drawerKickStatus = 'unknown';
    if (typeof payment.id === 'string' && !restored.hardwareJobs.some(job => job && job.paymentId === payment.id)) restored.hardwareJobs.push({ key: `payment:${payment.id}`, paymentId: payment.id, status: 'unknown', createdAt: at, completedAt: at, message: 'Restored backup; automatic delivery suppressed.' });
  }
  restored.audit.push({ id: crypto.randomUUID(), at, action: 'data_restore', message: `Backup from ${backup.createdAt} restored. Previous revision: ${current?.revision ?? 'none'}.`, data: { snapshotRevision: backup.revision, previousRevision: current?.revision ?? null, sha256: backup.sha256 } });
  return validateState(restored);
}
async function restoreBackup(directory, fileName) {
  const release = await acquireLock(directory);
  try {
    const backup = validateBackup(JSON.parse(await fs.readFile(fileName, 'utf8')));
    let current = null;
    try { current = validateState(JSON.parse(await fs.readFile(path.join(directory, 'state.json'), 'utf8'))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const restored = prepareRestore(backup, current);
    const safety = current ? await saveBackup(directory, current, 'pre-restore') : null;
    await atomicWrite(path.join(directory, 'state.json'), JSON.stringify(restored, null, 2));
    return { revision: restored.revision, sourceRevision: backup.revision, safetyBackup: safety, excludedReceipts: verifiedReceipts(restored).excluded };
  } finally { await release(); }
}
module.exports = { validateState, validateBackup, backupEnvelope, atomicWrite, acquireLock, identity, saveBackup, listBackups, pruneAutomatic, prepareRestore, restoreBackup };
