# MasaFlow design handoff

The spec for building and changing MasaFlow screens so they match the UXPilot designs. It describes what is
implemented in `apps/html/`. Where the app differs from the mockup export, section 9 says so and explains why.

## 1. Overview

MasaFlow is a cash-only ordering system for a small Mexican kitchen. Prices are in MXN, times follow America/Mexico_City, and the interface opens in Spanish with an English switch on every screen. It has two audiences:

- **Staff**, on a counter tablet or a desktop: the order queue, analytics, menu management, and the cash ledger.
- **Customers**, on their own phone: the menu, checkout, and live order tracking.

| Mockup (UXPilot export) | App page | Audience | Notes |
| --- | --- | --- | --- |
| 1 Dashboard | `businessDashbord.html` | Staff | Order Queue: collect cash, run the kitchen |
| 2 Analytics + 3 Metrics Overview | `metricsDashbord.html` | Staff | One responsive page: mockup 2 at `md` and up, mockup 3 below. Links to the React analytics app at `/analytics/` (source inspection, AI summaries), which is built separately |
| 4 MenuManagement | `MenuManagment.html` | Staff | Includes the add/edit drawer and the history drawer |
| 5 History | `history.html` | Staff | Ledger, cash drawer shift, audits |
| 6 Tracking | `readypickupUI.html` | Customer | `?order=<id>` tracks one order; without a parameter it is the pickup board |
| 7 Menu | `MenuUI.html` | Customer | Menu, customizer sheet, checkout sheet |

File names keep their original spellings (`Dashbord`, `Managment`) because links and bookmarks already use them.

### The order lifecycle (the part the mockups do not show)

The mockups imply pay-at-pickup: a ticket shows "Total Due (Cash)" and a single "Mark as Ready" button. The app
collects cash **before** the kitchen starts:

```
draft (unpaid, waiting at the counter) ──Collect Cash──▶ pending ──▶ preparing ──▶ ready ──▶ completed
   └──Cancel order──▶ cancelled
```

A draft never appears in the kitchen queue. Only verified cash payments count as sales. Every screen reflects this
split. On the Order Queue, **Awaiting Cash** cards use the mockup's "Total Due (Cash)" wording, and kitchen cards say
"Paid (Cash)". Tracking starts at "Pay at the Counter". The three kitchen steps are Start Preparing → Mark as Ready →
Complete Pickup.

## 2. Design tokens

Tailwind v3 names, with resolved values. Custom tokens live in `tailwind.config.js` and in `:root` in
`styles/masaflow.css`.

### Color

| Token | Value | Usage |
| --- | --- | --- |
| `orange-600` / `brand-orange` | #EA580C | Primary action, prices, active period, totals due, focus ring |
| `orange-500` | #F97316 | Logo tile, highlighted ticket border and chip, active nav icon, timeline dots |
| `orange-50` / `orange-100` / `orange-400` | #FFF7ED / #FFEDD5 / #FB923C | Tinted tiles ("Active", "Expected in drawer"), chips, tile labels |
| `stone-900` / `brand-obsidian` | #1C1917 | Sidebar, dark buttons, quantity squares, selected chips, toasts |
| `stone-800` / `stone-700` | #292524 / #44403C | Headings / item names |
| `stone-500` | #78716C | Secondary text that carries information (4.8:1 on white) |
| `stone-400` | #A8A29E | Uppercase micro-labels and mockup captions only (decorative contrast) |
| `stone-300` / `stone-200` / `stone-100` | #D6D3D1 / #E7E5E4 / #F5F5F4 | Idle placeholders, borders, chip backgrounds |
| `stone-50` / `brand-stone` | #FAFAF9 / #F9F8F6 | Page background, item rows, inputs |
| `green-*` / `emerald-*` | 50 #ECFDF5 → 600 #059669 | Connected, done, completed, in stock, change returned |
| `red-*` / `rose-*` | 50 #FEF2F2 → 600 #DC2626 | Out of stock, short tender, critical, errors, offline |
| `blue-50` / `blue-700` | #EFF6FF / #1D4ED8 | "Preparing" status |
| Chart ramp | #EA580C, #F97316, #FB923C, #FDBA74, #FED7AA | Top Selling Items bars, best seller first |

