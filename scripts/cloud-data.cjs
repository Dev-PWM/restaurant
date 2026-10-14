#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const WebSocket = require('ws');
const { validate } = require('../shared/realtime/engine.js');
const root = path.resolve(__dirname, '..');
const privateDirectory = path.join(root, '.cloud-secrets');
const keyPath = path.join(privateDirectory, 'cloudflare-migration-key');
function loadEnv() { try { process.loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
function password() {
  const value = process.env.MASAFLOW_STAFF_PASSWORD || '';
  if (value.length < 12 || value.length > 256) throw new Error('Configure the existing public staff password in .env.');
  return value;
}
function cloudUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use the HTTPS cloud origin, without a path or credentials.');
  return url.origin;
}
function summary(state) { return { shiftId: state.shiftId, revision: state.revision, activeOrders: state.activeOrders.length, completedOrders: state.completedOrders.length, salesMetrics: state.salesMetrics, closedShifts: state.closedShifts }; }
function sourceBundle() {
  const directory = path.resolve(root, process.env.MASAFLOW_DATA_DIR || '.masaflow-realtime');
  if (fs.existsSync(path.join(directory, '.writer-lock'))) throw new Error('Stop the Mac server before taking the final migration snapshot.');
  const files = {};
  for (const name of fs.readdirSync(directory)) {
    if (!/^(data\.json|archive_[A-Za-z0-9_.-]+\.json|data\.before-[A-Za-z0-9_.-]+\.json)$/.test(name)) continue;
    files[name] = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    validate(files[name]);
  }
  if (!files['data.json']) throw new Error('The current restaurant ledger was not found.');
  return { format: 'masaflow-cloud-v1', files };
}
async function staffConnection(url) {
  const socket = new WebSocket(url.replace('https:', 'wss:') + '/api/realtime', { origin: url });
  const pending = new Map();
  let serial = 0;
  socket.on('message', value => {
    const packet = JSON.parse(value.toString());
    if (packet.id && pending.has(packet.id)) { pending.get(packet.id)(packet.reply); pending.delete(packet.id); }
  });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Cloud connection timed out')), 10000); socket.once('open', () => { clearTimeout(timer); resolve(); }); socket.once('error', error => { clearTimeout(timer); reject(error); }); });
  const command = (event, payload) => new Promise((resolve, reject) => {
    const id = String(++serial);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Cloud acknowledgement timed out')); }, 10000);
    pending.set(id, reply => { clearTimeout(timer); reply.ok ? resolve(reply) : reject(new Error(reply.error)); });
    socket.send(JSON.stringify({ event, payload, id }));
  });
  try {
    await command('hello', { sessionId: randomUUID(), token: '' });
    const login = await command('staff_login', password());
    return { token: login.token, close: async () => { try { await command('staff_logout'); } finally { socket.close(); } } };
  } catch (error) { socket.close(); throw error; }
}
async function exportBundle(url) {
  const session = await staffConnection(url);
  try {
    const response = await fetch(`${url}/api/admin/export`, { headers: { Authorization: `Bearer ${session.token}` } });
    const bundle = await response.json();
    if (!response.ok) throw new Error(bundle.error || 'Cloud export failed.');
    return bundle;
  } finally { await session.close(); }
}
async function main() {
  loadEnv();
  const command = process.argv[2];
  if (command === 'secrets') {
    fs.mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, randomBytes(32).toString('hex'), { mode: 0o600 });
    const result = spawnSync('npm', ['exec', '--', 'wrangler', 'secret', 'bulk', '--config', 'cloudflare/wrangler.jsonc'], { cwd: root, input: JSON.stringify({ STAFF_PASSWORD: password(), MIGRATION_KEY: fs.readFileSync(keyPath, 'utf8').trim() }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Secret setup failed.');
    console.log('Existing staff password and temporary migration credential installed securely.');
    return;
  }
  const url = cloudUrl(process.argv[3]);
  const directory = path.join(root, '.cloud-backups');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (command === 'import') {
    const bundle = sourceBundle();
    const body = JSON.stringify(bundle);
    if (body.length > 16 * 1024 * 1024) throw new Error('Migration bundle exceeds 16 MiB; split archives before import.');
    const backup = path.join(directory, `before-cloud-${new Date().toISOString().replaceAll(':', '-')}.json`);
    fs.writeFileSync(backup, body, { mode: 0o600 });
    const response = await fetch(`${url}/api/admin/import`, { method: 'POST', headers: { Authorization: `Bearer ${fs.readFileSync(keyPath, 'utf8').trim()}`, 'Content-Type': 'application/json' }, body });
    const reply = await response.json();
    if (!response.ok) throw new Error(reply.error || 'Cloud import failed.');
    const exported = await exportBundle(url);
    for (const [name, value] of Object.entries(bundle.files)) {
      if (JSON.stringify(value) !== JSON.stringify(exported.files[name])) throw new Error(`Cloud verification mismatch: ${name}. Keep the source server stopped until reconciled.`);
    }
    if (JSON.stringify(summary(bundle.files['data.json'])) !== JSON.stringify(summary(exported.files['data.json']))) throw new Error('Cloud totals do not match the source.');
    console.log(JSON.stringify({ imported: true, verified: true, files: Object.keys(bundle.files).length, shiftId: bundle.files['data.json'].shiftId, backup }));
  } else if (command === 'export') {
    const bundle = await exportBundle(url);
    const destination = path.join(directory, `cloud-${new Date().toISOString().replaceAll(':', '-')}.json`);
    fs.writeFileSync(destination, JSON.stringify(bundle), { mode: 0o600 });
    console.log(`Private restaurant backup saved: ${destination}`);
  } else throw new Error('Use cloud-data.cjs secrets | import HTTPS_ORIGIN | export HTTPS_ORIGIN.');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { sourceBundle, summary };
