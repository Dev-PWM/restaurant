#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Pass the private backup file path.');
  const text = fs.readFileSync(file, 'utf8');
  const bundle = JSON.parse(text);
  const key = randomBytes(32).toString('hex');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zapata-restore-check-'));
  const options = convertV4MiniflareOptions({
    name: 'zapata-restore-check', modules: true,
    scriptPath: path.join(__dirname, '../cloudflare/.wrangler/cloud-build/worker.js'),
    compatibilityDate: '2026-10-14', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { RESTAURANT: { className: 'Restaurant', useSQLite: true } },
    bindings: { STAFF_PASSWORD: 'isolated-restore-test-only-password', MIGRATION_KEY: key },
  });
  options.isolatedResourcePersistencePath = directory;
  options.unsafeInspectDurableObjects = true;
  const runtime = new Miniflare(options);
  try {
    const response = await runtime.dispatchFetch('http://localhost/api/admin/import', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: text });
    const result = await response.json();
    if (!response.ok) throw new Error(`Isolated restore failed: ${result.error}`);
    const storage = await runtime.unsafeGetDurableObjectStorage('zapata-restore-check', 'Restaurant', { name: 'restaurant-v1' });
    const rows = await storage.exec('SELECT name, body FROM ledger_files ORDER BY name, part');
    const files = {};
    for (const row of rows) files[row.name] = (files[row.name] || '') + row.body;
    if (JSON.stringify(Object.keys(files).sort()) !== JSON.stringify(Object.keys(bundle.files).sort())) throw new Error('Restored file set differs from the backup.');
    for (const [name, value] of Object.entries(bundle.files)) {
      if (JSON.stringify(JSON.parse(files[name] || 'null')) !== JSON.stringify(value)) throw new Error(`Restored file mismatch: ${name}`);
    }
    console.log(JSON.stringify({ restored: true, verified: true, files: Object.keys(bundle.files).length, productionUntouched: true }));
  } finally { await runtime.dispose(); fs.rmSync(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
