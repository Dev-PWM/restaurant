# MasaFlow · upfront cash POS

MasaFlow connects a customer ordering website with the business POS: customers submit their name and dishes, pay upfront at the counter in Mexican pesos, and follow live kitchen updates. Staff controls fulfillment and sees verified paid-sales insights by day, month and year.

MasaFlow runs locally with customer ordering, upfront cash collection, kitchen fulfillment, pickup tracking, menu management, drawer audits, and live Operations / Sales analytics. The screens follow the MasaFlow UXPilot designs; [docs/DESIGN_HANDOFF.md](DESIGN_HANDOFF.md) is the design spec (tokens, components, states, breakpoints, and every intentional difference from the mockups).

## Run locally

Use Node 22.12 or later (the analytics build uses Vite 8).

```sh
npm run setup
npm run legacy:build
PORT=4173 MASAFLOW_HOST=127.0.0.1 npm run legacy:start
```

Open the [customer website](http://127.0.0.1:4173/) or [business POS](http://127.0.0.1:4173/pos). The service binds to `127.0.0.1`; `PORT` and `MASAFLOW_HOST` override its address. Serve the app through Node rather than opening HTML files from disk.

| Screen | Local URL |
| --- | --- |
| Order Queue: collect cash, run the kitchen | [Orders](http://127.0.0.1:4173/businessDashbord.html) |
| Responsive Business Analytics overview (no build needed) | [Metrics](http://127.0.0.1:4173/metricsDashbord.html) |
| Operations / Sales analytics with source inspection and AI summaries | [Analytics](http://127.0.0.1:4173/analytics/) (after `npm run legacy:build`) |
| Menu prices, 86 switches, history with undo | [Menu management](http://127.0.0.1:4173/MenuManagment.html) |
| Float, cash drops, shift audit, transaction ledger | [History & Ledger](http://127.0.0.1:4173/history.html) |
| Customer menu, customizer and checkout | [Menu](http://127.0.0.1:4173/MenuUI.html) |
| Customer tracking | `/readypickupUI.html?order=ORDER_UUID`, linked after submission |
| Pickup board for a counter screen | [Pickup](http://127.0.0.1:4173/readypickupUI.html) |

On this Mac, double-click [Start MasaFlow.command](../launchers/Start%20MasaFlow.command), or run `node scripts/mac-start.cjs`. The launcher reads the local `.env`, verifies the server's data-directory identity, and opens the cashier screen. Optional login startup is available through `npm run legacy:startup:enable`, `npm run legacy:startup:status`, and `npm run legacy:startup:disable`; see [Mac startup](MAC_STARTUP.md) for Finder shortcuts, configuration, logs, and safe shutdown.

Staff screens use a sidebar on tablets and desktops and a top bar with a tab bar on phones. `metricsDashbord.html` keeps its `?period=&date=` filters in the URL and links to the analytics app. Analytics URLs restore `tab=operations|owner`, `period=day|week|month|year`, `date=YYYY-MM-DD`, and `lang=es|en`. Spanish is initially selected; the language picker on every screen switches to English, and the choice persists across screens.

## Connect the customer website and business

Customer pages use a dedicated public API and live stream. Each private order link shows only that ticket. The public pickup board displays order numbers and kitchen stages. Staff APIs and reports require a signed-in session when `MASAFLOW_STAFF_PASSWORD` is configured. The shared English/Spanish sign-in page is `/staff-login.html`; sessions expire after twelve hours and can be signed out from the staff session link.

Historical deployment note: the current Docker/Caddy package now runs v0.3. For this legacy runtime, consult the pre-migration revision of the Docker/Caddy package on an always-on host with persistent storage, a domain, HTTPS and a staff password. See [public website setup](PUBLIC_WEBSITE.md) for exact configuration, customer/business links, deployment, backups, and counter hardware considerations. Public hosting and a domain have not been provisioned. Localhost remains available for development.

## Complete a cash shift

1. Open Cash Ledger and record the starting float and cashier name.
2. In Customer Menu, pick a masa, remove included toppings or ask for them on the side, add up to two extras, and submit with a name (the phone number is optional). The ticket awaits cash and stays outside the kitchen queue, and the customer lands on tracking, which says to pay at the counter. A saved submission UUID lets a lost response be retried without creating another order.
3. On Orders, the ticket appears under Awaiting Cash with a new-order toast. Choose Collect Cash (or Cancel order for one nobody paid for). Enter tender or select $20, $50, $100, $200, $500, or Exact. Presets set the entire tendered amount. Check the displayed total and change, then finalize. Short tender is blocked.
4. The service saves one verified cash payment and dispatches the ticket. Repeated finalization returns the original payment and does not request another drawer pulse.
5. Move the ticket through Start Preparing → Mark as Ready → Complete Pickup. Customer tracking shows each committed step with its time, and a full-screen "¡Está listo!" when the order is ready.
6. Record a cash drop, count the drawer, and close the shift. Expected cash, actual cash and signed variance are frozen in the closed audit.

New records use MXN integer centavos and `America/Mexico_City`. Editable demo prices: Huarache $85, Sope $35, Pambazo $50, Gordita $30, Quesadilla $45; cheese $10 and avocado $15. Tax is visibly **unconfigured at zero**. Availability is an 86 flag rather than ingredient quantity tracking.

Version-one data migrates with its original currency and exact amounts. USD and MXN totals are never added or converted. Close a legacy USD shift before opening MXN. Explicitly reprice legacy dishes and priced modifiers in menu management before creating new MXN orders; existing receipts and closed audits remain unchanged.

## Drawer hardware

Without a printer, the service records and displays a **simulated pulse**. For a TCP ESC/POS printer:

```sh
MASAFLOW_PRINTER_HOST=192.168.1.50 MASAFLOW_PRINTER_PORT=9100 PORT=4173 MASAFLOW_HOST=127.0.0.1 npm run legacy:start
```

The command is `1B 70 00 19 FA`, following [Epson's ESC p reference](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_lp.html). A durable reservation keyed to the payment prevents duplicate delivery. A restart during delivery records an unknown result; inspect the drawer before an intentional manual pulse. Hardware failure retains the payment. Sending bytes cannot confirm physical opening. Manual pulses require an open shift and are audited. Receipt reprints use the browser print dialog.

## Live analytics and summaries

Analytics, ledger calculations and summary inputs share one receipt validator. Sales use verified payment time. Operations includes the entire paid queue and today's completed-ticket pickup median, with its sample count. The source inspector exposes exact evidence, formulas, observation time and exclusions. Charts use zero baselines and exact tables; empty averages and medians display “—”. Disconnected screens retain confirmed data with a stale notice; initial failures recover from SSE or retry.

`GET /api/analytics?tab=owner&period=day&date=2026-09-30&lang=es` returns normalized scope, revision, observation time, currency/timezone, definitions, quality counts and evidence datasets. `owner` is the Sales tab; `operations` is Operations. Legacy `view=sales` and `view=owner` links remain accepted. Receipt, invalid-completion and invalid-audit quality counts cover the committed store, rather than only the selected sales period. Inconsistent receipts are excluded from current totals. Closed audit values stay frozen; malformed audits are disclosed and omitted from the latest-valid-audit card.

AI summaries generate only on request. Set the **server environment** variable `AI_GATEWAY_API_KEY` and optionally `AI_GATEWAY_MODEL` (default `openai/gpt-6-luna`, verified in the [model catalog](https://ai-gateway.vercel.sh/v1/models)). Local calls use the [Gateway Chat Completions API](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions); no Vercel deployment is required. Without a key, the interface shows unavailable.

For a local `.env` copied from `.env.example`, launch with `node --env-file=.env legacy-server.cjs`. Normal `PORT=4173 MASAFLOW_HOST=127.0.0.1 npm run legacy:start` reads exported environment variables. Credentials are ignored by Git and never sent to the browser. Do not use a `VITE_` credential variable.

Only aggregates and definitions are sent to Gateway; customer names, cashier identifiers and raw ledger rows are excluded. The model selects validated references; localized factual clauses and numbers come from server calculations. Forecasts, causal claims and cash actions are excluded. Identical scope/revision/language calls deduplicate and cache for five minutes. New calls are limited to ten per rolling hour per running service, with a twenty-second timeout. Data changing during generation rejects the result as stale.

## Persistence and development

Serialized transactions save `.masaflow/state.json` with file sync and atomic replacement; failed persistence retains the previous committed state. One writer holds the canonical data directory's lock until requests and saves finish. `MASAFLOW_DATA_DIR` selects an alternate store.

Automatic snapshots run at startup, after a changed revision at least an hour after the last automatic snapshot, and when a shift closes. Run `npm run legacy:backup` for a manual snapshot, `npm run legacy:backups` to list them, and `npm run legacy:backup:verify -- BACKUP_FILE` to verify one. `GET /api/health` reports the last successful backup and any backup error. Restore requires a stopped server, a verified source and `npm run legacy:restore -- BACKUP_FILE --confirm`; it first preserves the previous ledger and never replays uncertain drawer pulses. See [backup and restore instructions](BACKUPS.md). Keep a separate private copy on another disk to protect against losing the Mac.

This app serves one restaurant with a single serialized store. Staff access uses one shared business password; individual staff roles, restaurant isolation, refunds, voids, payouts, silent thermal printing and ingredient depletion are outside this revision.

HTML screens use shared `assets/`: the order store, translations, UI helpers, the compiled stylesheet and vendored icons/charts (`assets/vendor/`: FontAwesome Free 6.4 solid, Plotly 3.1 basic), so the counter keeps working offline apart from the two Google web fonts. The English/Spanish catalog is [assets/masaflow-catalog.json](../assets/masaflow-catalog.json). HTML pages load its `html` namespace through `masaflow-i18n.js`; React imports its `analytics` namespace at build time. The HTML script keeps an inline fallback for immediate rendering and failed asset requests. A language selected in the URL takes precedence over saved `masaflow.locale`; otherwise the saved preference applies, initially Spanish.

Styles are [Tailwind CSS v3](https://v3.tailwindcss.com) utility classes, the same ones the design mockups use, compiled ahead of time into `assets/masaflow.css`, which is committed. The source is `styles/masaflow.css` plus `tailwind.config.js`. After adding or changing classes, run `npm run build:css` (downloads the pinned Tailwind CLI on first use). Tailwind only emits classes written out in full, so `'text-' + color + '-600'` produces no CSS; use a lookup object of complete class strings. Add new UI labels to the relevant English and Spanish catalog namespace; keep the HTML inline fallback in sync for new HTML labels. Rebuild analytics after catalog changes. Customer names, notes and audit messages carry `data-i18n-skip` so they are never translated.

The React/Recharts module in `apps/analytics` preserves canonical source inspection and presentation controls. Rebuild after frontend changes. Keep protected-runtime changes narrowly authorized and verified using its [authoring guide](../apps/analytics/AGENTS.md).

The [data model](../DATA_MODEL.md), [reusable KPI context](data-context/context-masaflow-cash/SKILL.md) and TypeScript contracts in `shared/types` document the measure rules. Approved concept figures and temporary browser QA fixtures are demonstration data; they are never seeded into operational records.

## Verify

```sh
npm test
```

Tests use temporary directories and cover cash validation, removable toppings, optional phone numbers, cancelling unpaid orders, deleting dishes, undoable menu audit entries, kitchen step timestamps, idempotent submissions/payments, persistence rollback, restart recovery, pulse bytes to a test TCP receiver, currency migration, malformed receipts, timezone boundaries, immutable snapshots, frozen audits, summary privacy, caching, timeout and provider errors, one-writer locking, backup cadence and retention, restore rollback and safety copies, native Mac startup, public customer data isolation, staff sign-in and session expiry, plus static checks on the screens (links resolve, no CDN scripts, one shared staff shell, translation loaded, required hooks present, no mockup placeholders).

The browser acceptance suite is separate from `npm test`. Build analytics first and use installed Google Chrome with Playwright:

```sh
npm run legacy:build
npm install --no-save --package-lock=false playwright
node tests/browser-acceptance.cjs
```

If Playwright is supplied by an existing runtime, set `PLAYWRIGHT_MODULE` to that installation's absolute module path instead of installing another copy. The suite starts its own service against a temporary data directory, uses a mocked Gateway, and removes that temporary store when it finishes. It checks API/card/table reconciliation, source inspection, request races, reconnects, URL/language restoration, malformed summaries, keyboard/touch chart interaction and desktop / 390px / 430px analytics layouts. It also completes mobile customer ordering with a lost response, short/full cash tender, kitchen dispatch and pickup tracking, a cash drop and a signed shift audit, then verifies initial-failure recovery on all six HTML screens. Screenshots and a result report are written to Git-ignored `artifacts/qa/`; no QA receipts enter `.masaflow`. Live Gateway access and physical drawer opening require separate checks with the configured credentials and actual printer.
