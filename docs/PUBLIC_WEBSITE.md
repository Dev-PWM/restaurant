# Customer website and business POS

MasaFlow has one shared server and two interfaces. Customers can place an order from any internet connection. Staff sign in to the business interface to receive the name, dishes, modifiers and notes, collect Mexican-peso cash, and control preparation and pickup. Customers pay the full amount at the physical counter before the kitchen starts. Submitting an order never charges money online.

| Address | Purpose |
| --- | --- |
| `/` or `/order` | Customer menu and checkout |
| `/track?order=ORDER_UUID` | Live tracking for that private order link |
| `/readypickupUI.html` | Public pickup board with ticket numbers and kitchen stages |
| `/pos` | Business order queue; redirects to sign-in when needed |
| `/insights` | Operations and Sales analytics; staff access required |
| `/staff-login.html` | Staff sign-in, current session and sign-out |

Customer checkout creates an awaiting-cash draft. Staff sees it immediately, takes cash, and records the tender and change. Saving that payment releases the ticket to the pending kitchen queue. Staff advances it to preparing, ready and completed. The customer's tracking screen follows the saved states without refreshing. Keep that screen open to receive updates; this version does not send SMS or background push notifications.

Sales, revenue charts and top dishes use verified paid orders for the selected day, month or year in `America/Mexico_City`. Unpaid online submissions do not inflate revenue or popularity. Drawer floats and cash drops affect drawer reconciliation separately from sales.

## Access and live data

`GET /api/customer/state` and `/api/customer/events` return the public menu. Add `order=UUID` or `submissionId=UUID` to retrieve just that private ticket. UUID links act as private tracking credentials: avoid sharing them or placing them in public analytics logs. `board=1` exposes only ticket numbers, statuses and timestamps, with no tracking UUIDs, names, phone numbers, order contents, payment amounts or drawer data. Only the linked customer receipt includes its own tender and change. The server verifies payment evidence before showing a paid ticket on the board.

`POST /api/customer/orders` accepts `{ "action": "createDraft", "args": [ORDER_INPUT] }`. Input includes a persistent submission UUID, customer name and line selections. The server determines prices and status. Identical retries recover the same ticket after a lost response. Staff-only APIs reject unauthenticated callers when staff access is configured; customers cannot collect cash, change preparation stages, edit menus, generate summaries, or read the financial ledger.

The existing HTTP actions plus Server-Sent Events supply immediate updates in both directions: a customer action is saved on the server and broadcast to staff; a staff action is saved and broadcast to that customer's tracking connection. SSE reconnects automatically. This preserves durable records and receipt validation.

## Configure staff access locally

Put `MASAFLOW_STAFF_PASSWORD` in the ignored `.env` file, using a unique password of at least 12 characters. Start with the Mac launcher, which reads `.env`, or `node --env-file=.env server.js`. The default `npm start` reads exported environment variables.

Staff sessions use an HttpOnly, SameSite cookie and expire after 12 hours. Public HTTPS mode also marks the cookie Secure. Sign-out revokes the session and closes its staff streams. Restarting the service clears sessions and requires staff to sign in again. Changing the environment password and restarting revokes all sessions. This version has one shared business password, not individual roles or account recovery. Sign-in attempts are limited to ten per 15 minutes per server-observed network peer, and public order submissions to sixty per minute per peer. Behind the bundled proxy the peer is shared, so these are restaurant-wide limits; the server does not trust arbitrary forwarded client-IP headers.

Without a password, localhost remains a development mode with open staff access. The command-line server refuses a non-loopback bind without a password, and a configured public origin always requires one. Configure both variables before using any public proxy or tunnel.

## Public deployment package

The repository includes a Docker image, `compose.yaml`, and a Caddy reverse proxy. It runs one Node service with a persistent `restaurant-data` volume. The application port stays on the internal container network; only the HTTPS proxy publishes ports. Caddy handles HTTPS certificates and redirects HTTP to HTTPS after the domain points to the host and ports 80/443 are reachable. Its proxy flushes events immediately for live order tracking. See the official [Caddy HTTPS guide](https://caddyserver.com/docs/automatic-https), [reverse proxy reference](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), and [Docker Node guide](https://docs.docker.com/guides/nodejs/).

A domain and an always-on Linux host with Docker Compose are still required. No hosting account or domain has been purchased or provisioned. The app has been tested locally; the container build and public HTTPS connection must be verified on that host before opening ordering to customers.

1. Obtain a domain and Linux host. Point the chosen hostname's DNS to the host. Allow incoming TCP ports 80 and 443. UDP 443 is optional for HTTP/3.
2. Copy the project to the host, and copy `.env.example` to `.env`. Set `MASAFLOW_DOMAIN=orders.your-domain.com` and a unique `MASAFLOW_STAFF_PASSWORD`. Optional AI Gateway credentials also belong in this private file. Restrict its permissions with `chmod 600 .env`. Compose derives `MASAFLOW_PUBLIC_ORIGIN=https://...` from the domain; a custom host must explicitly set that HTTPS origin itself.
3. Run `docker compose up -d --build`. The build runs the automated tests and builds analytics. The app runs as the non-root Node user. Inspect `docker compose ps` and `docker compose logs --tail=100 app web` for startup status.
4. Visit the customer address from a phone using cellular data. On another device, open `/pos`, sign in, open a drawer shift, and verify an order through cash collection, cooking, ready, pickup and the corresponding sales report.
5. Create a manual backup with `docker compose exec app npm run backup`. List snapshots with `docker compose exec app npm run backups`. Copy verified archives to a separate private backup location. Keep the named data volume when upgrading; `docker compose down -v` deletes it and must not be used for routine updates.

Use one app instance with its existing serialized store and writer lock. Do not start separate local and cloud ledgers for the same business: all staff and customer devices should use the same public service. Independent restaurant instances and multiple writers would require a different storage model. A new host starts with editable demo menu prices and no operational receipts; migrating an existing ledger is a separate, deliberate backup/restore step.

To restore a cloud snapshot, stop the app, then run the restore CLI in a one-off container using the same named volume: `docker compose stop app`, followed by `docker compose run --rm --no-deps app npm run restore -- /data/backups/FILE.json --confirm`, then `docker compose up -d app`. Verify the chosen snapshot first and follow [BACKUPS.md](BACKUPS.md); restoration preserves the previous ledger and suppresses uncertain drawer-pulse replay.

## Physical counter hardware

The current ESC/POS integration opens a configured TCP printer connection from the server. A cloud server cannot automatically reach a printer on the restaurant's private LAN. Leave the printer host empty for simulated pulses until a private network path or a local hardware bridge is configured and tested. Do not expose the printer port to the public internet. The browser print dialog continues to support receipt printing at the counter.

## Verification

`npm test` includes customer/staff authorization, redacted broadcasts, private ticket tracking, idempotent orders, authoritative prices, payment-gated sales, monthly/yearly popularity, session expiry, logout and origin checks. `tests/browser-acceptance.cjs` uses separate customer and staff browser sessions, signs staff in, recovers a lost order response, completes payment and fulfillment, reconciles the drawer and checks mobile layouts. All fixtures use temporary stores, not restaurant records.
