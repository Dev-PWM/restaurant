'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const { supportedVersion, findNode, configuration, probeHealth, start, serve } = require('../scripts/mac-start.cjs');
const { agentDetails, install, uninstall, status } = require('../scripts/mac-login.cjs');

async function fixture(t) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'masaflow-startup-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const config = configuration({ workspace, env: {}, home: path.join(workspace, 'home') });
  const details = agentDetails(config, { runtime: process.execPath, uid: 501 });
  return { workspace, config, details };
}
const missing = async () => ({ state: 'missing' });
const unloaded = args => ({ status: args[0] === 'print' ? 1 : 0, stdout: '', stderr: '' });

test('native startup requires Node 22.12 and resolves a validated executable without cache-specific paths', () => {
  for (const version of ['v20.19.0', 'v22.11.0', '', 'v22.12.0-rc.1']) assert.equal(supportedVersion(version), false);
  for (const version of ['v22.12.0', '24.0.0', 'v26.7.0']) assert.equal(supportedVersion(version), true);
  const tried = [];
  const runtime = findNode({ current: '/test/old-node', env: { PATH: '/portable/bin' }, home: '/other/home', run(candidate) { tried.push(candidate); return { status: 0, stdout: candidate.endsWith('/portable/bin/node') ? 'v22.12.0\n' : 'v20.0.0\n' }; } });
  assert.equal(runtime, '/portable/bin/node');
  assert.deepEqual(tried, ['/test/old-node', '/portable/bin/node']);
  assert.throws(() => findNode({ env: { MASAFLOW_NODE: '/unsupported/node' }, run: () => ({ status: 0, stdout: 'v20.0.0' }) }), /MASAFLOW_NODE/);
});

test('startup reads .env as data, respects explicit environment, keeps localhost and canonical data identity', async t => {
  const { workspace } = await fixture(t);
  await fs.writeFile(path.join(workspace, '.env'), 'PORT=4999\nAI_GATEWAY_API_KEY="secret-$(touch forbidden)"\nMASAFLOW_HOST=0.0.0.0\nMASAFLOW_DATA_DIR=store\n');
  await fs.mkdir(path.join(workspace, 'store'));
  await fs.symlink(path.join(workspace, 'store'), path.join(workspace, 'store-link'));
  const first = configuration({ workspace, env: { PORT: '5001' } });
  const second = configuration({ workspace, env: { MASAFLOW_DATA_DIR: 'store-link' } });
  assert.equal(first.port, 5001); assert.equal(first.host, '127.0.0.1');
  assert.equal(first.env.AI_GATEWAY_API_KEY, 'secret-$(touch forbidden)');
  assert.equal(first.workspaceId, second.workspaceId);
  await assert.rejects(fs.access(path.join(workspace, 'forbidden')));
  assert.throws(() => configuration({ workspace, env: { PORT: 'bad' } }), /PORT/);
});

test('health probes reuse only this service and exact data directory, not an arbitrary listening port', async t => {
  let health = { service: 'other', workspaceId: 'wrong', status: 'ready' };
  const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(health)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { config } = await fixture(t);
  config.url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await probeHealth(config)).state, 'occupied');
  health = { service: 'masaflow', workspaceId: 'wrong', status: 'ready' };
  assert.equal((await probeHealth(config)).state, 'occupied');
  health = { service: 'masaflow', workspaceId: config.workspaceId, status: 'ready' };
  assert.equal((await probeHealth(config)).state, 'ready');
  health.status = 'starting'; assert.equal((await probeHealth(config)).state, 'occupied');
});

test('one-click startup safely reuses a matching app and refuses an occupied port without spawning', async t => {
  const { config } = await fixture(t);
  const unexpected = () => { throw new Error('Must not spawn'); };
  const result = await start({ config, node: process.execPath, probe: async () => ({ state: 'ready' }), openBrowser: false, launch: unexpected, open: unexpected });
  assert.equal(result.action, 'reused');
  await assert.rejects(start({ config, probe: async () => ({ state: 'occupied' }), launch: unexpected }), { code: 'PORT_IN_USE' });
  await assert.rejects(fs.access(config.logDirectory));
});

test('startup dry run has no file or process side effects, and startup waits for verified health', async t => {
  const { config } = await fixture(t);
  const dry = await start({ config, node: process.execPath, probe: missing, dryRun: true, launch: () => assert.fail('spawned') });
  assert.equal(dry.action, 'start'); await assert.rejects(fs.access(config.logDirectory));
  let probes = 0;
  let invocation;
  const result = await start({ config, node: process.execPath, openBrowser: false, wait: async () => {}, probe: async () => ({ state: ++probes > 2 ? 'ready' : 'missing' }), launch(runtime, args, options) { invocation = { runtime, args, options }; const child = new EventEmitter(); child.unref = () => {}; return child; } });
  assert.equal(result.action, 'started');
  assert.equal(invocation.options.detached, true);
  assert.equal(invocation.options.env.MASAFLOW_HOST, '127.0.0.1');
  assert.deepEqual(invocation.args.slice(1), ['--serve', '--workspace', config.workspace]);
  assert.equal((await fs.stat(path.join(config.logDirectory, 'startup.log'))).mode & 0o777, 0o600);
});

