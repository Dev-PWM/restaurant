# Operations, diagnostics and security

How to watch MasaFlow while it runs, find out why it stopped, and check it before a rush. Everything here is local-first: nothing is sent to a third party, and the tools that create fake orders only ever talk to a disposable server.

## 1. Logs

The server writes structured JSON (one object per line) with `pino` to two places:

- the terminal, and
- **`logs/server_YYYY-MM-DD.log`**, one file per day in the restaurant's timezone (America/Mexico_City), so a shift that runs past midnight UTC stays in one file.

The one-line startup banner on the terminal is now a JSON line (`"msg":"MasaFlow listo"` with the URL); `npm run dev` still prints its own friendly banner. Change the folder with `MASAFLOW_LOG_DIR` and the verbosity with `MASAFLOW_LOG_LEVEL` (`info` by default; `debug` adds socket connect/disconnect). In Docker the folder is `/data/logs`, on the same volume as the ledger, so it survives a rebuilt container.

What is logged: startup and shutdown, every accepted command (`event`, `orderId`, payload `bytes`), every rejected command (`code`, `reason`), failed staff logins, rejected sockets, and a final `uncaughtException` line before a crash. Files are append-only and written synchronously, so the last line before a crash is on disk. A full, read-only or missing log folder is reported once on stderr (and retried every 30 s) but never throws into the code that logged, so it cannot take down or fail a payment.

PINs, staff tokens and authorization headers are redacted wherever they appear in a log object. Customer names are not logged; use the order id.

```sh
# Everything that went wrong today
jq -c 'select(.level >= 40)' logs/server_$(date +%F).log
# Every payment, with the size of the payload
jq -c 'select(.event=="pos_order_paid")' logs/server_$(date +%F).log
```

## 2. Socket.io Admin UI (optional)

A live view of connected clients, transports, namespaces, aggregated event counts and server load, without adding `console.log` calls. It is **off unless you configure a password**:

```sh
npm run admin:hash      # prompts without echo, prints MASAFLOW_ADMIN_PASSWORD_HASH='...'
# paste that line into .env, restart, then open http://localhost:3000/admin-ui/
```

In the dialog, use **Server URL** `http://localhost:3000`, user `admin`, and your password.

Safeguards, because the server listens on the whole network:

- The page and the `/admin` namespace answer **only to this computer**. A request relayed by the Vite dev proxy for another device is refused.
- It is **read-only** (no disconnecting sockets or emitting events from the dashboard) and limited to 20 login attempts a minute per address, checked before any password hashing runs.
- It runs in the Admin UI's **production mode**, deliberately. The full-detail "development" mode streams every socket's data (which here includes the staff session token) and the arguments of every event (including the PIN typed at login) to the dashboard. Production mode shows counts, not contents; this was verified by logging in as staff while listening on the admin channel. Per-command payload sizes are in the log (`bytes`) instead.
- A malformed hash stops the server from starting rather than exposing an unprotected dashboard.
- It is not reachable from inside Docker (container traffic does not arrive from loopback). Run the server directly on the Mac if you want it.

The dashboard's fonts and icons load from public CDNs in your browser; the data itself never leaves your machine.

## 3. Crash and memory diagnostics

```sh
# Terminal 1: a throwaway server with the inspector open (this computer only)
MASAFLOW_DATA_DIR=/tmp/masaflow-heap MASAFLOW_STAFF_PIN=4321 PORT=3999 npm run start:inspect

# Terminal 2, after taking a first heap snapshot in chrome://inspect → Memory:
MASAFLOW_STAFF_PIN=4321 npm run loadtest -- --target=http://127.0.0.1:3999 --disposable --only=sockets
```

Take a second snapshot when the load test ends and compare: `activeOrders`, `sessions` and `limits` should shrink back once the rush is over. Never bind the inspector to `0.0.0.0`; it allows remote code execution.

What was reviewed for leaks:

| State | Bound |
|---|---|
| Active orders | hard cap of 500, enforced in the engine |
| Staff sessions | expired entries are purged every 10 s and on every login; at most 1000 |
| Rate-limit counters | purged on every use; at most 5000 keys |
| Per-socket listeners | attached per connection and released with the socket |
| React timers (ticket clock, training countdowns, payment undo) | cleared on unmount; a pending live payment is flushed instead of dropped |

The ledger is written by a temporary-file replacement with fsync and every command is applied synchronously on one thread, so two sockets emitting in the same millisecond are serialized; there is no write race to guard against.

## 4. Load and stress testing

`npm run loadtest` starts a **disposable** server (temporary data folder, random PIN), so fake orders can never reach the real ledger, runs both profiles and deletes everything afterwards. To aim at your own throwaway server instead: `MASAFLOW_STAFF_PIN=xxxx npm run loadtest -- --target=http://127.0.0.1:3999 --disposable`.

