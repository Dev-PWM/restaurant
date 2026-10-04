# MasaFlow backups and restore

MasaFlow saves the live ledger to `state.json` in its configured data directory and creates separate snapshots in that directory's `backups` folder. The default data directory is the Git-ignored `.masaflow` folder in this repository. A backup contains menu settings, draft and paid orders, payment snapshots, shifts and frozen audits, cash drops, audit events, and drawer delivery records. It contains the same private operational information as the ledger; keep copies in a location you control.

Automatic backups run at service startup, after the first changed committed revision at least one hour after the previous automatic backup, and whenever a shift closes. An hour without changes creates no extra snapshot. Snapshots are written to a temporary file, flushed, and atomically renamed. Each has a SHA-256 checksum that restore verifies before using its data. A failed automatic backup does not undo a saved cash payment or a closed audit. Check the health endpoint's `backup.error` and correct disk-space or folder-access issues promptly.

Automatic snapshots older than 30 days are removed after a successful backup. Manual snapshots and snapshots taken immediately before restoration are retained. Damaged files are reported by the listing and retained for inspection. Local snapshots protect against accidental changes; keep a separate copy on another disk or a private backup service to recover from a failed or lost Mac.

## Create and inspect backups

Run these commands from the repository directory:

```sh
npm run backup
npm run backups
npm run backup:verify -- "/absolute/path/to/backup.json"
```

`backup` takes a manual snapshot of the running instance when its health identity matches the configured data directory. If that instance is stopped, it takes the writer lock and reads the saved ledger directly. It never creates a second ledger writer. `backups` lists snapshot filenames, saved revisions, dates, and damaged-file markers. `backup:verify` checks the checksum, supported data version, revision, and settings without modifying the ledger.

The server also provides metadata-only `GET /api/backups`, `POST /api/backups/create`, and `GET /api/health` endpoints for the trusted local installation. Creating a manual backup does not change the financial revision. Health includes the last successful backup time and revision and an error message when a backup fails. These APIs do not expose backup file contents.

To target an alternate data directory, add `--data-dir` with an explicit path:

```sh
npm run backups -- --data-dir "/absolute/path/to/restaurant-data"
npm run backup -- --data-dir "/absolute/path/to/restaurant-data"
```

Keep the data-directory setting consistent with the server and [Mac startup configuration](MAC_STARTUP.md). Do not copy a live `state.json` during a write; use a verified snapshot instead.

## Restore a verified snapshot

Restoration replaces the current operational ledger with the selected snapshot. Orders and transactions recorded after that snapshot will no longer appear in the active ledger. The command keeps a separate copy of the previous ledger before replacement, so those records remain available for review or recovery.

1. Stop the server. If login startup is enabled, use **Disable Login Startup.command** first. Stop a manually started instance normally. A running instance holds the data-directory lock, and restoration refuses to proceed while that lock is owned by a live process.
2. List snapshots and verify the file you intend to restore. Use its complete path so the selected file is unambiguous.
3. Run restore with explicit confirmation:

   ```sh
   npm run restore -- "/absolute/path/to/backup.json" --confirm
   ```

   For an alternate directory:

   ```sh
   npm run restore -- "/absolute/path/to/backup.json" --confirm --data-dir "/absolute/path/to/restaurant-data"
   ```

4. Read the resulting revision, source revision, safety-backup filename, and excluded-receipt count. Restart MasaFlow with **Start MasaFlow.command** or re-enable login startup. Review the shift, receipts, and drawer exception list before resuming service.

Restore verifies the source first, writes the safety snapshot successfully, and then atomically replaces `state.json`. If validation or safety-backup creation fails, it leaves the current ledger untouched. If the current ledger is damaged, restoration preserves its original text and checksum in a `pre-restore-damaged` archive before replacement. That archive is evidence for recovery, not a normal restorable snapshot, and its listing is marked damaged.

The restored revision advances beyond both the source revision and the current saved revision. The ticket counter keeps the higher saved value to avoid reusing ticket numbers. Legacy USD records preserve their original amounts; migration does not convert them into MXN. Closed shift balances and variances remain frozen. Financial rows with inconsistent receipt evidence are preserved and continue to appear in exclusion counts rather than being silently repaired or deleted.

Pending payments and reserved drawer jobs become **unknown** after restore. Restarting the service does not replay those drawer pulses. Inspect the physical drawer before deliberately requesting a new manual pulse; the restored snapshot cannot prove what happened at the printer after it was taken.

## Checks

`node --test tests/local-data.test.js` uses isolated temporary data directories. It checks checksum rejection, one-writer locking, real launcher health identity, manual and automatic snapshots, retention, successful and failed restores, legacy currencies, frozen audits, uncertain drawer delivery, startup lock release, and backup failures during saved cash transactions. It does not restore or add transactions to the restaurant's operational ledger.
