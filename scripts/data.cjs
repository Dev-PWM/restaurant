#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { configuration, probeHealth } = require('./mac-start.cjs');
const { acquireLock, validateState, validateBackup, saveBackup, listBackups, restoreBackup } = require('../shared/local-data.js');
const { verifiedReceipts } = require('../assets/masaflow-store.js');
async function main(argv = process.argv.slice(2)) {
  const command = argv.shift(); let source, dataDirectory, confirmed = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--data-dir' && argv[i + 1]) dataDirectory = path.resolve(argv[++i]);
    else if (argv[i] === '--confirm') confirmed = true;
    else if (!argv[i].startsWith('--') && !source) source = path.resolve(argv[i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  const config = configuration({ env: { ...process.env, ...(dataDirectory ? { MASAFLOW_DATA_DIR: dataDirectory } : {}) } });
  if (command === 'list') return { directory: path.join(config.dataDirectory, 'backups'), backups: await listBackups(config.dataDirectory) };
  if (command === 'verify') {
    if (!source) throw new Error('Specify the backup JSON file to verify.');
    const backup = validateBackup(JSON.parse(await fs.readFile(source, 'utf8')));
    return { verified: true, createdAt: backup.createdAt, revision: backup.revision, kind: backup.kind, orders: backup.state.orders.length, payments: backup.state.payments.length, excludedReceipts: verifiedReceipts(backup.state).excluded };
  }
  if (command === 'restore') {
    if (!source || !confirmed) throw new Error('Restore replaces the current store with the selected snapshot. Stop MasaFlow, verify the backup, then run: npm run restore -- BACKUP_FILE --confirm');
    return restoreBackup(config.dataDirectory, source);
  }
  if (command === 'backup') {
    const service = await probeHealth(config);
    if (service.state === 'ready') {
      let cookie = '';
      if (config.env.MASAFLOW_STAFF_PASSWORD) {
        const login = await fetch(`${config.url}/api/session/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: config.env.MASAFLOW_STAFF_PASSWORD }), signal: AbortSignal.timeout(20000) });
        if (!login.ok) throw new Error('Staff sign-in failed. Check the server environment password before backing up.');
        cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
      }
      try {
        const response = await fetch(`${config.url}/api/backups/create`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: '{}', signal: AbortSignal.timeout(20000) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Backup failed.');
        return { ...result, directory: path.join(config.dataDirectory, 'backups') };
      } finally {
        if (cookie) await fetch(`${config.url}/api/session/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{}', signal: AbortSignal.timeout(5000) }).catch(() => {});
      }
    }
    const release = await acquireLock(config.dataDirectory);
    try { const state = validateState(JSON.parse(await fs.readFile(path.join(config.dataDirectory, 'state.json'), 'utf8'))); return { backup: await saveBackup(config.dataDirectory, state), directory: path.join(config.dataDirectory, 'backups') }; }
    finally { await release(); }
  }
  throw new Error('Usage: node scripts/data.cjs backup|list|verify BACKUP_FILE|restore BACKUP_FILE --confirm [--data-dir DIRECTORY]');
}
if (require.main === module) main().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
module.exports = { main };
