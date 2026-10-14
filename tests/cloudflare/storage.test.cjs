'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createEngine } = require('../../shared/realtime/engine.js');
test('SQLite adapter round-trips large unicode files and rolls archive and ledger writes back together', async () => {
  const { createSqlFiles } = await import('../../cloudflare/storage.mjs');
  const db = new DatabaseSync(':memory:');
  const sql = { exec: (query, ...params) => db.prepare(query).all(...params) };
  try {
    const files = createSqlFiles(sql);
    const emoji = 'a'.repeat(32767) + '🌮'.repeat(90000);
    files.write('archive_unicode.json', emoji);
    assert.equal(files.read('archive_unicode.json'), emoji);
    files.write('archive_unicode.json', 'short');
    assert.equal(files.read('archive_unicode.json'), 'short');
    const engine = createEngine({ directory: '/ledger', fileSystem: files.fs, persist: files.write });
    const before = engine.getState();
    db.exec('BEGIN');
    engine.dispatch('pos_close_shift', { shiftId: before.shiftId, expectedRevision: before.revision });
    db.exec('ROLLBACK');
    const recovered = createEngine({ directory: '/ledger', fileSystem: files.fs, persist: files.write });
    assert.deepEqual(recovered.getState(), before);
    assert.equal(files.names().filter(name => name.startsWith('archive_') && name !== 'archive_unicode.json').length, 0);
  } finally { db.close(); }
});
