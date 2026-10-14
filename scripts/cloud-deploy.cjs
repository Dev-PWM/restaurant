#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const origin = 'https://zapata-restaurant.zapata-restaurant-821abce2.workers.dev';
function credential() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const result = spawnSync('npm', ['exec', '--', 'wrangler', 'auth', 'token', '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error('Run wrangler login first.');
  let auth;
  try { auth = JSON.parse(result.stdout); } catch { throw new Error('Unable to retrieve Wrangler credentials. Run wrangler login.'); }
  if (typeof auth.token !== 'string' || !auth.token) throw new Error('Run wrangler login first.');
  return auth.token;
}
async function main() {
  const bootstrap = process.argv[2] === 'bootstrap';
  if (bootstrap) {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'cloudflare/wrangler.bootstrap.jsonc'), 'utf8'));
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.account_id}/workers/scripts`, { headers: { Authorization: `Bearer ${credential()}` } });
    const result = await response.json();
    if (!result.success) throw new Error('Unable to check Cloudflare account. Run wrangler login again.');
    if (result.result.some(worker => worker.id === config.name)) throw new Error('The Worker already exists. Use cloud:deploy for updates; bootstrap must never replace a live Worker.');
  } else {
    const response = await fetch(`${origin}/api/health`);
    const health = await response.json();
    if (!response.ok || health.storage !== 'cloudflare-sqlite' || health.migrationComplete !== true) throw new Error('Import and verify the restaurant ledger on the preview before deploying production routes. For the first deployment, use cloud:bootstrap.');
  }
  const config = bootstrap ? 'cloudflare/wrangler.bootstrap.jsonc' : 'cloudflare/wrangler.jsonc';
  const result = spawnSync('npm', ['exec', '--', 'wrangler', 'deploy', '--config', config], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Cloudflare deployment failed.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
