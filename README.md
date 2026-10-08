# MasaFlow

A local restaurant suite for cash and SPEI bank transfers built with **React, TypeScript, Tailwind CSS, Express and Socket.io**. Customers order on their phones; staff review and accept orders before cooking; the cashier records the payment (cash, or a SPEI transfer they verify in the bank app) when the customer picks up. All prices and digital receipts use integer MXN centavos.

## Start on your Mac

1. Install Node.js **22.12 or newer** (includes npm).
2. Double-click **`Start_MasaFlow.command`** in this folder. If macOS asks which app to use, choose Terminal.
3. On first launch, dependencies are installed and you choose a private four-digit staff PIN. The launcher writes it to your local `.env` file.
4. The POS opens automatically. Enter your PIN. Keep the Terminal window open while the restaurant is operating.
5. Press **Ctrl+C**, or close the Terminal window, to stop the service. The launcher stops only the process it started; it never kills unrelated apps on a busy port.

Internet is needed for the first dependency installation. The launcher builds the apps, then serves the compiled frontends and local backend over one port; after installation, the restaurant can operate over Wi-Fi without outside internet. Phones must reach the Mac on that network; use the Mac's LAN address, not `localhost`, on a phone.

| Screen | Launcher URL (default port 3000) |
|---|---|
| Customer menu | `http://localhost:3000/order/` |
| POS and kitchen | `http://localhost:3000/pos/` |
| Caja y ventas | `http://localhost:3000/analytics/` |
| Backend health | `http://localhost:3000/api/health` |

The launcher checks the backend port first, builds all three frontends, waits for the service identity and each app route to respond, and then opens the browser. If the port is occupied, it reports the conflict without stopping that process. Set `PORT` to change the shared port.

## Manual start and production build

```sh
npm ci
cp .env.example .env
# Set MASAFLOW_STAFF_PIN to your own four-digit PIN in .env.
npm run dev
```

For one server serving the compiled apps:

```sh
npm run build
npm start
```

Open `http://localhost:3000/order/`, `/pos/`, or `/analytics/`. `MASAFLOW_HOST` defaults to `0.0.0.0` for LAN access. A valid PIN is required even on localhost. No default PIN is shipped. Never commit `.env`.

## Optional Docker deployment

`docker compose up --build -d` runs the compiled suite at `http://localhost:4173/pos/` with the PIN from `.env`. Compose binds to `127.0.0.1` by default and has no public HTTP/HTTPS gateway. For trusted restaurant Wi-Fi access, set `MASAFLOW_BIND_IP` in `.env` to the Mac's specific private LAN address. Do not forward this port to the internet; public deployment needs HTTPS and stronger staff access controls. The stable container hostname allows the single-writer lock to recover after a container is recreated. Data remains in the `restaurant-data` volume under `/data/realtime`.

Docker execution has not been verified on this workstation; the local Node runtime is the tested deployment.

## Restaurant workflow

- **En revisión:** phone orders arrive here without a payment. Staff inspect the digital ticket and accept it to start cooking.
- **Cocinando:** accepting the order starts preparation and updates the customer's live tracking screen. Modifiers are explicit: red omissions, green extras, neutral masa choices. Review tickets turn amber at 2 minutes and red («Demorado») at 3; cooking tickets turn amber at 5 minutes and red at 15.
- **Lista para recoger:** tap **Marcar lista para recoger** to notify the customer in the app; customers can opt into browser notifications and hear the ready chime. At pickup, use **Cobrar al entregar** to calculate change and record cash, or **Transferencia SPEI** once the transfer shows in the bank app; successful payment also records the handoff. Customers choose cash or SPEI when they order, and a SPEI customer sees the CLABE, exact amount and reference on their order screen.
- **Anular / No-Show:** an unpaid ticket can be voided while in review or after it is ready for pickup; its items remain in digital history, but it adds no revenue or sold-item totals. Cooking tickets must finish or be marked ready first.
- **Sin impresora ni periféricos:** tickets, receipts, payment calculations, and shift records stay in the app; the workflow does not send print or cash-drawer commands.
- **Inventario:** toggle dishes or modifiers. Every connected customer sees **Agotado** immediately. The server also rejects stale carts containing unavailable choices.
- **Pausar Pedidos Web:** customers see “La cocina está a tope. Por favor, ordena directamente en el mostrador.” Existing orders remain trackable.
- **Caja y ventas:** shows sales split into cash in the drawer and SPEI transfers, gross cash received, change, paid count and delivered-item rankings. Search, filter, and export the ledger.
- **Cerrar Turno:** deliver and collect payment for ready orders, or cancel unpaid tickets first. Confirm to archive the final state and start an empty shift. Current menu availability is retained.

