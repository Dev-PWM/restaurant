'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { validateSchedule, isOpen, createSupervisor, plist } = require('../scripts/server-schedule.cjs');
const schedule = { timeZone: 'America/Mexico_City', days: [1, 2, 3, 4, 5, 6], start: '09:30', end: '17:00' };
test('Mexico City opening and closing boundaries, weekdays and summer/winter offsets', () => {
  for (const date of ['2026-10-12', '2026-01-12', '2026-07-13']) {
    assert.equal(isOpen(schedule, new Date(`${date}T15:29:59Z`)), false);
    assert.equal(isOpen(schedule, new Date(`${date}T15:30:00Z`)), true);
    assert.equal(isOpen(schedule, new Date(`${date}T22:59:59Z`)), true);
    assert.equal(isOpen(schedule, new Date(`${date}T23:00:00Z`)), false);
  }
  assert.equal(isOpen(schedule, new Date('2026-10-17T18:00:00Z')), true);
  assert.equal(isOpen(schedule, new Date('2026-10-18T18:00:00Z')), false);
  assert.equal(isOpen(schedule, new Date('2026-10-13T05:00:00Z')), false);
});
test('reject invalid timezone, weekdays and overnight or invalid times', () => {
  for (const change of [{ timeZone: 'Mexico' }, { days: [] }, { days: [7] }, { days: ['1'] }, { start: '9:30' }, { end: '24:00' }, { start: '18:00' }]) assert.throws(() => validateSchedule({ ...schedule, ...change }));
});
function fixture(create) {
  let date = new Date('2026-10-14T15:29:59Z');
  let starts = 0;
  let stops = 0;
  const reports = [];
  const supervisor = createSupervisor({ schedule, port: 3000, now: () => date, report: state => reports.push(state), record: () => {}, createService: async () => {
    starts++;
    if (create) return create();
    const server = new EventEmitter();
    server.listen = (_port, _host, ready) => ready();
    return { server, close: async () => { stops++; } };
  } });
  return { supervisor, reports, at: value => { date = new Date(value); }, counts: () => ({ starts, stops }) };
}
test('server stays running before opening, after closing and on Sunday until explicitly disabled', async () => {
  const f = fixture();
  await f.supervisor.tick();
  assert.deepEqual(f.counts(), { starts: 1, stops: 0 });
  assert.equal(f.supervisor.state().ordersOpen, false);
  f.at('2026-10-14T15:30:00Z');
  await f.supervisor.tick(); await f.supervisor.tick();
  assert.equal(f.supervisor.state().ordersOpen, true);
  f.at('2026-10-14T23:00:00Z'); await f.supervisor.tick();
  assert.equal(f.supervisor.state().ordersOpen, false);
  f.at('2026-10-18T18:00:00Z'); await f.supervisor.tick();
  assert.deepEqual(f.counts(), { starts: 1, stops: 0 });
  await f.supervisor.shutdown(); await f.supervisor.tick();
  assert.deepEqual(f.counts(), { starts: 1, stops: 1 });
});
test('port conflict closes only its own pending service and throttles retries', async () => {
  let closes = 0;
  const f = fixture(() => {
    const server = new EventEmitter();
    server.listen = () => { server.emit('error', new Error('Port occupied')); };
    return { server, close: async () => { closes++; } };
  });
  f.at('2026-10-14T18:00:00Z'); await f.supervisor.tick(); await f.supervisor.tick();
  assert.equal(f.counts().starts, 1); assert.equal(closes, 1);
  assert.equal(f.supervisor.state().server, 'stopped');
  assert.equal(f.supervisor.state().lastError, 'Port occupied');
  f.at('2026-10-14T18:01:00Z'); await f.supervisor.tick();
  assert.equal(f.counts().starts, 2);
});
test('launch agent keeps the supervisor available outside hours and escapes executable paths', () => {
  const xml = plist('/test/node & runtime');
  assert.match(xml, /node &amp; runtime/);
  assert.match(xml, /<key>KeepAlive<\/key><true\/>/);
  assert.match(xml, /<string>run<\/string>/);
  assert.doesNotMatch(xml, /MASAFLOW_STAFF_PIN|MASAFLOW_STAFF_PASSWORD/);
});
test('real restaurant service remains available after hours and shuts down only when disabled', async t => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const net = require('node:net');
  const { createService } = require('../server.js');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'restaurant-schedule-'));
  let date = new Date('2026-10-14T18:00:00Z');
  const available = net.createServer();
  await new Promise(resolve => available.listen(0, '127.0.0.1', resolve));
  const port = available.address().port;
  await new Promise(resolve => available.close(resolve));
  const supervisor = createSupervisor({ schedule, port, host: '127.0.0.1', now: () => date, report: () => {}, record: () => {}, createService: () => createService({ dataDirectory: directory, pin: '1234', port, enableMdns: false }) });
  t.after(async () => { await supervisor.shutdown(); await fs.rm(directory, { recursive: true, force: true }); });
  await supervisor.tick();
  assert.equal(supervisor.state().lastError, null);
  const health = await fetch(`http://127.0.0.1:${port}/api/health`).then(res => res.json());
  assert.equal(health.service, 'masaflow'); assert.equal(health.status, 'ready');
  for (const route of ['/order/', '/pos/', '/analytics/']) assert.equal((await fetch(`http://127.0.0.1:${port}${route}`)).status, 200);
  date = new Date('2026-10-14T23:00:00Z'); await supervisor.tick();
  assert.equal(supervisor.state().server, 'running');
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
  date = new Date('2026-10-15T18:00:00Z'); await supervisor.tick();
  assert.equal(supervisor.state().lastError, null);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
});
test('reinstall waits out transient launchd removal failures and bounds other failures', async () => {
  const { bootstrapAgent } = require('../scripts/server-schedule.cjs');
  let calls = 0;
  let waits = 0;
  await bootstrapAgent({ run: () => ({ status: ++calls < 4 ? 5 : 0, stderr: 'removal pending' }), wait: async () => { waits++; } });
  assert.equal(calls, 4); assert.equal(waits, 3);
  calls = 0;
  await assert.rejects(bootstrapAgent({ run: () => { calls++; return { status: 5, stderr: 'persistent failure' }; }, wait: async () => {}, attempts: 3 }), /persistent failure/);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(bootstrapAgent({ run: () => { calls++; return { status: 64, stderr: 'invalid arguments' }; }, wait: async () => {} }), /invalid arguments/);
  assert.equal(calls, 1);
});
test('customer hours text follows changed hours and weekdays', () => {
  const { orderingHoursText } = require('../shared/ui/ordering-hours.js');
  const text = orderingHoursText({ ...schedule, open: false, days: [2, 3, 4, 5], start: '10:00', end: '18:30' });
  assert.match(text.hours, /martes a viernes/);
  assert.match(text.hours, /10:00/);
  assert.match(text.hours, /6:30/);
  assert.equal(text.zone, 'Hora de Ciudad de México.');
});
