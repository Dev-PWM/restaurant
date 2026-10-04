#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { configuration, findNode, probeHealth, prepareLogs, supportedVersion, MINIMUM_NODE } = require('./mac-start.cjs');

const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
function agentDetails(config, { runtime = findNode({ env: config.env }), uid = process.getuid() } = {}) {
  const label = `com.masaflow.local.${config.workspaceId}`;
  const target = `gui/${uid}/${label}`;
  const plistPath = path.join(config.home, 'Library/LaunchAgents', `${label}.plist`);
  const args = [runtime, path.join(config.workspace, 'scripts/mac-start.cjs'), '--serve', '--workspace', config.workspace];
  // Configuration files contain paths and operational settings only. Credentials are read from .env by the server wrapper.
  const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${xml(label)}</string>\n<key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join('')}</array>\n<key>WorkingDirectory</key><string>${xml(config.workspace)}</string>\n<key>RunAtLoad</key><true/>\n<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>\n<key>ThrottleInterval</key><integer>30</integer>\n<key>ExitTimeOut</key><integer>20</integer>\n<key>Umask</key><integer>63</integer>\n<key>EnvironmentVariables</key><dict><key>NODE_ENV</key><string>production</string><key>MASAFLOW_HOST</key><string>127.0.0.1</string><key>PORT</key><string>${config.port}</string><key>MASAFLOW_DATA_DIR</key><string>${xml(config.dataDirectory)}</string></dict>\n<key>StandardOutPath</key><string>${xml(path.join(config.logDirectory, 'startup.log'))}</string>\n<key>StandardErrorPath</key><string>${xml(path.join(config.logDirectory, 'startup-error.log'))}</string>\n</dict></plist>\n`;
  return { label, target, domain: `gui/${uid}`, plistPath, runtime, plist };
}
function launchctl(args) {
  return spawnSync('/bin/launchctl', args, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
}
function checked(run, args) {
  const result = run(args);
  if (result.status !== 0) throw new Error(`launchctl ${args[0]} failed: ${String(result.stderr || result.error?.message || result.stdout || 'unknown error').trim()}`);
  return result;
}
async function status({ config = configuration(), details = agentDetails(config), run = launchctl, probe = probeHealth } = {}) {
  let installed = false;
  try { await fs.access(details.plistPath); installed = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const current = run(['print', details.target]);
  const loaded = current.status === 0;
  const pid = loaded ? Number(/\bpid = (\d+)/.exec(current.stdout || '')?.[1] || 0) || null : null;
  return { installed, loaded, pid, health: (await probe(config)).state, label: details.label, plistPath: details.plistPath, url: config.url, logDirectory: config.logDirectory };
}
async function install({ config = configuration(), details = agentDetails(config), run = launchctl, probe = probeHealth, dryRun = false } = {}) {
  const before = await status({ config, details, run, probe });
  if (before.health === 'occupied') { const error = new Error(`Port ${config.port} is occupied by another service. Nothing was changed.`); error.code = 'PORT_IN_USE'; throw error; }
  if (before.health === 'ready' && !before.pid) { const error = new Error('MasaFlow is already running outside its login agent. Stop that server before enabling login startup; no running process was stopped.'); error.code = 'UNMANAGED_RUNNING'; throw error; }
  if (dryRun) return { action: 'install', dryRun: true, ...before, runtime: details.runtime, plist: details.plist };
  let previous;
  try { previous = await fs.readFile(details.plistPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(path.dirname(details.plistPath), { recursive: true, mode: 0o700 });
  await prepareLogs(config);
  if (before.loaded) checked(run, ['bootout', details.target]);
  const temporary = `${details.plistPath}.tmp-${process.pid}`;
  try {
    await fs.writeFile(temporary, details.plist, { mode: 0o600 });
    await fs.rename(temporary, details.plistPath);
    checked(run, ['enable', details.target]);
    checked(run, ['bootstrap', details.domain, details.plistPath]);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    if (previous) await fs.writeFile(details.plistPath, previous, { mode: 0o600 });
    else await fs.rm(details.plistPath, { force: true });
    if (before.loaded && previous) run(['bootstrap', details.domain, details.plistPath]);
    throw error;
  }
  return { action: 'installed', label: details.label, plistPath: details.plistPath, url: config.url, logDirectory: config.logDirectory };
}
async function uninstall({ config = configuration(), details = agentDetails(config), run = launchctl, probe = probeHealth, dryRun = false } = {}) {
  const before = await status({ config, details, run, probe });
  if (dryRun) return { action: 'uninstall', dryRun: true, ...before };
  if (before.loaded) checked(run, ['bootout', details.target]);
  await fs.rm(details.plistPath, { force: true });
  return { action: 'uninstalled', label: details.label, url: config.url, retainedDataDirectory: config.dataDirectory };
}
function argumentsFor(argv) {
  const options = { command: argv[0] || 'status', dryRun: false };
  if (!['install', 'uninstall', 'status'].includes(options.command)) throw new Error('Use mac-login.cjs install|uninstall|status [--dry-run] [--workspace PATH].');
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--dry-run') options.dryRun = true;
    else if (argv[i] === '--workspace' && argv[i + 1]) options.workspace = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return options;
}
if (require.main === module) {
  Promise.resolve().then(async () => {
    if (process.platform !== 'darwin') throw new Error('Login startup is available on macOS.');
    if (!supportedVersion(process.version)) throw new Error(`Node.js ${MINIMUM_NODE} or newer is required.`);
    const options = argumentsFor(process.argv.slice(2));
    const config = configuration({ workspace: options.workspace });
    const result = await ({ install, uninstall, status }[options.command])({ config, dryRun: options.dryRun });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
module.exports = { xml, agentDetails, launchctl, status, install, uninstall, argumentsFor };
