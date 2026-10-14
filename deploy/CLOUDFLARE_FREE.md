# Cloudflare Workers deployment (free-tier architecture)

This is the selected deployment. It replaces the paid VM proposal.
The app runs on Workers with one SQLite-backed Durable Object named
`restaurant-v1`. All customer and staff connections share this object and its
single ledger. The Node server remains available for local development/recovery.

## Components and durability

- The existing ledger engine runs against a SQLite file adapter. A command's live
  ledger and shift archive commit in one transaction before acknowledgement.
  Failed transactions reconstruct in-memory state from durable storage.
- Native, hibernating WebSockets replace Socket.IO in the cloud build. Connections
  reconnect without buffering cash actions. Request/payment identifiers retain
  the existing retry behavior. Staff sessions and rate limits persist through
  hibernation and restarts. Customer snapshots contain only that session's orders.
- Business-hours alarms run at opening/closing boundaries while clients are
  connected; no recurring polling timer keeps the Durable Object awake. With no
  clients connected, the next request evaluates the actual Mexico City time.
- Assets have a separate cloud build directory. Building for Cloudflare does not
  replace the files currently served by the local Mac server.
- Customer-domain staff routes are hidden. Staff commands require the existing
  password. WebSocket credentials travel in messages, never URL query strings.

## Build and test

```sh
npm ci
npm run cloud:build
npm run cloud:check
npm run cloud:test
npm test
```

`cloud:test` uses Cloudflare's local runtime and tests ledger import, invalid data,
customer isolation, unauthorized commands, payment retries, hibernation,
restart recovery, revocation and shift archives. SQLite tests cover large Unicode
files and rollback of archive and ledger writes together.

Local preview (test credentials only):

```sh
npm run cloud:dev -- --var STAFF_PASSWORD:local-test-only-password
```

Do not use test credentials on the deployed Worker. For staging migration tests,
use a separate local runtime storage directory, not production data.

## Deployment

The Worker name is `zapata-restaurant`. Its account and the two expected domain
names are in `cloudflare/wrangler.jsonc`. The initial preview is:

`https://zapata-restaurant.zapata-restaurant-821abce2.workers.dev`

```sh
npx wrangler login
npm run cloud:bootstrap
npm run cloud:secrets
```

`cloud:bootstrap` is only for a new Worker; it has no production routes and refuses
to replace an existing Worker. `cloud:deploy` is the production update/cutover
command; it refuses to attach production routes until the cloud health endpoint
confirms the ledger has been imported. The production config includes the live
routes so subsequent updates preserve them.

`cloud:secrets` installs the existing `.env` staff password and a temporary random
migration key. It sends secret values on standard input rather than command-line
arguments. The migration key is stored privately under `.cloud-secrets`.
No command upgrades the Cloudflare plan or purchases a VM, container, or database.

## First migration

1. Finish all staging tests and verify the deployed closed page and staff sign-in.
2. Outside restaurant hours, stop the Mac service with `npm run schedule:disable`.
   The final importer refuses to snapshot a directory with a live writer lock.
3. Import and verify, using the preview origin:

   ```sh
   npm run cloud:import -- https://zapata-restaurant.zapata-restaurant-821abce2.workers.dev
   ```

   This saves a private source backup in `.cloud-backups`, validates the current
   ledger and archives, imports into an unused cloud ledger, exports the cloud
   copy, and compares every imported file and the shift/totals. Different imports
   cannot overwrite a used cloud ledger. Retrying the identical import is safe.
4. Run `npm run cloud:deploy` to attach the two production Worker routes at Cloudflare's edge. Existing proxied
   DNS/tunnel records can stay in place; the Worker handles every matched request
   without contacting the origin. Make the Worker route the sole live server,
   and leave the Mac service disabled to prevent two writable ledgers.
5. Verify both public domains, staff sign-in, existing sales and customer tracking.
   Confirm `/api/health` reports `storage: cloudflare-sqlite` while the Mac server
   is stopped. Check customer-domain staff paths return 404. Refresh any pages
   already open before cutover so they load the new WebSocket transport.
6. Remove the temporary migration credential:

   ```sh
   npx wrangler secret delete MIGRATION_KEY --config cloudflare/wrangler.jsonc
   ```

## Backups, updates and recovery

Save private backups regularly, after shift close or before a release:

```sh
npm run cloud:backup -- https://zapatapos.live
```

The backup includes the current ledger, shift archives and catalog migration
backups. It requires staff authentication and is saved with mode 600 in the
ignored `.cloud-backups` directory. Copy backups to a separate private location.
Do not commit them or send them to code-review services.

Cloudflare's SQLite point-in-time recovery is another recovery option; a recovery
must be planned with all writers stopped and verified before accepting orders.
The first-time importer intentionally cannot overwrite a live ledger. Recovery
into a new isolated Worker requires a separate namespace/config and domain switch.

Future releases: rebuild with `cloud:build`, run the tests, then `cloud:deploy`.
Keep the exact Durable Object binding/class and singleton name: changing them
creates a different ledger. Do not remove the migration history from the config.

The production routes are already in `wrangler.jsonc`. Preserve them on updates.
Never run a direct Wrangler deployment with the bootstrap config on the live
Worker: it intentionally has no production routes.

## Free plan limits and availability

Free usage has hard limits, including Workers requests, Durable Object compute,
SQLite row reads/writes and stored data. Exceeding limits can make operations fail;
the app does not automatically buy an upgrade. Monitor usage in the dashboard.
Close shifts normally so current-shift history does not grow indefinitely. The
storage adapter writes only changed chunks to reduce SQLite row-write usage.
Hibernating WebSockets and boundary-only alarms avoid continuous server compute.

The restaurant must have internet for cloud ordering and staff operations.
A Mac-hosted offline copy is not an automatically synchronized backup POS:
operating independent copies would split the ledger.

## Rollback

Before any cloud transaction, restore the original domain routes and restart the
unchanged Mac copy if needed. After cloud activity, export and reconcile the newest
cloud ledger before reopening the Mac. Never reopen an old source snapshot after
new cloud payments: those payments would be lost from the active records.

## Verified live deployment — October 14, 2026

Both production domains are routed to `zapata-restaurant`. Health checks report
`cloudflare-sqlite` and `migrationComplete: true` with the Mac server stopped.
The Mac LaunchAgent was disabled. All nine source ledger/archive files were
imported and compared, and both the original migration backup and the subsequent
cloud export were restored and checked in isolated local runtimes. Private copies
are retained in `.cloud-backups` with owner-only file permissions.

The account's Workers plans page showed **Free ($0), Current plan**. No paid plan,
container, or VM was enabled. The live desktop/mobile customer closed page, hidden
customer-domain staff routes, staff sign-in, sales view and logout passed, with no
browser errors. The 265 Node tests, three Cloudflare tests, build, deployment dry
run and lint passed. Code review findings were addressed, including the explicit
first-deployment guard and exact restore file-set comparison.

The temporary migration credential was deleted after verification. Normal
opening-hours order/payment behavior was tested in the isolated Cloudflare
runtime; no artificial sales were added to the production ledger during cutover.
