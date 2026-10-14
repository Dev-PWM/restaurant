#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'cloudflare/public');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
const result = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_REALTIME_TRANSPORT: 'cloudflare', MASAFLOW_OUTPUT_ROOT: output } });
if (result.status !== 0) process.exit(result.status || 1);
fs.cpSync(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
for (const file of ['manifest.webmanifest', 'sw.js']) fs.copyFileSync(path.join(root, 'assets', file), path.join(output, file));
console.log('Cloudflare assets prepared. Local Node builds still use the default transport.');