### Typography

| Role | Classes | Where |
| --- | --- | --- |
| Page title | Playfair Display 700: `text-2xl` (Order Queue), `text-3xl` (Analytics, Menu Management), `text-4xl` (History) | One `h1` per page |
| Card / section title | Playfair Display `text-xl font-bold text-stone-800` | "Live Statistics", chart titles, customer names on tickets |
| Sans heading | Outfit `text-lg font-bold` + `font-sans` | History card titles, all customer-menu headings (the menu mockup renders sans) |
| Micro label | Outfit `text-[10px] font-bold uppercase tracking-widest text-stone-400` | "Placed At", tile labels, table headers (`text-[11px] tracking-[0.15em]` on the ledger) |
| Stat value | `text-2xl` / `text-3xl font-bold` | Tiles, stat cards, totals |
| Body | Outfit `text-sm font-medium` | Rows, descriptions |
| Caption | `text-xs` / `text-[10px]` | Sub-lines under values |
| Nav label | `text-[9px] font-bold uppercase tracking-widest` (sidebar), `text-[10px] … tracking-tighter` (tab bar) | Shell |

`h1, h2, h3` are Playfair Display by default (base layer). Add `font-sans` to a heading the mockup shows in sans.
Web fonts come from Google Fonts. Offline, they fall back to `system-ui` and Georgia.

### Spacing, radius, elevation

| Token | Value | Usage |
| --- | --- | --- |
| Page padding | `p-8` (md+), `p-4` (phone) | Main content |
| Card padding | `p-6` tickets, `p-8` stat and chart cards, `p-5` menu cards | |
| Grid gaps | `gap-6` cards, `gap-8` chart row, `gap-4` tiles | |
| `rounded-xl` 12px | Inputs, icon buttons, number chips (`rounded-lg`) | |
| `rounded-2xl` 16px | Item rows, buttons, menu cards (staff), toasts | |
| `rounded-3xl` 24px | Stat tiles, customer item cards | |
| `rounded-[32px]` | Tickets, ledger card, Kitchen Alert, dialogs, new-order toast | |
| `rounded-[40px]` | Chart cards, tracking card, bottom sheets (`rounded-t-[40px]`) | |
| Shadows | `shadow-sm` resting cards; `shadow-lg` dark buttons; `shadow-xl shadow-orange-100` highlighted ticket and orange CTA; `shadow-2xl` toasts and drawers | |
| Z layers | Named tokens in `tailwind.config.js`: `z-bar` (50) fixed top/tab/cart bars, `z-toast` (60) toasts, `z-notice` (70) offline notice, `z-overlay` (80) full-screen "ready" overlay. `z-10`/`z-20` only for stacking inside a card. Dialogs use the browser top layer. Never add `z-[…]` literals | |

### Breakpoints

Tailwind defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280. `md` is the switch between the phone shell and the
sidebar shell. `xl` shows the Order Queue's right-hand statistics column.

## 3. Components

Class lists are exact. Shared components are defined in `styles/masaflow.css` (`@layer components`) and built by
`assets/masaflow-ui.js`. Page components are written inline in each page.