test('login plist preserves absolute paths, retries failures with a throttle, and never embeds credentials', async t => {
  const { workspace, config } = await fixture(t);
  config.env.AI_GATEWAY_API_KEY = 'private-gateway-value';
  const details = agentDetails(config, { runtime: '/portable/node & runtime', uid: 501 });
  assert.match(details.plist, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(details.plist, /<key>SuccessfulExit<\/key><false\/>/);
  assert.match(details.plist, /<key>ThrottleInterval<\/key><integer>30<\/integer>/);
  assert.match(details.plist, /\/portable\/node &amp; runtime/);
  assert.ok(details.plist.includes(workspace));
  assert.ok(!details.plist.includes('private-gateway-value'));
  assert.ok(!details.plist.includes('AI_GATEWAY_API_KEY'));
  if (process.platform === 'darwin') {
    const file = path.join(workspace, 'validate.plist'); await fs.writeFile(file, details.plist);
    const validation = spawnSync('/usr/bin/plutil', ['-lint', file], { encoding: 'utf8' });
    assert.equal(validation.status, 0, validation.stderr || validation.stdout);
  }
});

test('login dry run performs no registration or writes, and refuses taking over an unmanaged server', async t => {
  const { config, details } = await fixture(t);
  const calls = [];
  const run = args => { calls.push(args); return unloaded(args); };
  const plan = await install({ config, details, run, probe: missing, dryRun: true });
  assert.equal(plan.dryRun, true); assert.deepEqual(calls, [['print', details.target]]);
  await assert.rejects(fs.access(details.plistPath)); await assert.rejects(fs.access(config.logDirectory));
  await assert.rejects(install({ config, details, run, probe: async () => ({ state: 'ready' }) }), { code: 'UNMANAGED_RUNNING' });
  await assert.rejects(install({ config, details, run, probe: async () => ({ state: 'occupied' }) }), { code: 'PORT_IN_USE' });
});

test('login install/uninstall affect only the scoped user agent and retain restaurant data', async t => {
  const { config, details } = await fixture(t);
  const calls = [];
  const run = args => { calls.push(args); return unloaded(args); };
  const result = await install({ config, details, run, probe: missing });
  assert.equal(result.action, 'installed');
  assert.deepEqual(calls.slice(1), [['enable', details.target], ['bootstrap', details.domain, details.plistPath]]);
  assert.equal((await fs.stat(details.plistPath)).mode & 0o777, 0o600);
  const ledger = path.join(config.dataDirectory, 'state.json'); await fs.writeFile(ledger, 'preserve');
  const loaded = args => { calls.push(args); return { status: 0, stdout: args[0] === 'print' ? 'pid = 1234\n' : '', stderr: '' }; };
  const current = await status({ config, details, run: loaded, probe: async () => ({ state: 'ready' }) });
  assert.equal(current.loaded, true); assert.equal(current.pid, 1234);
  await uninstall({ config, details, run: loaded, probe: missing });
  assert.deepEqual(calls.at(-1), ['bootout', details.target]);
  await assert.rejects(fs.access(details.plistPath)); assert.equal(await fs.readFile(ledger, 'utf8'), 'preserve');
});

test('failed login installation restores the previous plist', async t => {
  const { config, details } = await fixture(t);
  await fs.mkdir(path.dirname(details.plistPath), { recursive: true }); await fs.writeFile(details.plistPath, 'old configuration');
  const calls = [];
  const run = args => { calls.push(args); return { status: args[0] === 'bootstrap' ? 5 : 0, stdout: args[0] === 'print' ? 'pid = 4567\n' : '', stderr: args[0] === 'bootstrap' ? 'test bootstrap failure' : '' }; };
  await assert.rejects(install({ config, details, run, probe: missing }), /test bootstrap failure/);
  assert.equal(await fs.readFile(details.plistPath, 'utf8'), 'old configuration');
  assert.equal(calls.filter(args => args[0] === 'bootstrap').length, 2);
});

test('login supervisor stays idle on port conflict instead of repeatedly starting or killing services', async t => {
  const { config } = await fixture(t);
  let creates = 0;
  const result = await serve(config, { probe: async () => ({ state: 'occupied' }), createService: async () => { creates++; } });
  assert.equal(result.blocked, true); assert.equal(creates, 0);
});
