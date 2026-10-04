#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const http = require('node:http');
const { parseEnv } = require('node:util');
const { spawn, spawnSync } = require('node:child_process');

const MINIMUM_NODE = '22.12.0';
function supportedVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value).trim());
  return !!match && (Number(match[1]) > 22 || (Number(match[1]) === 22 && Number(match[2]) >= 12));
}
function findNode({ env = process.env, home = os.homedir(), current = process.execPath, run = spawnSync } = {}) {
  const candidates = [env.MASAFLOW_NODE, current, ...String(env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'node')), path.join(home, '.local/bin/node'), '/opt/homebrew/bin/node', '/usr/local/bin/node'];
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    const result = run(candidate, ['--version'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    if (result.status === 0 && supportedVersion(result.stdout)) {
      try { return fs.realpathSync(candidate); } catch (_) { return path.resolve(candidate); }
    }
    if (candidate === env.MASAFLOW_NODE) throw new Error(`MASAFLOW_NODE must point to Node.js ${MINIMUM_NODE} or newer.`);
  }
  throw new Error(`Install Node.js ${MINIMUM_NODE} or newer, or set MASAFLOW_NODE to its executable.`);
}
function canonicalPath(target) {
  try { return fs.realpathSync(target); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(target);
    if (parent === target) throw error;
    return path.join(canonicalPath(parent), path.basename(target));
  }
}
function configuration({ workspace = path.join(__dirname, '..'), env = process.env, home = os.homedir() } = {}) {
  const realWorkspace = fs.realpathSync(workspace);
  let fileEnv = {};
  try { fileEnv = parseEnv(fs.readFileSync(path.join(realWorkspace, '.env'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const serverEnv = { ...fileEnv, ...env, MASAFLOW_HOST: '127.0.0.1' };
  const port = Number(serverEnv.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const dataDirectory = canonicalPath(path.resolve(realWorkspace, serverEnv.MASAFLOW_DATA_DIR || '.masaflow'));
  serverEnv.MASAFLOW_DATA_DIR = dataDirectory;
  serverEnv.PORT = String(port);
  const workspaceId = crypto.createHash('sha256').update(dataDirectory).digest('hex').slice(0, 16);
  return { workspace: realWorkspace, dataDirectory, workspaceId, home, port, host: '127.0.0.1', url: `http://127.0.0.1:${port}`, env: serverEnv, logDirectory: path.join(dataDirectory, 'logs') };
}
function probeHealth(config, { timeout = 1500 } = {}) {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => { if (!settled) { settled = true; resolve(result); } };
    const request = http.get(`${config.url}/api/health`, { timeout }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; if (body.length > 8192) { request.destroy(); finish({ state: 'occupied' }); } });
      response.on('end', () => {
        let health;
        try { health = JSON.parse(body); } catch (_) { return finish({ state: 'occupied' }); }
        const ours = response.statusCode === 200 && health.service === 'masaflow' && health.status === 'ready' && health.workspaceId === config.workspaceId;
        finish(ours ? { state: 'ready', health } : { state: 'occupied' });
      });
      response.on('error', () => finish({ state: 'occupied' }));
    });
    request.on('timeout', () => { request.destroy(); finish({ state: 'occupied' }); });
    request.on('error', error => finish({ state: error.code === 'ECONNREFUSED' ? 'missing' : 'occupied' }));
  });
}
async function prepareLogs(config) {
  await fsp.mkdir(config.logDirectory, { recursive: true, mode: 0o700 });
  const logs = [path.join(config.logDirectory, 'startup.log'), path.join(config.logDirectory, 'startup-error.log')];
  for (const log of logs) {
    try { if ((await fsp.stat(log)).size > 5 * 1024 * 1024) await fsp.rename(log, `${log}.previous`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const file = await fsp.open(log, 'a', 0o600); await file.close();
  }
  return logs;
}
async function start({ config = configuration(), dryRun = false, openBrowser = true, node, probe = probeHealth, launch = spawn, open = spawn, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), timeout = 20000 } = {}) {
  const existing = await probe(config);
  if (existing.state === 'occupied') { const error = new Error(`Port ${config.port} is occupied by another service or a different MasaFlow data directory. Nothing was stopped. Choose another PORT or stop that service yourself.`); error.code = 'PORT_IN_USE'; throw error; }
  const runtime = node || findNode({ env: config.env });
  if (dryRun) return { action: existing.state === 'ready' ? 'reuse' : 'start', runtime, workspace: config.workspace, url: config.url, dryRun: true };
  if (existing.state !== 'ready') {
    const logs = await prepareLogs(config);
    const descriptors = logs.map(file => fs.openSync(file, 'a', 0o600));
    let failure;
    let child;
    try {
      child = launch(runtime, [path.join(config.workspace, 'scripts/mac-start.cjs'), '--serve', '--workspace', config.workspace], { cwd: config.workspace, env: config.env, detached: true, stdio: ['ignore', descriptors[0], descriptors[1]] });
      child.on('error', error => { failure = error; });
      child.unref();
    } finally { descriptors.forEach(fd => fs.closeSync(fd)); }
    const deadline = Date.now() + timeout;
    let healthy = false;
    while (Date.now() < deadline) {
      if (failure) throw failure;
      const next = await probe(config);
      if (next.state === 'ready') { healthy = true; break; }
      if (next.state === 'occupied') { const error = new Error(`Another service claimed port ${config.port}. See ${logs[1]}.`); error.code = 'PORT_IN_USE'; throw error; }
      await wait(200);
    }
    if (!healthy) throw new Error(`MasaFlow did not become ready. Read ${logs[1]} for the startup error.`);
  }
  if (openBrowser) {
    const browser = open('/usr/bin/open', [`${config.url}/businessDashbord.html`], { detached: true, stdio: 'ignore' });
    browser.on('error', error => process.stderr.write(`Open ${config.url} in your browser (${error.message}).\n`)); browser.unref();
  }
  return { action: existing.state === 'ready' ? 'reused' : 'started', url: config.url, workspaceId: config.workspaceId };
}
async function serve(config, { probe = probeHealth, createService = require('../server.js').createService } = {}) {
  const existing = await probe(config);
  if (existing.state !== 'missing') {
    process.stderr.write(existing.state === 'ready' ? 'This MasaFlow data directory is already running. The login agent will remain idle.\n' : `Port ${config.port} is occupied. The login agent will remain idle; no service was stopped.\n`);
    return { blocked: true };
  }
  Object.assign(process.env, config.env);
  let app;
  try {
    app = await createService({ dataDirectory: config.dataDirectory });
    await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(config.port, config.host, resolve); });
  } catch (error) {
    if (app) await app.close();
    if (['EADDRINUSE', 'DATA_IN_USE', 'DATA_DIRECTORY_LOCKED', 'STORE_BUSY', 'LOCKED'].includes(error.code)) { process.stderr.write(`${error.message} The login agent will remain idle.\n`); return { blocked: true }; }
    throw error;
  }
  process.stdout.write(`${new Date().toISOString()} MasaFlow running at ${config.url}\n`);
  let closing = false;
  const close = async () => { if (closing) return; closing = true; try { await app.close(); } finally { process.exitCode = 0; } };
  process.once('SIGTERM', close); process.once('SIGINT', close);
  return { app, blocked: false };
}
function parseArguments(argv) {
  const options = { serve: false, dryRun: false, openBrowser: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--serve') options.serve = true;
    else if (argv[i] === '--dry-run') options.dryRun = true;
    else if (argv[i] === '--no-browser') options.openBrowser = false;
    else if (argv[i] === '--workspace' && argv[i + 1]) options.workspace = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return options;
}
if (require.main === module) {
  Promise.resolve().then(async () => {
    if (!supportedVersion(process.version)) throw new Error(`Node.js ${MINIMUM_NODE} or newer is required.`);
    const options = parseArguments(process.argv.slice(2));
    const config = configuration({ workspace: options.workspace });
    if (options.serve && !options.dryRun) await serve(config);
    else process.stdout.write(`${JSON.stringify(await start({ ...options, config }), null, 2)}\n`);
  }).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
module.exports = { MINIMUM_NODE, supportedVersion, findNode, canonicalPath, configuration, probeHealth, prepareLogs, start, serve, parseArguments };
