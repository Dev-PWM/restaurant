// An adapter for the existing ledger engine. All archive and live writes for a
// command are committed in one SQLite transaction by the Durable Object.
export function createSqlFiles(sql) {
  sql.exec('CREATE TABLE IF NOT EXISTS ledger_files (name TEXT NOT NULL, part INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(name, part))');
  const nameOf = file => String(file).split('/').at(-1);
  const exists = file => [...sql.exec('SELECT 1 FROM ledger_files WHERE name = ? LIMIT 1', nameOf(file))].length > 0;
  function read(file) {
    const rows = [...sql.exec('SELECT body FROM ledger_files WHERE name = ? ORDER BY part', nameOf(file))];
    if (!rows.length) throw Object.assign(new Error('Ledger file not found'), { code: 'ENOENT' });
    return rows.map(row => row.body).join('');
  }
  function write(file, value) {
    const name = nameOf(file);
    const body = typeof value === 'string' ? value : JSON.stringify(value);
    // Chunk below SQLite row limits, even for a large historical archive.
    const existing = [...sql.exec('SELECT part, body FROM ledger_files WHERE name = ? ORDER BY part', name)];
    let start = 0, part = 0;
    while (start < body.length) {
      let end = Math.min(start + 32768, body.length);
      // Avoid splitting a surrogate pair at a SQLite string boundary.
      if (end < body.length && body.charCodeAt(end - 1) >= 0xD800 && body.charCodeAt(end - 1) <= 0xDBFF) end--;
      const chunk = body.slice(start, end);
      if (existing[part]?.body !== chunk) sql.exec('INSERT OR REPLACE INTO ledger_files(name, part, body) VALUES (?, ?, ?)', name, part, chunk);
      start = end; part++;
    }
    if (existing.length > part) sql.exec('DELETE FROM ledger_files WHERE name = ? AND part >= ?', name, part);

  }
  return {
    write, read, exists,
    names: () => [...sql.exec('SELECT DISTINCT name FROM ledger_files ORDER BY name')].map(row => row.name),
    fs: { mkdirSync() {}, chmodSync() {}, existsSync: exists, readFileSync: read, copyFileSync: (from, to) => write(to, read(from)) },
  };
}
