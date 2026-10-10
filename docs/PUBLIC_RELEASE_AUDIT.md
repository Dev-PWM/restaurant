# Public release audit — 9 October 2026

## Decision

The code is a tested release candidate for one restaurant instance. It is **not live**. The domain and always-on host are pending, and the public Docker/TLS stack has not been run on the eventual host. Follow [PUBLIC_WEBSITE.md](PUBLIC_WEBSITE.md) there before accepting real customer orders.

## Evidence collected locally

| Check | Result | Scope and limit |
| --- | --- | --- |
| Automated regression | 213/213 passed (`npm test`) | Includes ledger, payment, customer isolation, staff authorization, QR decoding, mDNS, and public-origin polling. |
| TypeScript and production bundles | Passed (`npm run build`) | Built the customer, POS, and analytics React apps. Vite emitted non-failing dependency directive warnings. |
| Dependency audit | 0 production advisories (`npm run scan`) | The full npm audit has six existing development-only advisories in build/load-test dependencies. |
| Regex probe | 0 gating failures, 349 patterns scanned | Eleven quadratic, eight dynamic, and two suspect patterns were advisory in the protected legacy analytics source; the current customer/server path had no gating result. |
| Semgrep | 35 pattern matches inspected | Twenty-six were in the protected analytics runtime/tooling that the current realtime bundle does not import. The nine current-app/tooling matches were rule overmatches: `RegExp.exec` mistaken for shell execution, `BASE_URL` mistaken for a staff PIN, explicit PIN validation mistaken for a default, or the scanner's own dynamic pattern. No confirmed current-release issue came from those matches. |
| Gitleaks | One worktree and eight Git-history matches reviewed | The worktree match is a source-file digest in `apps/analytics/protected-runtime.json`, not a credential. History matches repeat that digest and the previously hardcoded development PIN, now removed. No live secret was identified by this scan. |
| CodeRabbit | First review: two findings; second review: zero | Fixed missing-origin same-site Socket.IO polling and a synchronous macOS host-name lookup on every network-info request. Earlier review findings about QR encoding, QR target validation, mDNS lifecycle, and `.npmrc` were also addressed. |
| Browser workflow | Passed locally | Phone-sized customer checkout chose preparation, five explicit toppings, and bank transfer. Staff accepted, marked ready, confirmed transfer, and the $100.00 sale appeared in analytics with $0.00 cash. Desktop/mobile entry screens had no page errors; final phone POS tabs fit the viewport. |
| Public configuration | Source and YAML checked | The public Compose file exposes only Caddy and supplies a persistent app volume. The Dockerfile now includes the PWA assets referenced by its routes. Local HTTP checks returned 200 for the icon, root and scoped manifests, and service workers. Docker itself was unavailable locally, so container build, HTTPS certificate issuance, and external reachability remain untested. |

The Codex Security Deep Scan plugin failed **before starting** with: `Deep Scan cannot safely start a read-only worker: the parent must provide a managed filesystem permission profile.` Its exhaustive multi-worker coverage is therefore unavailable. The manual/CLI checks above do not substitute for that scan.

## Changes made for release

- Require an explicit local PIN; public mode requires a 12–256 character staff password and an exact HTTPS origin.
- Accept the initial same-origin polling GET that browsers send without an `Origin` header, while rejecting foreign origins and cross-site polling.
- Keep local discovery and QR endpoints out of public mode; bound and validate local QR destinations, correct QR format/mask encoding, and close mDNS cleanly.
- Use Caddy as the sole public port, include persistent volumes, and keep the app port private.
- Keep the staff login neutral until the server reveals PIN versus password mode; make all POS tabs visible on a phone without page overflow.
- Include the live app's required PWA assets in the runtime image and use the restaurant name in the install manifest.

## Checks required on the host

1. Provision the domain and always-on host, set the private password, and run `docker compose -f compose.public.yaml up -d --build`.
2. Verify HTTPS, health, static icons/manifest/service worker, WebSocket or polling continuity, customer ordering, staff login, payment, and sales from separate real devices and networks.
3. Make an off-host ledger backup and prove restoration on a disposable instance. Monitor logs during the first live shift.
4. Re-run the Codex Security Deep Scan only from an environment with the managed filesystem permission profile it requires.

These checks are release gates, not evidence of a defect in the current code. No claim that every file is bug-free or that the public site is already published is made here.
