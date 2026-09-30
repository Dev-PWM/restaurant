# MasaFlow · upfront cash POS

MasaFlow runs locally with customer ordering, upfront cash collection, kitchen fulfillment, pickup tracking, menu management, drawer audits, and live Operations / Sales analytics.

## Run locally

Use Node 22.12 or later (the analytics build uses Vite 8).

```sh
npm run setup
npm run build
npm start
```

Open [MasaFlow](http://127.0.0.1:4173/businessDashbord.html). The service binds to `127.0.0.1`; `PORT` and `MASAFLOW_HOST` override its address. Serve the app through Node rather than opening HTML files from disk.

| Screen | Local URL |
| --- | --- |
| Kitchen and cash collection | [Orders](http://127.0.0.1:4173/businessDashbord.html) |
| Customer ordering | [Menu](http://127.0.0.1:4173/MenuUI.html) |
| Menu prices / availability | [Menu management](http://127.0.0.1:4173/MenuManagment.html) |
| Float, cash drops and shift audit | [Cash ledger](http://127.0.0.1:4173/history.html) |
| Operations and Sales | [Analytics](http://127.0.0.1:4173/analytics/) |
| Customer tracking | `/readypickupUI.html?order=ORDER_UUID`, linked after submission |

The previous `metricsDashbord.html` link redirects to analytics and preserves period/date/language filters. Analytics URLs restore `tab=operations|owner`, `period=day|week|month|year`, `date=YYYY-MM-DD`, and `lang=es|en`. Spanish is initially selected; language preferences persist across screens.

## Complete a cash shift

1. Open Cash Ledger and record the starting float and cashier name.
2. In Customer Menu, customize a dish, add it to the cart, and submit. The ticket awaits cash and stays outside the kitchen queue. A saved submission UUID lets a lost response be retried without creating another order.
3. On Orders, choose Collect Cash. Enter tender or select $20, $50, $100, $200, $500, or Exact. Presets set the entire tendered amount. Check the displayed total and change, then finalize. Short tender is blocked.
4. The service saves one verified cash payment and dispatches the ticket. Repeated finalization returns the original payment and does not request another drawer pulse.
5. Move the ticket through Received → Preparing → Ready → Completed. Customer tracking receives each committed state.
6. Record a cash drop, count the drawer, and close the shift. Expected cash, actual cash and signed variance are frozen in the closed audit.

New records use MXN integer centavos and `America/Mexico_City`. Editable demo prices: Huarache $85, Sope $35, Pambazo $50, Gordita $30, Quesadilla $45; cheese $10 and avocado $15. Tax is visibly **unconfigured at zero**. Availability is an 86 flag rather than ingredient quantity tracking.

Version-one data migrates with its original currency and exact amounts. USD and MXN totals are never added or converted. Close a legacy USD shift before opening MXN. Explicitly reprice legacy dishes and priced modifiers in menu management before creating new MXN orders; existing receipts and closed audits remain unchanged.

## Drawer hardware

Without a printer, the service records and displays a **simulated pulse**. For a TCP ESC/POS printer:

```sh
MASAFLOW_PRINTER_HOST=192.168.1.50 MASAFLOW_PRINTER_PORT=9100 npm start
```

The command is `1B 70 00 19 FA`, following [Epson's ESC p reference](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_lp.html). A durable reservation keyed to the payment prevents duplicate delivery. A restart during delivery records an unknown result; inspect the drawer before an intentional manual pulse. Hardware failure retains the payment. Sending bytes cannot confirm physical opening. Manual pulses require an open shift and are audited. Receipt reprints use the browser print dialog.

## Live analytics and summaries

Analytics, ledger calculations and summary inputs share one receipt validator. Sales use verified payment time. Operations includes the entire paid queue and today's completed-ticket pickup median. The source inspector exposes exact evidence, formulas, observation time and exclusions. Charts use zero baselines and exact tables. Disconnected screens retain confirmed data with a stale notice; initial failures recover from SSE or retry.

AI summaries generate only on request. Set the **server environment** variable `AI_GATEWAY_API_KEY` and optionally `AI_GATEWAY_MODEL` (default `openai/gpt-6-luna`, verified in the [model catalog](https://ai-gateway.vercel.sh/v1/models)). Local calls use the [Gateway Chat Completions API](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions); no Vercel deployment is required. Without a key, the interface shows unavailable.

For a local `.env` copied from `.env.example`, launch with `node --env-file=.env server.js`. Normal `npm start` reads exported environment variables. Credentials are ignored by Git and never sent to the browser. Do not use a `VITE_` credential variable.

Only aggregates and definitions are sent to Gateway; customer names, cashier identifiers and raw ledger rows are excluded. The model selects validated references; localized factual clauses and numbers come from server calculations. Forecasts, causal claims and cash actions are excluded. Identical scope/revision/language calls deduplicate and cache for five minutes. New calls are limited to ten per rolling hour per running service, with a twenty-second timeout. Data changing during generation rejects the result as stale.

## Persistence and development

Serialized transactions save `.masaflow/state.json` with file sync and atomic replacement; failed persistence retains the previous committed state. Back up this directory while the service is stopped. This app is intended for a trusted local counter; authentication, restaurant isolation, refunds, voids, payouts, silent thermal printing and ingredient depletion are outside this revision.

HTML screens use shared `assets/`. The React/Recharts module in `apps/analytics` preserves canonical source inspection and presentation controls. Rebuild after frontend changes. Keep protected-runtime changes narrowly authorized and verified using its [authoring guide](apps/analytics/AGENTS.md).

The [data model](DATA_MODEL.md), [reusable KPI context](docs/data-context/context-masaflow-cash/SKILL.md) and TypeScript contracts in `shared/types` document the measure rules. Approved concept figures and temporary browser QA fixtures are demonstration data; they are never seeded into operational records.

## Verify

```sh
npm test
```

Tests use temporary directories and cover cash validation, idempotent submissions/payments, persistence rollback, restart recovery, pulse bytes to a test TCP receiver, currency migration, malformed receipts, timezone boundaries, immutable snapshots, frozen audits, summary privacy, caching, timeout and provider errors. Browser verification covers customer-to-audit fulfillment, reconnects, URL/language restoration, source inspection, chart interaction and desktop / 390px / 430px layouts.
