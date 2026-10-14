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

## Cloudflare Tunnel from the restaurant Mac (two domains, one server)

This is the alternative to the Docker and Caddy host above when the ledger should stay on the restaurant Mac. One Node process serves both brands through an outbound Cloudflare Tunnel, so no router port is opened and the Mac needs no fixed IP.

| Domain | Audience | Lands on | Also reachable |
| --- | --- | --- | --- |
| `loshuarachesdezapata.live` | Customers (QR codes on the tables) | `/order/` | `/assets`, `/api/health`; **`/pos/` and `/analytics/` return 404** |
| `zapatapos.live` | Cashier, kitchen, back office | `/pos/` | `/analytics/`, `/order/` |

Set `MASAFLOW_CUSTOMER_DOMAIN`, `MASAFLOW_STAFF_DOMAIN` and a 12–256 character `MASAFLOW_STAFF_PASSWORD` in `.env` (template: `.env.tunnel.example`). The server then treats the site as public: the password replaces the four-digit PIN, `/api/network` and mDNS are off, and Socket.IO accepts only those two HTTPS origins. It also accepts same-origin pages on the restaurant network (`localhost`, a private LAN address or a `.local` name), so the kitchen can keep working with the internet down; see "Working without internet" below. Plain `http://` visits are redirected to `https://`. `www.` on either domain redirects to the bare domain once a `www` public hostname exists in the tunnel. The Socket.IO Admin UI stays refused for anything that arrives through a public domain or Cloudflare.

Forwarded addresses are trusted only from loopback, where `cloudflared` runs. Do not put another reverse proxy in front of the app in this mode, and do not combine it with the Caddy stack.

### One-time Cloudflare and DNS setup

A Squarespace CNAME to `<id>.cfargotunnel.com` is not enough: Cloudflare only proxies that name for records inside your Cloudflare account, and its CNAME-only ("partial") setup needs a Business plan. On the free plan, move each domain's DNS to Cloudflare:

1. In Cloudflare, **Add a domain** for each of the two domains on the Free plan.
2. In Squarespace Domains, turn **DNSSEC** off if it is on, then open **DNS → Domain Nameservers → Use custom nameservers** and enter the two nameservers Cloudflare shows for that domain. Propagation can take hours; Cloudflare emails when the domain is active.
3. In Cloudflare DNS for each domain, delete the imported Squarespace parking records: the four `@` A records and the `@` HTTPS record with Squarespace IP hints (and the `www` CNAME if you do not need it). Keep the SPF/DMARC TXT records. An existing `@` record blocks the next step.
4. In Zero Trust, **Networks → Tunnels → Create a tunnel** (Cloudflared), named `MasaFlow-Restaurant`. Install the connector on the Mac with the command the dashboard shows; it contains a secret token, so never commit or paste it. Let it run as a service so it starts at login.
5. Under the tunnel's **Public Hostnames**, add `loshuarachesdezapata.live` and `zapatapos.live`, both with service `HTTP` `localhost:3000`. Cloudflare creates the proxied DNS records itself. Leave **HTTP Host Header** (under the hostname's additional settings) empty: the server decides which app to show from the original Host, and overriding it to `localhost` would send both domains to the customer menu.
6. For each domain, open **SSL/TLS → Edge Certificates** and turn **Always Use HTTPS** on. Live sync is accepted only from the `https://` addresses, so a visitor on plain `http://` would otherwise see a menu that never updates. (The server also redirects `http` as a fallback.)

Optional hardening: put a Cloudflare Access policy (free for small teams) on `zapatapos.live` so only the owner's and staff's emails can load the POS pages at all. The staff password still protects every command.

### Verify

```sh
curl -sI https://loshuarachesdezapata.live/        # 302 → /order/
curl -sI https://zapatapos.live/                   # 302 → /pos/
curl -sI https://loshuarachesdezapata.live/pos/    # 404
curl -s  https://zapatapos.live/api/health         # {"status":"ready",...}
curl -sI http://loshuarachesdezapata.live/         # 301 or 308 → https://loshuarachesdezapata.live/
```

Then run the release checks below with each domain in place of `YOUR_DOMAIN`.

### Working without internet

The tunnel is the only thing that needs the internet. If it drops, the Mac keeps the ledger and the restaurant network keeps working, with these limits:

- Tablets must open the Mac's own address instead of `zapatapos.live`: `http://<Mac local hostname>.local:3000/pos/` (System Settings → General → Sharing → Local hostname) or `http://<Mac LAN IP>:3000/pos/`. Reserve that IP for the Mac in the router and bookmark whichever address you choose, because Android devices are unreliable with `.local` names.
- That is a different site from `https://zapatapos.live`, so each tablet signs in again with the staff password.
- Plain `http` on the LAN is not a secure context: installed-app mode, offline caching and browser notifications are unavailable there (the Mac itself is fine at `http://localhost:3000`, which browsers treat as secure).
- Customers cannot order from the public domain while the tunnel is down.

Rehearse it once: with a tablet on the restaurant Wi-Fi, cut the router's internet connection (unplug its WAN cable; leave the Wi-Fi on), open the bookmarked LAN address, sign in, and confirm an order placed from a phone on that same Wi-Fi appears on the board.

## Release checks on the actual host

1. Confirm `https://YOUR_DOMAIN/api/health` returns `status: ready` and the browser shows a valid HTTPS connection.
2. On cellular data, load `/order/`, choose a dish and toppings, submit a test order, and confirm its status survives a refresh.
3. On another device, load `/pos/`, sign in with the staff password, accept the test order, mark it ready, and collect the test payment. Check the matching sale in `/analytics/`.
4. Check desktop and phone layouts, receipt amounts, notification permission behavior, and the bank transfer text. Verify that another customer's browser cannot see the test customer's details.
5. Back up the volume to private storage and test restoring a copy on a separate disposable instance before accepting real orders.

Browser notifications require permission and an open page. Background push and SMS are not configured. Transfer completion is recorded by staff after checking the bank; the site does not verify or initiate a bank payment.

## Current release boundary

Bank details can be set with `VITE_BANK_NAME`, `VITE_BANK_CLABE`, `VITE_BANK_BENEFICIARY`, and `VITE_BANK_CONCEPT_PREFIX` in the root `.env`. These are public display values. The CLABE must contain exactly 18 digits; verify the account and beneficiary with the owner before launch. Both Compose configurations pass these values as Docker build arguments. Rebuild the application after changing them; a container restart alone does not replace compiled bank details.

The domain and always-on host are pending. Local automated and browser checks cannot prove DNS, certificate issuance, container startup, external connectivity, or backups on the eventual host. Complete the host checks above when those resources are available.
When customizing a bank identity, set `VITE_BANK_NAME`, `VITE_BANK_CLABE` and `VITE_BANK_BENEFICIARY` together. The build rejects partial settings and a CLABE that is not exactly 18 digits, preventing customized labels from being combined with a default account number. This validates configuration completeness, not account ownership or whether a transfer reached the bank.
