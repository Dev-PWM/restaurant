---
name: context-masaflow-cash
description: "Use when analyzing MasaFlow cash POS records or preparing its Operations and Sales dashboards, ledger reconciliations and sales summaries."
---

# MasaFlow cash data context

Use for operational and sales analysis of the legacy HTML/SSE cash ledger. Its historical upfront-cash workflow is separate from the current realtime React order lifecycle, which records payment at pickup. This reusable context is saved with the project and is not installed into a personal or team plugin.

## Entities

| Entity | Meaning and boundary | ID / grain | Source |
| --- | --- | --- | --- |
| Order | One ticket. Fulfillment is draft, pending, preparing, ready, completed or cancelled; payment is separately unpaid/paid. Only unpaid drafts can be cancelled. Names, modifiers, prices, subtotal and tax are immutable snapshots. | UUID `id`; one normalized `submissionId` maps to one draft. | [Engine](../../../assets/masaflow-store.js) |
| Line item | One selected dish, quantity 1–99, exactly one masa option and at most two extras. Line total is quantity × unit price. Removed included toppings and serving the rest on the side do not change the price. | Row within `Order.items`, linked by `menuItemId`. | [Contract](../../../shared/types/order.ts) |
| Payment | One upfront cash receipt linked to a paid order and existing shift. Total equals subtotal plus tax; tender minus change equals total. | Unique payment UUID; order `paymentId` matches; one payment per order. | [Validator](../../../assets/masaflow-store.js) |
| Drawer shift | One session with starting float. Closing freezes expected balance, physical count, signed variance and closing time. One session may be open. | Shift UUID; payment/drop `shiftId`. | [Engine](../../../assets/masaflow-store.js) |
| Cash drop | Positive safe removal in an open shift, no greater than expected balance. | Drop UUID and shift currency. | [Engine](../../../assets/masaflow-store.js) |
| Menu item | Editable demo dish and modifiers. Availability is an 86 flag; ingredient quantity is not modeled. | Menu ID and local modifier IDs. | [Contract](../../../shared/types/menu.ts) |
| Historical hardware metadata | Inert compatibility fields from older backups; never displayed, replayed, or counted as current activity. | Legacy payment or hardware-job record. | [Backup handling](../../BACKUPS.md) |

## Metrics

| Metric | Definition and population | Numerator | Denominator | Unit / window | Caveat |
| --- | --- | --- | --- | --- | --- |
| Cash receipts | Verified cash totals including tax, selected by payment time and current MXN currency. Includes food still in kitchen. | Sum payment total | — | MXN centavos; selected Mexico City day/week/month/year | Excludes drafts, float, drops and inconsistent records. Legacy USD totals remain separate. |
| Sales excluding tax | Immutable subtotals for the same receipts. | Sum order subtotal | — | Centavos; same period | No refund or void events are modeled. |
| Tax collected | Saved tax for the same receipts. | Sum order tax | — | Centavos; same period | Initial zero rate is visibly unconfigured. |
| Paid tickets | Unique verified payments linked to paid tickets. | Count receipt pairs | — | Count; same period | Payment retries do not increment count. |
| Average ticket | Cash receipts divided by paid ticket count. | Cash receipts | Paid tickets | Centavos per ticket; same period | Empty population is null / “—”; display rounding never changes records. |
| Top dishes | Purchased quantities in the same receipt population, grouped by saved menu ID plus snapshot name and ranked descending. | Sum line quantity | — | Units; same period | Renamed dishes can have separate snapshot rows. Line amounts exclude tax. |
| Active kitchen tickets | All verified paid pending/preparing/ready tickets, all dates and original currencies. | Count active pairs | — | Count; current observation | Sales filters do not restrict the queue. Financial rows label currency. |
| Oldest ticket | Maximum elapsed time since payment among active tickets. | observedAt − paidAt | — | Minutes; current observation | Empty is null / “—”; actual refresh advances observation time. |
| Paid-to-pickup | Median completedAt − paidAt for verified tickets completed today in Mexico City. | Median valid durations | — | Minutes; completion date today | Includes pre-preparation waits and overnight receipts; sample count shown. Invalid/negative durations excluded and counted. Empty is null / “—”. |
| Expected drawer | Starting float plus verified tender minus change and unique valid drops in that shift currency. | float + tender − change − drops | — | Shift currency minor units; open shift | Equivalent to float + receipts − drops. Sent pulse bytes do not prove physical opening. |
| Drawer variance | Physical count minus frozen expected balance at close. | actual − expected at close | — | Original shift currency minor units | Positive over, negative short, zero balanced. Later exclusions never recompute a closed audit. |

## Filters

