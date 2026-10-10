# Public website release guide

The current React and Socket.IO suite serves three paths from one Node process: `/order/` for customers, `/pos/` for the kitchen and cashier, and `/analytics/` for staff sales reports. A customer submits an unpaid order; staff review, cook, mark it ready, then record cash or a verified BBVA México transfer at pickup. The same ledger supplies all three screens.

## Prepare the host

Use one always-on host with Docker Compose and a domain whose DNS points to it. Open inbound TCP 80 and 443; UDP 443 is optional. The public stack is in `compose.public.yaml`. It exposes Caddy only; the app port stays on the private Compose network. Caddy obtains and renews HTTPS certificates and forwards live Socket.IO connections.

Copy `.env.public.example` to `.env`, set the real `MASAFLOW_DOMAIN` (host name only, with no scheme or path), and set a unique `MASAFLOW_STAFF_PASSWORD` of 12–256 characters. Restrict `.env` to the server owner with `chmod 600 .env`. The stack sets `MASAFLOW_PUBLIC_ORIGIN` to `https://` plus that domain. Staff sign in with the password; the four-digit LAN PIN is not used in public mode. Keep the app port private if adapting this Compose file, because its proxy-aware rate limits trust the isolated Caddy hop.

```sh
docker compose -f compose.public.yaml up -d --build
docker compose -f compose.public.yaml ps
docker compose -f compose.public.yaml logs --tail=100 app web
```

The image build runs `npm test` and `npm run build`; the app runs as the non-root `node` user and stores its ledger and logs in the `restaurant-data` volume. Caddy certificate data has a separate persistent volume. Run a single app instance: the JSON ledger has a single-writer lock and is not a multi-server database. Keep `restaurant-data` when updating; `docker compose down -v` removes it.

## Release checks on the actual host

1. Confirm `https://YOUR_DOMAIN/api/health` returns `status: ready` and the browser shows a valid HTTPS connection.
2. On cellular data, load `/order/`, choose a dish and toppings, submit a test order, and confirm its status survives a refresh.
3. On another device, load `/pos/`, sign in with the staff password, accept the test order, mark it ready, and collect the test payment. Check the matching sale in `/analytics/`.
4. Check desktop and phone layouts, receipt amounts, notification permission behavior, and the bank transfer text. Verify that another customer's browser cannot see the test customer's details.
5. Back up the volume to private storage and test restoring a copy on a separate disposable instance before accepting real orders.

Browser notifications require permission and an open page. Background push and SMS are not configured. Transfer completion is recorded by staff after checking the bank; the site does not verify or initiate a bank payment.

## Current release boundary

The domain and always-on host are pending. Local automated and browser checks cannot prove DNS, certificate issuance, container startup, external connectivity, or backups on the eventual host. Complete the host checks above when those resources are available.