| Command | What it does | Fails when |
|---|---|---|
| `npm run loadtest:assets` | autocannon: 10 connections, then a 200-connection spike (2 worker threads) on `/api/health`, `/order/`, `/pos/` and the JS bundle, while a Socket.io probe measures ack latency once a second | any error, timeout or non-2xx; p99 over 1000 ms; a socket ack over 500 ms or timing out during the spike |
| `npm run loadtest:sockets` | Artillery (`artillery/masaflow.yml`): 50 phones submit `submit_client_order` while one POS cashier accepts, readies and pays every ticket with `pos_update_status` / `pos_order_paid` | any rejected or timed-out ack; p99 over 500 ms (acks) or 1000 ms (broadcast delivery) |

Each simulated phone presents its own address in `x-forwarded-for`, which the server honors only from loopback, so the per-address rate limits are exercised realistically instead of throttling one client. Artillery 2.0.34 (pinned in `scripts/loadtest.cjs`) is fetched with `npx` on first use; if npm reports a root-owned cache, fix it once with `sudo chown -R "$(id -u):$(id -g)" ~/.npm` or run with `npm_config_cache=/some/folder`.

Reference run on a development Mac (2026-10-07): 200-connection static spike, about 10,700 requests/s, p99 41 ms, 0 failures, while Socket.io acks stayed under 20 ms. 50 phones plus the cashier: 200 acked commands, 0 rejected, 0 timeouts, p99 about 50 ms for submits, 40 ms for POS actions and 50 ms for broadcast delivery. Treat these as a baseline for comparison, not a guarantee for other hardware.

## 5. Static analysis

| Command | Needs | Checks |
|---|---|---|
| `npm run scan` | nothing extra | ReDoS scan + `npm audit --omit=dev` |
| `npm run scan:regex` | nothing extra | Parses every first-party JS/TS/TSX file into an AST (Babel), finds each regular expression and `new RegExp(...)`, and attacks it with adversarial input under a time limit. **Exponential** stalls always fail. **Quadratic** stalls and non-literal `new RegExp(x)` fail in code reachable with customer input (`server.js`, `shared/`, the customer and POS apps) and are advisory in the analytics dashboard. Silence a reviewed line with a `redos-scan-ignore` comment. The customer-facing part also runs in `npm test`. |
| `npm run scan:sast` | the [Semgrep](https://semgrep.dev) CLI | `.semgrep/masaflow.yml`: nested-quantifier regexes, dynamic `RegExp`, `eval`, raw HTML sinks, shell injection, a staff PIN in client code, a default PIN, wildcard CORS |
| `npm run scan:secrets` | the [Gitleaks](https://github.com/gitleaks/gitleaks) CLI | default rules plus a rule for committed staff PINs and admin hashes (`.gitleaks.toml`) |

Current results (2026-10-07): 344 regular expressions scanned, **0 exponential**, none flagged in code reachable with customer input. The customer name is capped at 60 characters, at most 40 lines and 500 active orders, and modifiers are matched by catalog id, never parsed from text. Eleven quadratic patterns (such as `/\s+trend$/`) and eight dynamic `RegExp` calls remain in `apps/analytics/src`; they run on labels the server itself produced, not on customer input. `npm audit --omit=dev`: 0 vulnerabilities (re-checked after adding `pino`, `@socket.io/admin-ui` and `bcryptjs`). The full audit reports six dev-only findings, none of which ship in the Docker image: three high in `braces` via `vite-plugin-singlefile` (analytics build tooling, no upstream fix) and three moderate in `uuid` via `hyperid` via `autocannon` (the load-test tool). The Semgrep and Gitleaks configurations are syntax-checked, and their regex rule is tested, but the two CLIs were not available to run here.

## 6. Known findings and decisions

- **Default staff PIN.** `server.js` and `scripts/dev.cjs` fall back to `1234` when `MASAFLOW_STAFF_PIN` is unset, and `.env.example` shows the same value. Anyone who knows the project can sign in to a server started without a PIN. Not changed, because it would stop an unconfigured install from starting; the Semgrep rule `masaflow-staff-pin-default` tracks it.
- **Wildcard CORS** (`origin: "*"`) on the Socket.io server. Customer sessions are UUID-scoped and rate-limited per address, but a same-origin policy would be tighter. The Vite dev setup needs the current behaviour, so it was left alone.
- **`bun.lock` is not updated** by `npm install`. The Dockerfile and `npm ci` use `package-lock.json`; regenerate `bun.lock` with Bun if you rely on it.
- **Per-command state copy.** Every command clones the whole ledger (`structuredClone`) before applying it. Cheap at restaurant scale (the load test above), but it is the first thing to look at if the 500-order cap is ever raised.

## 7. Training mode and the payment undo window

- **Real payments reach the ledger about 5 seconds after "Confirmar pago".** In that window the ticket is grayed out with a countdown and a **Deshacer** button. Closing the tab asks for confirmation; locking the session and starting the simulator are disabled; leaving the page sends the payment instead of dropping it. If the send fails (for example the connection dropped), a red notice says the payment was **not** recorded and the ticket returns to "Cobrar".
- **«Guía interactiva»** (POS) suspends the realtime connection and works on local sample tickets; it can never emit a command. Its code is `apps/business-pos/src/simulator.js` and the guided flow in `LiveOrders.tsx`. The final exam is graded by `evaluateRush` in the same module.
