#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const schedulePath = path.join(root, 'config/server-schedule.json');
const logDirectory = path.join(require('node:os').homedir(), 'Library/Logs/MasaFlow', crypto.createHash('sha256').update(root).digest('hex').slice(0, 16));
const statePath = path.join(logDirectory, 'schedule-state.json');
const label = `com.masaflow.schedule.${crypto.createHash('sha256').update(root).digest('hex').slice(0, 16)}`;
const domain = `gui/${process.getuid?.()}`;
const target = `${domain}/${label}`;
const plistPath = path.join(require('node:os').homedir(), 'Library/LaunchAgents', `${label}.plist`);
const { validateSchedule, isOpen } = require('../shared/business-hours.js');
function readSchedule() { return validateSchedule(JSON.parse(fs.readFileSync(schedulePath, 'utf8'))); }
function loadEnvironment() {
  try { process.loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function portNumber() {
  const port = Number(process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  return port;
}
function log(event, fields = {}) { process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), event, ...fields })}\n`); }
function saveState(state) {
  fs.mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
  const temporary = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify({ updatedAt: new Date().toISOString(), ...state }, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, statePath);
}
// Own the service object directly: shutdown never searches for or kills another process.
function createSupervisor({ schedule, createService, port, host = '0.0.0.0', now = () => new Date(), report = saveState, record = log }) {
  let service = null;
  let busy = false;
  let stopping = false;
  let retryAt = 0;
  let lastError = null;
  let fatalError = null;
  const state = () => ({ supervisorPid: process.pid, schedule, desired: stopping ? 'stopped' : 'running', ordersOpen: isOpen(schedule, now()), server: service ? 'running' : 'stopped', port, lastError });
  async function stopService() {
    if (!service) return;
    const owned = service;
    // Retain ownership until close completes; a close failure must not start a second writer.
    await owned.close();
    service = null;
    record('server_stopped');
  }
  async function tick() {
    if (busy || stopping) return;
    busy = true;
    try {
      if (fatalError) {
        const error = fatalError;
        await stopService();
        fatalError = null;
        throw error;
      } else if (!service && now().getTime() >= retryAt) {
        const pending = await createService();
        try {
          await new Promise((resolve, reject) => {
            pending.server.once('error', reject);
            pending.server.listen(port, host, () => { pending.server.removeListener('error', reject); resolve(); });
          });
        } catch (error) { await pending.close(); throw error; }
        service = pending;
        pending.server.on('error', error => { fatalError = error; });
        lastError = null;
        record('server_started', { port });
      }
    } catch (error) {
      lastError = error.message;
      retryAt = now().getTime() + 60000;
      record('schedule_error', { error: lastError });
    } finally { busy = false; report(state()); }
  }
  async function shutdown() {
    stopping = true;
    while (busy) await new Promise(resolve => setTimeout(resolve, 25));
    await stopService();
    report(state());
  }
  return { tick, shutdown, state };
}
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
function plist(runtime = fs.realpathSync(process.execPath)) {
  const args = [runtime, __filename, 'run'];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${xml(label)}</string>
<key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(require('node:os').homedir())}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>30</integer>
<key>ExitTimeOut</key><integer>30</integer>
<key>Umask</key><integer>63</integer>
<key>EnvironmentVariables</key><dict><key>NODE_ENV</key><string>production</string></dict>
<key>StandardOutPath</key><string>${xml(path.join(logDirectory, 'schedule.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(logDirectory, 'schedule-error.log'))}</string>
</dict></plist>\n`;
}
function launchctl(args, checked = true) {
  const result = spawnSync('/bin/launchctl', args, { encoding: 'utf8', timeout: 15000 });
  if (checked && result.status !== 0) throw new Error(`launchctl ${args[0]}: ${result.stderr || result.error?.message || result.stdout}`);
  return result;
}
// launchctl bootout can return while launchd is still removing the old job.
// Retry only bootstrap's transient code 5, within a bounded interval.
async function bootstrapAgent({ run = launchctl, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 21 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = run(['bootstrap', domain, plistPath], false);
    if (result.status === 0) return;
    if (result.status !== 5 || attempt === attempts - 1) {
      throw new Error(`launchctl bootstrap: ${result.stderr || result.error?.message || result.stdout || `exit ${result.status}`}`);
    }
    await wait(500);
  }
}
async function waitForAgent() {
  for (let attempt = 0; attempt < 40; attempt++) {
    const agent = launchctl(['print', target], false);
    const pid = Number(/\bpid = (\d+)/.exec(agent.stdout || '')?.[1] || 0);
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (pid && state.supervisorPid === pid) {
        if (state.lastError) throw new Error(`Server startup failed: ${state.lastError}`);
        if (state.server === 'running') return;
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`The agent did not report readiness. Check ${logDirectory}/schedule-error.log.`);
}
function portOccupied(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', error => error.code === 'EADDRINUSE' ? resolve(true) : reject(error));
    probe.listen(port, '0.0.0.0', () => probe.close(() => resolve(false)));
  });
}
async function main(command) {
  const schedule = readSchedule();
  loadEnvironment();
  const port = portNumber();
  if (command === 'run') {
    const { createService } = require('../server.js');
    const { createLogger } = require('../shared/logger.js');
    const logger = createLogger({ directory: process.env.MASAFLOW_LOG_DIR || logDirectory });
    const supervisor = createSupervisor({ schedule, port, host: process.env.MASAFLOW_HOST || '0.0.0.0', createService: () => createService({ logger, port, enableMdns: true, orderSchedule: schedule }) });
    const timer = setInterval(() => { void supervisor.tick(); }, 15000);
    let terminating = false;
    const shutdown = async () => {
      if (terminating) return;
      terminating = true;
      clearInterval(timer);
      try { await supervisor.shutdown(); process.exit(0); } catch (error) { log('shutdown_error', { error: error.message }); process.exit(1); }
    };
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.once(signal, shutdown);
    process.on('uncaughtException', error => { log('fatal_error', { error: error.message }); process.exit(1); });
    process.on('unhandledRejection', error => { log('fatal_error', { error: String(error) }); process.exit(1); });
    await supervisor.tick();
    return;
  }
  if (process.platform !== 'darwin') throw new Error('Installing this agent requires macOS.');
  const agent = launchctl(['print', target], false);
  const loaded = agent.status === 0;
  const pid = loaded ? Number(/\bpid = (\d+)/.exec(agent.stdout || '')?.[1] || 0) || null : null;
  if (command === 'status') {
    let state = null;
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    process.stdout.write(`${JSON.stringify({ installed: fs.existsSync(plistPath), loaded, running: Boolean(pid), pid, schedule, openNow: isOpen(schedule), state, plistPath, logDirectory }, null, 2)}\n`);
    return;
  }
  if (command === 'disable') {
    if (loaded) launchctl(['bootout', target]);
    fs.rmSync(plistPath, { force: true });
    log('schedule_disabled');
    return;
  }
  if (command !== 'install') throw new Error('Use install, status, disable, or run.');
  if (!loaded && await portOccupied(port)) throw new Error(`Port ${port} is already occupied. Stop the manually started server before installing the routine.`);
  for (const app of ['client-web', 'business-pos', 'analytics']) {
    if (!fs.existsSync(path.join(root, 'apps', app, 'dist-realtime', 'realtime.html'))) throw new Error('Build the restaurant apps with npm run build before installing.');
  }
  if (!(process.env.MASAFLOW_STAFF_PASSWORD || /^\d{4}$/.test(process.env.MASAFLOW_STAFF_PIN || ''))) throw new Error('Configure staff credentials in .env before installing.');
  fs.mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(plistPath), { recursive: true, mode: 0o700 });
  for (const file of ['schedule.log', 'schedule-error.log']) fs.closeSync(fs.openSync(path.join(logDirectory, file), 'a', 0o600));
  const previous = fs.existsSync(plistPath) ? fs.readFileSync(plistPath) : null;
  const temporary = `${plistPath}.tmp`;
  fs.writeFileSync(temporary, plist(), { mode: 0o600 });
  const validation = spawnSync('/usr/bin/plutil', ['-lint', temporary], { encoding: 'utf8' });
  if (validation.status !== 0) { fs.rmSync(temporary); throw new Error(validation.stdout || validation.stderr); }
  if (loaded) launchctl(['bootout', target]);
  try {
    fs.renameSync(temporary, plistPath);
    launchctl(['enable', target]);
    await bootstrapAgent();
    await waitForAgent();
  } catch (error) {
    if (launchctl(['print', target], false).status === 0) launchctl(['bootout', target]);
    fs.rmSync(temporary, { force: true });
    if (previous) fs.writeFileSync(plistPath, previous, { mode: 0o600 });
    else fs.rmSync(plistPath, { force: true });
    if (loaded && previous) {
      try { await bootstrapAgent(); } catch (restoreError) {
        throw new Error(`${error.message} Previous agent could not be restored: ${restoreError.message}`);
      }
    }
    throw error;
  }
  log('schedule_installed', { schedule, plistPath });
}
if (require.main === module) main(process.argv[2] || 'status').catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
module.exports = { validateSchedule, isOpen, createSupervisor, plist, bootstrapAgent };