| Component | Classes / source | Variants and states | Notes |
| --- | --- | --- | --- |
| Sidebar | `hidden md:flex w-20 bg-stone-900 flex-col items-center py-8 gap-10 border-r border-stone-800` | — | Identical on all four staff pages (a test enforces it) |
| Sidebar link | `.mf-nav-link` + `<i class="fa-solid … text-xl">` + `.mf-nav-label` | default `text-stone-500`, hover white, current (`aria-current="page"`) `text-orange-500` | Orders, Metrics, Menu, History; bottom: New, Pickup |
| Cashier chip | `w-10 h-10 rounded-full border-2 border-stone-700 …` `[data-mf-cashier]` | drawer open: cashier initials; closed: register icon | Links to `history.html#drawer`; filled by `masaflow-ui.js` |
| Phone top bar | `md:hidden fixed top-0 … bg-stone-900` | — | Logo, awaiting-cash bell, cashier chip |
| Phone tab bar | `md:hidden fixed bottom-0 … bg-white border-t` + `.mf-tab-link` (`min-w-[44px]`) | current `text-orange-600` | Orders, Metrics, Menu, History, New |
| Awaiting-cash bell | `[data-mf-bell]` with `[data-mf-bell-dot]` | dot hidden when no unpaid orders | Label says how many orders are waiting |
| Connection pill | `.mf-sync` `[data-mf-sync]` | connected: green with ping, "Live Sync Connected"; offline: red, "Reconnecting…" | Driven by the `masaflow:connection` event |
| Offline notice | `.mf-service-banner`, floating pill under the header | hidden when connected | Staff wording on staff pages, "Reconnecting… your order is saved." on customer pages |
| Ticket card | neutral: `bg-white rounded-[32px] border border-stone-100 p-6 flex flex-col shadow-sm`; highlighted: `border-2 border-orange-500 shadow-xl shadow-orange-100 order-card-pulse` | draft (Collect Cash + Cancel order), kitchen (next-step button + Print receipt), placeholder (dashed `bg-stone-100/50 border-dashed`) | Highlight comes from `MasaFlowUI.needsAttention(order, nowMs)` |
| Item row | `flex items-center justify-between p-3 bg-stone-50 rounded-2xl` + `w-6 h-6 rounded bg-stone-900` quantity | ready: green check | Second line: modifiers, "No Cilantro", "Toppings on the side"; notes in orange-600 |
| Status pill | `text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md` | New orange-50/600, Preparing blue-50/700, Ready green-50/700, Completed emerald | Ledger chips add a matching border |
| Stat tile | `p-4 rounded-3xl border` in a tint (`bg-orange-50 border-orange-100`, `bg-green-50 border-green-100`) | — | Label in the tint's 400, value `text-2xl font-bold` in the tint's 600 |
| Stat card | `bg-white p-6 md:p-8 rounded-[24px] md:rounded-[32px] border border-stone-100 shadow-sm` | trend chip up (green) / down (red) / hidden | Analytics |
| Filter chip | on `bg-stone-900 text-white rounded-full px-5 py-2 text-sm font-medium`; off `bg-stone-200/70 text-stone-700 hover:bg-stone-300` | `aria-pressed` | Order Queue, Menu Management |
| Segmented control | container `p-1 bg-stone-100 rounded-2xl`; on `bg-brand-obsidian text-white rounded-xl shadow-md` | `aria-pressed` | History status; the Analytics period switch uses orange-600 for "on" |
| Stock switch | track `w-10 h-5 rounded-full` emerald-500 / stone-300, knob `w-4 h-4 bg-white` right / left | `role="switch" aria-checked` | Label "In Stock" / "Out of Stock" beside it |
| Buttons | `.mf-btn-primary` (orange), `.mf-btn-dark` (stone-900 → orange on hover), `.mf-btn-ghost` | disabled `opacity-50`, active `scale-95`, loading label ("Saving…") | Full-width by default |
| Input | `.mf-field-label` + `.mf-input` (`bg-stone-50 border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-orange-500`) | invalid: message in a `role="alert"` paragraph | Always a real `<label>` |
| Staff menu card | `bg-white rounded-2xl border border-stone-200 p-5 shadow-sm hover:shadow-md` | out of stock: `opacity-50 grayscale` + "SOLD OUT FOR TODAY" overlay; recent price change: `price-pulse` | Photo tile falls back to orange-50 + utensils icon |
| Customer item card | `bg-white rounded-3xl p-4 shadow-sm border border-stone-100 flex gap-4` | sold out: grayscale photo, red "Sold out", disabled plus | Whole card opens the customizer |
| Data table | header `text-[11px] font-bold text-stone-400 uppercase tracking-[0.15em] bg-stone-50/50`; rows `table-row-hover` | empty-state body | Ledger, audits, recent orders |
| Pagination | `w-8 h-8 rounded-lg` buttons; current `bg-brand-obsidian text-white` `aria-current="page"` | prev/next disabled at the ends | 10 rows per page |
| Timeline | vertical rule `before:w-[2px]`, dots `w-4 h-4 rounded-full` | done `bg-orange-500 ring-4 ring-orange-100`, next `bg-orange-200`, future `bg-stone-100` | Tracking uses `<ol>` + `aria-current="step"` |
| Language picker | `.mf-language` (select injected by `masaflow-i18n.js` into the page's `[data-mf-language-host]`) | Español / English | Every page has exactly one host; the choice persists in `localStorage` |
| Toast | `.mf-toast`; `MasaFlowUI.toast(message, kind, title)` | plain, titled ("Menu Updated"), error (red icon), new order (`.mf-toast-order`, orange) | At most three are shown. When a modal is open, toasts render inside it |
| Slide-over drawer | `<dialog>` fixed right, full height, `max-w-md` / `max-w-lg`, `border-l shadow-2xl` | — | Menu add/edit, menu history |
| Bottom sheet | `<dialog>` + `bg-white max-w-md rounded-t-[40px] animate-slide-up` | — | Customizer (`h-[90vh]`), checkout |
| Confirm dialog | `MasaFlowUI.confirm({title, message, confirmLabel, danger})` → `Promise<boolean>` | danger: red icon and button | Backdrop click cancels |
| Cash tender dialog | `MasaFlowUI.tender(orderId)` | change tile green / "Still due" red; success view | A backdrop click does **not** close it, so a stray tap cannot abandon a half-counted payment |

## 4. Screens

Every screen re-renders from `MasaFlow.subscribe`, so changes on one device appear everywhere without a reload.
Hooks listed here are relied on by tests and other screens; keep them.

### Order Queue — `businessDashbord.html`

- **User:** cashier and cook at the counter.
- **Layout:** header (title, live counts, connection pill, bell) → **Awaiting Cash** (unpaid tickets) → **Paid
  Kitchen Queue** (filters, ticket grid 1/2/3/4 columns at base/md/lg/xl, dashed placeholder last). From `xl`, a
  right column shows Live Statistics (Active, Done today, then Awaiting cash / New / Preparing / Ready), Kitchen Alert
  (out-of-stock dishes and options, prep totals across active tickets, average wait once three orders are done), the
  expected drawer cash, and Print Daily Summary.
- **States:** no drawer shift (orange warning linking to the drawer); no unpaid orders (one muted line); empty queue
  (only the placeholder); a filter with no matches (placeholder text names the filter); service down (red notice,
  en-dash counts); saving (the button is disabled).
- **Hooks:** `#queue-error`, `#queue-subtitle`, `#awaiting-cash`, `#awaiting-orders`, `#shift-warning`, `#kitchen-orders`,
  `#draft-count`, `#pending-count`, `#preparing-count`, `#ready-count`, `#active-count`, `#done-count`,
  `data-tender|advance|receipt|cancel|filter`, `draft-<id>`, `kitchen-order-<id>`, `collect-cash-<id>`, `advance-<id>`.

### Business Analytics — `metricsDashbord.html`

- **Layout:** title and period switch (Daily/Weekly/Monthly/Yearly) plus a date picker. Four stat cards:
  - Total Revenue, with a trend against the previous period and net sales and tax underneath.
  - Total Orders, with a trend and the average ticket.
  - Peak Hour, with its share of sales.
  - Avg. Prep Time: payment to pickup, and how many orders were completed.

  Then a fulfillment strip, two Plotly charts (revenue trend as a spline area; top five dishes as horizontal bars,
  best seller on top), and Recent Paid Orders (a table from `md`, a list below).
- **States:** a period with no receipts (dashed note in each chart, trend chips hidden or "down 100%"); the previous
  period had no sales (no trend chip); service down.
- **URL:** `?period=day|week|month|year&date=YYYY-MM-DD`, kept in sync with the controls. Back/forward works.
- **Accessibility:** each chart has an `aria-label` summary. "View exact totals" opens a data table, and a
  screen-reader list mirrors the bars.
- **Hooks:** `cash-receipts`, `net-sales`, `transaction-count`, `average-ticket`, `revenue-chart`, `top-items`,
  `recent-paid-orders`, `metrics-date`, `period-*`, `#peak-hour`, `#avg-prep`.

### Menu Management — `MenuManagment.html`

- **Layout:** search, bell, history button (with a count of today's changes), Add New Item. Category chips, a
  one-line inventory summary, then a card grid (1/2/3 columns at base/md/xl).
- **Card controls:** price (opens the editor), stock switch, edit, delete (with confirmation).
- **Add/Edit drawer:** a live preview card; name, category (with suggestions), price, description, image URL,
  included toppings (comma separated), in stock (edit only), and modifier prices and availability.
- **History drawer:** filters for All / Price Changes / Stock 86'd / Added Items. Each entry offers the action that
  still makes sense: **Undo** a price change (only while the price is unchanged since), **Restore Stock**, or
  **Delete Item** (for an added dish that still exists).
- **States:** no matches; a dish without a photo; a failed image (falls back to the tile); out of stock; saving;
  validation errors in the drawer.
- **Hooks:** `menu-search`, `add-menu-item`, `menu-grid`, `menu-item`, `item-availability`, `edit-menu-item`,
  `delete-menu-item`, `open-menu-history`, `menu-audit`, `item-*`, `modifier-*`, `save-menu-item`.

### History & Ledger — `history.html`

- **Layout:** search and Open Cash Drawer. Status filter (All / In Kitchen / Completed), a from–to date range, a shift
  filter, and quick ranges (All Time / Today / Yesterday / Last 7 Days).
- **Transaction History:** table columns are Order, Date & Time with cashier, Customer and phone, Items as chips
  (three, then "+N more"), Amount with tendered and change, Status, and Reprint. Export CSV and Print Report above
  it; pagination below.
- **Below the table:** System Audit Log (last 20 entries, icon by type) beside the **Shift Cash Drawer**
  (`#drawer`). When closed, the drawer card shows the open-shift form. When open, it shows four tiles, tendered and
  change, the acting cashier, Record a cash drop, and Close & audit with a live over/short preview. Shift Drawer
  Audits and Cash Drops follow.
- **States:** no transactions; no matches (empty state with Clear All Filters); a closed drawer; a drop that exceeds
  the balance; short / over / balanced.
- **Hooks:** as in the baseline (`transaction-*`, `shift-*`, `opening-float`, `cashier-id`, `drop-*`, `drawer-count`,
  `count-preview`, `close-shift`, `audit-trail`, `cash-drops`, `shift-audit-table`, `manual-drawer-kick`) plus
  `export-csv`, `print-report`, `range-from`, `range-to`, `reset-filters`, `transaction-pager`.

### Order Tracking and Pickup Board — `readypickupUI.html`

- **`?order=<id>`:** only a UUID is accepted (an order number is not a tracking link and shows "not found"). A status badge and heading for each state, then the receipt, total (to pay or paid, with change)
  and a four-step timeline with real times: Placed, Cash Paid, In the Kitchen, Ready. The footer shows the pickup
  place and a link back to the menu.

  | State | Heading |
  | --- | --- |
  | Draft | Pay at the Counter |
  | Paid | Order Received |
  | Preparing | Preparing…, with an estimate once three orders have finished |
  | Ready | Order Ready! |
  | Completed | Enjoy! |
  | Cancelled | Order Cancelled |

  When the order becomes ready, a full-screen "It's Ready!" appears once. Dismissing it is remembered per order for
  the session.
- **No parameter:** the pickup board, with **Ready for Pickup** (large order numbers) and **In the Kitchen**.
- **States:** unknown order ("We can't find that order"); service unreachable.

### Menu, Customizer, Checkout — `MenuUI.html`

- **Layout:** sticky header (logo, Track order when there is a last order, Staff, search). Hero with the order
  context ("Counter pickup", "Dine in · Table 4"), category tiles (All first), and item cards (two columns from `md`).
- **Floating cart bar:** item count and total.
- **Customizer sheet:** photo header; Choose Your Masa (required, no default); Included Veggies & Sides (uncheck to
  remove, with an "On the side" switch); Extra Add-Ons (up to two); Special Instructions; a quantity stepper; and
  "Add to Order - $X".
- **Checkout sheet:** cart lines with steppers and Remove; name (required); phone (optional); Order For; table number
  for dine-in; totals (tax row only when tax is set); the pay-in-cash note; Place Order. Placing an order goes to
  tracking.
- **Submission recovery:** the order and a submission UUID are saved in `sessionStorage` before sending. If the reply
  is lost, the sheet freezes the order and offers "Retry original order", which returns the saved ticket instead of
  creating a second one. After a reload the pending order is restored, and if the service already has it the page
  goes straight to tracking. A rejected order (4xx) is unfrozen for editing.
- **States:** a sold-out dish or option; an item going out of stock while it is in the cart (the line is flagged and
  ordering is blocked); an empty cart; no search results; validation messages; submitting (double taps are
  ignored).
- **URL:** `?table=4&type=dine_in` sets the context and is remembered for the session.

## 5. Responsive behaviour

| Staff shell | Below `md` (<768) | `md`–`xl` | `xl`+ (≥1280) |
| --- | --- | --- | --- |
| Navigation | Top bar + bottom tab bar; `main` gets `pt-20 pb-24` | 80px sidebar | Sidebar |
| Headers | Wrap, `px-4` | Mockup layout | Mockup layout |
| Order Queue | 1 column; stats column hidden (counts in the subtitle) | 2–3 columns | 4 columns + right statistics column |
| Analytics | Mockup 3: stacked cards, Peak/Prep side by side, list instead of table | Mockup 2 | Mockup 2 |
| Ledger | Customer column hidden; the table scrolls sideways | Full table | Full table |

| Customer pages | Phone | `md`+ |
| --- | --- | --- |
| Menu | Single column, bottom sheets | Content `max-w-3xl` centred, items in two columns, sheets may centre |
| Tracking | Card `max-w-sm` | Same card; the pickup board widens to two columns |

## 6. Motion

| Element | Trigger | Animation | Duration | Easing |
| --- | --- | --- | --- | --- |
| Highlighted ticket | `needsAttention` true | box-shadow pulse (`order-card-pulse`) | 2s, infinite | default |
| Recently repriced dish | price change in the last 10 minutes | `price-pulse` glow | 2s, infinite | default |
| Connection dot | connected | `animate-ping` | 1s, infinite | Tailwind default |
| Toast | shown / hidden | translate-y 5rem + fade | 500ms | ease |
| New-order toast icon | shown | `animate-bounce` | 1s, infinite | Tailwind default |
| Bottom sheet | open | `animate-slide-up` from 100% | 400ms | cubic-bezier(.16,1,.3,1) |
| Slide-over drawer | open | slide in from the right | 300ms | ease-out |
| Tracking "Preparing" icon, ready overlay | state | `animate-bounce` | 1s, infinite | Tailwind default |
| Buttons | press | `active:scale-95` | 150ms | Tailwind default |
| Ledger row | hover | translate-x 4px + tint | 200ms | cubic-bezier(.4,0,.2,1) |

`prefers-reduced-motion: reduce` turns off every animation and transition (`styles/masaflow.css`).

## 7. Accessibility

- **Structure:** one `h1` per page. Landmarks are `aside`, `nav`, `main` and `header`. Tickets and cards are named
  after their guest (`aria-labelledby`).
- **Focus:** `:focus-visible` shows a 3px orange ring. Dialogs use `<dialog>` + `showModal()`, which gives a focus
  trap and Esc to close. Focus returns to the opener, and after a payment it moves to the ticket's next-step button.
  When a live update removes the focused ticket, focus moves to the next ticket rather than being lost.
- **Patterns:** toggle chips use `aria-pressed`; stock and on-the-side switches use `role="switch"` + `aria-checked`;
  pagination and nav use `aria-current`; the timeline uses `aria-current="step"`; the ready overlay is
  `role="alertdialog"`.
- **Live regions:** queue subtitle, alert list, inventory summary, stat cards, over/short preview, and tracking status
  (all `aria-live="polite"`); errors use `role="alert"`; toasts use `role="status"` (`alert` for errors).
- **Contrast:** text that carries information uses `stone-500` or darker. `stone-400`/`stone-300` appear only on
  mockup micro-labels and on the idle "Waiting for new orders..." placeholder.
- **Touch targets:** at least 44px on phone layouts (chips, tab links, steppers, icon buttons). The customer menu's
  plus button stays 32px visually and gets a larger invisible hit area.
- **Icons:** always `aria-hidden="true"`. Icon-only controls have an `aria-label`.

## 8. Content rules

- **Money:** always from integer minor units via `MasaFlow.money(cents, record.currency)`. It formats in the
  viewer's language (`$1,234.50` in es-MX, `MX$1,234.50` in en-US). Pass the record's own currency: legacy USD
  receipts and shifts keep their currency, and totals only add up within one currency. Never do float arithmetic on
  money.
- **Time:** always in the restaurant's time zone (`settings.timeZone`, America/Mexico_City), via `MasaFlowUI.time()`
  → `5:01 p.m.` / `5:01 PM` and `MasaFlowUI.dayKey()` → `2026-09-30`. Ledger dates read "Hoy, 5:01 p.m.",
  "Ayer, …", then "28 sept, …".
- **Language:** Spanish by default. `masaflow-i18n.js` translates text, placeholders, `aria-label` and `title` by
  looking up the English source in its dictionary, and handles sentences with numbers or names through patterns.
  Every new English string needs an entry. Give a sentence that mixes fixed words and data its own element, or add a
  pattern. Anything a person typed (customer names, notes, cashier names, drop notes) and audit messages (the
  original record text) carry `data-i18n-skip`. Pages re-render on `MasaFlowI18n.subscribe`, so money and dates
  switch format too.
- **Order numbers:** display as `#MF-2084`. The stored value is `MF-2084`.
- **Pluralisation:** always ("1 active order", "3 active orders").
- **Truncation:** dish names in staff cards use `truncate` with a `title`; descriptions use `line-clamp-2`
  (customer: `line-clamp-1`). Customer names wrap (`break-words`); they are never cut off, because staff call them
  out.
- **Voice:** short, plain and specific. Errors say what happened and what to do ("Open a drawer shift before opening
  the cash drawer."). No emoji in UI labels.

## 9. Mockup deviations

| Mockup shows | App does | Why |
| --- | --- | --- |
| Sample names, "$2,485.50", "+12%", "142", "Showing 1-10 of 1,284" | Real values from state; trend chips compare with the previous period and hide when there is nothing to compare | No fake data |
| Sidebar gear and admin avatar | New order and Pickup board links, and a cashier chip (initials of the open shift) | There are no settings or user accounts; these are the links staff actually need |
| History sidebar link opens a drawer on Menu Management | History goes to `history.html`; the menu drawer opens from a header button | One shared nav on every staff page |
| Kitchen Alert "Low on Blue Masa", chef quote, pattern image | Alerts computed from out-of-stock items and open tickets; the drawer cash block replaces the quote and image | No fake data |
| One "Mark as Ready" button, "Total Due (Cash)" on every ticket | Awaiting Cash section, then three kitchen steps; kitchen tickets say "Paid (Cash)" | Cash is collected before cooking |
| "Refunded" filter and struck-through amounts | "In Kitchen" filter; no refunds | Refunds are out of scope (they would change drawer math) |
| "Terminal 01" / "By POS Terminal 1" | Cashier name; audit meta shows the action type | There are no terminal identities |
| History header "Add New Item" | Open Cash Drawer | The mockup header was copied from the menu page |
| "Select Date Range" button | Two real date inputs | Needed a working control |
| Tracking "Counter 1 • MasaFlow HQ", phone button, "Need help?" | "Counter" / "Table N", a back-to-menu button, an "Order something else" link | No location or phone data behind them |
| Tracking with three steps | Four steps (adds Cash Paid), each with a real time | Upfront cash |
| Menu "PROMO" tag | Order context tag | There is no promotion system |
| Menu "Popular Items" | "Our Menu" or the category name | No popularity ranking on the customer side |
| Menu category icon `fa-flatbread` | `fa-wheat-awn` | Flatbread is FontAwesome Pro; it rendered blank in the export |
| "Extra Meat" add-on | Not in the seed menu (cheese and avocado only) | The seed's modifier prices are pinned by the cash tests; staff can add modifiers per dish |
| Analytics as the only metrics view | Both: the mockup page at `metricsDashbord.html` and the React app at `/analytics/` | The mockup page needs no build; the app adds source inspection and AI summaries |
| Menu font `{{font}}` | Outfit, with sans headings | Unfilled template variable in the export |
| Customizer without a masa choice, notes or quantity | Adds Choose Your Masa (required), Special Instructions, quantity | The order engine requires a masa, and the kitchen needs notes |
| Chart ellipsis menus | Removed | Nothing behind them |
| Simulated incoming orders / status changes | Removed; real updates arrive over Server-Sent Events | No simulation code |
| Emoji in labels ("💾", "↩️", "🔴") | Icons or plain text | Consistent tone; screen readers |

## 10. Working on it

- **Run:** `npm start`, then open `http://127.0.0.1:4173/`. The HTML screens need no install. Everything they load is
  in the repository except the Google web fonts. The `/analytics/` app needs `npm run setup && npm run build`
  first.
- **Styles:** use Tailwind v3 classes in the page. After adding classes, run `npm run build:css`, which compiles
  `styles/masaflow.css` + `tailwind.config.js` into `assets/masaflow.css` (committed). Write class names in
  full: `'text-' + tone + '-600'` produces no CSS. The output goes to `assets/masaflow.css`, served at `/assets/`. Use a lookup object whose values are complete strings.
- **Why compiled:** the mockups used Tailwind's browser JIT from a CDN. That needs internet on every page load and
  styles the page late. The compiled file is the same CSS, delivered instantly and offline. It is pinned to v3
  because v4 changes the default scales the mockups were drawn with.
- **Vendored libraries:** `assets/vendor/` holds FontAwesome Free 6.4 solid icons (JS/SVG; icons added to
  the page later are picked up automatically) and Plotly 3.1 basic.
- **New staff screen:** copy the `<head>` and the staff shell from an existing staff page exactly, and move
  `aria-current="page"` to the new link in both navs. Give the header one `data-mf-language-host`, and load
  `masaflow-store.js`, then `masaflow-i18n.js`, then `masaflow-ui.js`. `tests/pages.test.js` checks the shell is
  identical and that translation is loaded.
- **Verify a change:** run `npm test` (engine rules plus static page checks). Then check the page at 390, 768, 1024
  and 1440px wide, including the empty state, the offline state and very long names.