| Filter | Rule / scope | Exception / source |
| --- | --- | --- |
| Verified receipt | Unique order/payment/shift IDs; one linked cash payment; paid fulfillment; matching currencies; safe nonnegative integer amounts; line/subtotal/tax/total reconciliation; tender minus change equals total; valid matching payment timestamps. | Rejected payments and paid orders without a payment are counted. Same [validator](../../../assets/masaflow-store.js) serves analytics, ledger and summary inputs. |
| Sales date | paidAt in inclusive period start / exclusive end, America/Mexico_City. | Default date is server business date. [Normalization](../../../shared/analytics.js) |
| Calendar period | Monday-start week, calendar month/year. | Impossible dates and unknown periods normalize to business today / day. |
| Currency | Owner headline is MXN; USD is separately reported without conversion. | Close legacy USD shift before MXN and explicitly reprice legacy menu values. |
| Operations | Queue spans all dates; pickup median uses today's completion cohort. | Independent of Sales payment-date scope. |
| Closed audit | Unique shift ID, MXN/USD currency, valid closing timestamp, safe nonnegative frozen expected/actual values and signed variance equal to actual minus expected. | Latest audit uses the most recent valid close; rejected closes are counted without changing saved records. [Analytics](../../../shared/analytics.js) |

## Dimensions

| Dimension | Meaning | Applies to |
| --- | --- | --- |
| Payment bucket | Local hour for day, date for week/month, month for year, including zero buckets. | Receipt trend and exact table. |
| Dish snapshot | Saved menu ID and name. | Quantity ranking. |
| Fulfillment | Received/pending, preparing, ready, completed; draft separately awaiting cash; cancelled applies only before payment. | Queue and receipt rows. |
| Currency | MXN for new records, preserved USD for legacy. | Order, lines, modifiers, payments, shifts and drops. |
| Locale | Initially Spanish, optionally English; saved masaflow.locale and URL language. | Labels, definitions, formatting, summaries. Human names/notes/raw audit messages stay unchanged. |

## Pitfalls

| Pitfall | Interpretation / action | Source |
| --- | --- | --- |
| Disconnect | Retain confirmed rows with a stale notice; initial placeholders are not confirmed. SSE revisions refresh; older requests cannot overwrite newer scope/revision. | [Live adapter](../../../apps/analytics/src/content/shared/analytics-live.tsx) |
| Different cohorts | A ticket paid yesterday and completed today affects yesterday's receipts and today's pickup median. State cohort and sample count. | [Analytics](../../../shared/analytics.js) |
| Quality counts | `excludedReceipts` counts unverified payment rows plus paid orders with no payment. `invalidCompletionTimes` counts verified completed tickets with invalid or negative durations. `invalidAudits` counts inconsistent closed shifts. All three cover the committed store, independently of the sales period. Never subtract these counts from an already validated total. | [Validator](../../../assets/masaflow-store.js), [analytics](../../../shared/analytics.js) |
| Historical currency / audits | Label USD amounts; preserve exact numbers and frozen audits. Do not infer an exchange rate. | [Engine](../../../assets/masaflow-store.js) |
| AI summary | On request only; aggregates/definitions without names, cashier IDs or raw ledger. Validated references and server-rendered clauses/numbers; no forecasts, causes or cash actions. | [Summary](../../../shared/sales-summary.js) |
| Demo figures | Concepts and temporary browser fixtures are fictional and never operational records. | Approved user plan; [guide](../../../README.md) |

## Customer and staff access

The legacy public customer API serves menu data and a single ticket selected by its private order or submission UUID. Public pickup-board rows contain numbers and kitchen stages only. These redacted customer payloads are not financial-analysis datasets. Staff sign-in grants access to the full verified analytics, ledger and summary endpoints. Legacy online orders remain unpaid until cash is recorded; the current realtime app instead permits review and cooking before payment at pickup. Daily, monthly and yearly legacy popularity counts purchased quantities from verified receipts.

## Open Questions

No unresolved KPI definition questions remain from the approved plan. Tax policy remains explicitly unconfigured at zero; this context supplies no external tax or accounting policy.

## Sources

| Source | Authority / use | Checked / limits |
| --- | --- | --- |
| Legacy cash-ledger model | Governs the legacy cash, currency, date and KPI definitions documented here. | Not the payment lifecycle for the current realtime React app. |
| `.masaflow/state.json` | Local committed operational store. | Created at service startup, Git-ignored; not bundled with context. |
| [Engine](../../../assets/masaflow-store.js) | Pricing, snapshots, validator, migration, balances. | Workflow, malformed-record and restart tests. |
| [Analytics](../../../shared/analytics.js) | Scope, receipts, active queue, completion cohort, evidence DTO. | Mexico City boundaries, empty cohorts, currency separation and frozen audits tested. |
| [Summary service](../../../shared/sales-summary.js) | Server-only inputs, references, cache, concurrency and timeout. | Mocked provider tests; live generation requires key. |
| [Shared translation catalog](../../../assets/masaflow-catalog.json) | English/Spanish labels shared by HTML and React analytics; URL language precedes the saved preference. | `html` and `analytics` namespaces; human names, notes and raw audit messages are not translated. |
| [Gateway documentation](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions), [model catalog](https://ai-gateway.vercel.sh/v1/models) | API and configurable default openai/gpt-6-luna. | Verified 2026-09-30 for structured-output support; no deployment required. |
