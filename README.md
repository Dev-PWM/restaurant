# MasaFlow · upfront cash ordering

Run `npm start`, then open [the kitchen and cashier screen](http://127.0.0.1:4173/businessDashbord.html). Node 20 or later is required. No package installation is needed.

The six supplied HTML screens now share a local Node service and saved records:

- [Kitchen / cash collection](http://127.0.0.1:4173/businessDashbord.html)
- [Cash ledger and shift audit](http://127.0.0.1:4173/history.html)
- [Menu and stock management](http://127.0.0.1:4173/MenuManagment.html)
- [Customer menu](http://127.0.0.1:4173/MenuUI.html)
- [Cash analytics](http://127.0.0.1:4173/metricsDashbord.html)
- Order tracking: `readypickupUI.html?order=ORDER_UUID` (linked after customer submission)

## Try the complete flow

1. Open Cash Ledger. Enter the starting float and cashier name to open a shift.
2. Open Customer Menu in a second tab. Customize a dish, add it to the cart, and submit with a customer name. A draft is held for cash payment; it stays out of the kitchen queue.
3. In the kitchen screen, find the draft under Awaiting Cash and choose Collect Cash. Enter tendered cash or select $5, $10, $20, $50, or Exact. The presets set the full tendered amount rather than adding bills.
4. Count the physical cash, verify the displayed change, and finalize. Short tender is blocked. The saved cash payment dispatches the order to the kitchen and requests a drawer pulse. Repeated finalization cannot create a second payment or pulse.
5. Move the ticket through Start → Mark Ready → Complete. The customer tracking page receives actual changes.
6. Record cash drops in Cash Ledger, then count the drawer and close the shift. Expected cash, actual cash, and over/short are saved in the shift audit.

## Cash drawer hardware

Without a configured printer, the service records a **simulated pulse** and the interface clearly labels it. Real TCP printer support uses the printer's ESC/POS drawer connector. Start the service with:

```sh
MASAFLOW_PRINTER_HOST=192.168.1.50 MASAFLOW_PRINTER_PORT=9100 npm start
```

Check the printer/drawer manufacturer's connector and pulse compatibility first. The pulse bytes are `1B 70 00 19 FA` (pin 2, 50 ms on, 500 ms off), following [Epson's ESC p reference](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_lp.html). The service records that bytes were sent; it cannot confirm the drawer physically opened. USB-specific printer drivers and silent thermal receipt printing are not implemented. Receipt reprints use the browser print dialog.

The server persists a pulse reservation before contacting the printer, keyed to payment ID. A repeated request does not send another pulse. Failed or uncertain hardware responses keep the payment and order intact. After a service crash during a pulse, its result is marked unknown; inspect the physical drawer before an intentional manual pulse. Manual pulses require an open shift and create an audit record.

## Data and scope

Records are persisted to `.masaflow/state.json` using serialized transactions and atomic file replacement. All browsers on this service receive Server-Sent Events. Opening HTML directly from disk does not provide a shared service. Stop the service before backing up or moving its data directory.

This is a local implementation for a trusted restaurant counter. It does not provide authenticated cashier/customer roles or restaurant isolation and should not be published as a public POS. The service binds to `127.0.0.1` by default. Currency defaults to USD; tax is set to zero and is explicitly unconfigured. Configure actual tax and business settings before operational use. These values are implementation defaults rather than inferred restaurant policies.

Menu prices are sample values and missing dish imagery uses a neutral placeholder. Original supplied images are used where available. Funds are all integer cents. Analytics recognizes verified cash payments at `paidAt`, including orders still in preparation; drafts do not count. It groups dates in America/Los_Angeles. Drawer float and drops do not count as sales. Refunds, voids, cash payouts, denomination counts, login history, and ingredient quantity depletion are outside this cash-flow revision.

The detailed [data definitions](DATA_MODEL.md) and TypeScript contracts in `shared/types` describe this implementation. They are project documentation; no personal or team context skill is installed.

## Verification

Run `npm test` for payment-gate, cents arithmetic, duplicate finalization, stock availability, shift/drop/audit, persistence rollback, actual ESC/POS byte delivery to a test TCP receiver, and hardware deduplication across restart checks. The suite creates temporary records and does not alter the running app's data.
