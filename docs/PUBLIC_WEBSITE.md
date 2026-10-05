# Customer website and business POS

MasaFlow has one shared server and two interfaces. Customers can place an order from any internet connection. Staff sign in to review and accept each order, start cooking, and mark it ready for pickup. Customers follow those status changes live. Cash is collected at pickup; unpaid cancellations and no-shows do not count as revenue.

| Address | Purpose |
| --- | --- |
| `/` or `/order` | Customer menu and checkout |
| `/track?order=ORDER_UUID` | Live tracking for that private order link |
| `/readypickupUI.html` | Public pickup board with ticket numbers and kitchen stages |
| `/pos` | Business order queue; redirects to sign-in when needed |
| `/insights` | Operations and Sales analytics; staff access required |
| `/staff-login.html` | Staff sign-in, current session and sign-out |

Customer checkout creates an order in review. Staff acceptance moves it into cooking, and marking it ready notifies the customer's tracking screen. Staff records tender and change at pickup; only then is the cash receipt recorded and the order completed. Unpaid orders can be cancelled as no-shows without recording revenue. The customer tracking screen follows saved states without refreshing and can offer an opt-in browser notification when the order is ready; reliable background push and SMS are not configured.

Sales, revenue charts and top dishes use verified paid orders for the selected day, month or year in `America/Mexico_City`. Unpaid orders do not inflate revenue or popularity. The runtime is digital-only: it has no printer integration, receipt-print controls, or cash-drawer hardware commands.

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
4. Visit the customer address from a phone using cellular data. On another device, open `/pos`, sign in, and verify an order through review, acceptance, cooking, ready, cash collection at pickup, and the corresponding sales report. Cancel an unpaid test order to verify it is excluded from revenue.
5. Create a manual backup with `docker compose exec app npm run backup`. List snapshots with `docker compose exec app npm run backups`. Copy verified archives to a separate private backup location. Keep the named data volume when upgrading; `docker compose down -v` deletes it and must not be used for routine updates.

Use one app instance with its existing serialized store and writer lock. Do not start separate local and cloud ledgers for the same business: all staff and customer devices should use the same public service. Independent restaurant instances and multiple writers would require a different storage model. A new host starts with editable demo menu prices and no operational receipts; migrating an existing ledger is a separate, deliberate backup/restore step.

To restore a cloud snapshot, stop the app, then run the restore CLI in a one-off container using the same named volume: `docker compose stop app`, followed by `docker compose run --rm --no-deps app npm run restore -- /data/backups/FILE.json --confirm`, then `docker compose up -d app`. Verify the chosen snapshot first and follow [BACKUPS.md](BACKUPS.md); restoration preserves the previous ledger and treats any historical hardware metadata as inert.

## Digital-only operation

Orders, status updates, receipts, tender calculations, and the ledger are stored digitally. No printer, cash-drawer pulse, or other peripheral command is issued. Staff may export transaction data as CSV.

## Verification

`npm test` includes customer/staff authorization, redacted broadcasts, private ticket tracking, idempotent orders, authoritative prices, payment-gated sales, monthly/yearly popularity, session expiry, logout and origin checks. `tests/browser-acceptance.cjs` uses separate customer and staff browser sessions, signs staff in, recovers a lost order response, completes payment and fulfillment, reconciles the drawer and checks mobile layouts. All fixtures use temporary stores, not restaurant records.