`Sin Conexión` disables submissions and staff mutations. Reconnection requests fresh server state. The customer session, pending submission ID, and active order ID survive refresh/tab closure in the same browser; clearing browser storage removes that recovery capability. Unknown acknowledgement results must be checked before retrying; the existing request/payment IDs prevent duplicate orders or cash recognition.

## Data and recovery

Default live file: **`.masaflow-realtime/data.json`**. Set `MASAFLOW_DATA_DIR` to use a different directory. Every mutation is synchronously written through an atomic temporary-file replacement, with file and directory fsync before success. If durability cannot be confirmed after replacement, the service blocks further changes until restart and ledger verification. A writer lock prevents concurrent servers from sharing the same file. Startup validates the saved ledger; invalid data is never silently discarded.

**Menu catalog:** a fresh install is seeded from `shared/realtime/catalog.js`: 33 dishes in six sections plus the two **C/QUESILLO** add-ons ($10 on huaraches and gorditas, $5 on sopes, quesadillas and pambazos). Bebidas are not seeded because the printed menu leaves their prices blank. An existing install that still holds the old four-dish placeholder menu (and nothing else) is switched to this catalog once, on the next start; `data.before-zapata-menu-r<revision>.json` is saved beside `data.json` first. Paid history keeps the names and prices it was sold at, and a menu that has been changed in any other way is never replaced.

Closeout saves **`archive_<date>_<shift-id>.json`** next to `data.json` before resetting it. Archives contain complete order records and final revenue (cash and SPEI shown separately), and void counts. Here `voidCount` means unpaid No-Show cancellations; paid refunds are not part of this workflow. Copy the data directory to a separate disk regularly. To restore an archive, stop the service, keep a copy of the current file, copy the chosen archive to `data.json`, then restart. This reopens that archived shift; use the archive as read-only evidence if you do not intend to reopen it.

**Existing installations:** the earlier HTML/SSE app is preserved as `legacy-server.cjs`; its `.masaflow/state.json`, backup tools, source files, and tests remain intact. The new suite starts with a separate ledger and does **not** import old USD/MXN histories automatically. Finish and back up the old shift before switching. `npm run legacy:start` explicitly starts the historical runtime; its documentation is in [docs/LEGACY_README.md](docs/LEGACY_README.md). The new runtime does not serve the old pages or execute their printer/drawer code. Historical backup, restore and login-startup npm commands now use the `legacy:` prefix so they cannot be mistaken for tools for the new ledger.

## Source and checks

| Concern | Source |
|---|---|
| Typed contracts | `shared/types/realtime.ts` |
| Ledger and durable mutations | `shared/realtime/engine.js` |
| Menu catalog (the printed "Los Huaraches de Zapata" menu) | `shared/realtime/catalog.js` |
| Express, Socket.io, staff authorization | `server.js` |
| Structured logging (pino, daily files) | `shared/logger.js` |
| Training simulator and exam grading | `apps/business-pos/src/simulator.js` |
| Interactive training (curriculum, state machine, coachmarks), see `docs/ACADEMY.md` | `apps/business-pos/src/academy/` |
| Load tests, ReDoS scan, Semgrep and Gitleaks config | `scripts/loadtest.cjs`, `artillery/`, `scripts/scan-regex.cjs`, `.semgrep/`, `.gitleaks.toml` |
| Connection context and shared UI | `shared/ui/` |
| Customer React app | `apps/client-web/src/` |
| POS React app | `apps/business-pos/src/` |
| Live analytics React app | `apps/analytics/src/content/realtime/` |
| Mac supervisor | `scripts/dev.cjs`, `Start_MasaFlow.command` |

The older analytics report runtime remains intact. The explicitly requested operational suite has its own `realtime.html` entry and scoped content; its output is `dist-realtime`, separate from the preserved report build.

```sh
npm run typecheck
npm test
npm run test:realtime
npm run build
```

Logs, the Admin UI, load tests and security scans are covered in [docs/OPERATIONS_AND_SECURITY.md](docs/OPERATIONS_AND_SECURITY.md).

See [docs/REALTIME_ARCHITECTURE.md](docs/REALTIME_ARCHITECTURE.md) for lifecycle, cash recognition, security, persistence, chart semantics, performance limits and test boundaries.
