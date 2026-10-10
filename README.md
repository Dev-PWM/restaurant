# MasaFlow

A restaurant ordering suite for cash and bank transfers built with **React, TypeScript, Tailwind CSS, Express and Socket.io**. Customers order on their phones; staff review and accept orders before cooking; the cashier records payment after verifying cash or a bank transfer at pickup. All prices and digital receipts use integer MXN centavos.

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

Open `http://localhost:3000/order/`, `/pos/`, or `/analytics/`. `MASAFLOW_HOST` defaults to `0.0.0.0` for LAN access. A valid PIN is required even on localhost; the sample environment file leaves it blank so you must choose one. Never commit `.env`.

## Optional Docker deployment

`docker compose up --build -d` runs the compiled suite at `http://localhost:4173/pos/` with the PIN from `.env`. This local stack binds to `127.0.0.1` by default. For trusted restaurant Wi-Fi access, set `MASAFLOW_BIND_IP` in `.env` to the Mac's specific private LAN address. The stable container hostname allows the single-writer lock to recover after a container is recreated. Data remains in the `restaurant-data` volume under `/data/realtime`.

For a public website, use the separate HTTPS stack in `compose.public.yaml`, a unique staff password, and the steps in [docs/PUBLIC_WEBSITE.md](docs/PUBLIC_WEBSITE.md). The domain and always-on host still need to be provisioned before public launch.

Docker execution has not been verified on this workstation; the local Node runtime is the tested deployment.

## Restaurant workflow

- **En revisión:** phone orders arrive here without a payment. Staff inspect the digital ticket and accept it to start cooking.
- **Cocinando:** accepting the order starts preparation and updates the customer's live tracking screen. Each dish on a ticket has its quantity, name, preparation, and a compact topping grid. Green means the customer wants an ingredient; red means they do not. Optional special preparation appears as a short **ESPECIALES DE ZAPATA** note. Review tickets turn amber at 2 minutes and red at 3; cooking tickets turn amber at 5 minutes and red at 15.
- **Lista para recoger:** tap **Marcar lista para recoger** to notify the customer in the app; customers can opt into browser notifications and hear the ready chime. At pickup, use **Cobrar al entregar** to calculate change and record cash, or **Transferencia · BBVA México** after verifying the transfer in the bank app. Successful payment also records the handoff. A customer who chose transfer sees the CLABE, exact amount, and reference on their order screen.
- **Anular / No-Show:** an unpaid ticket can be voided while in review or after it is ready for pickup; its items remain in digital history, but it adds no revenue or sold-item totals. Cooking tickets must finish or be marked ready first.
- **Sin impresora ni periféricos:** tickets, receipts, payment calculations, and shift records stay in the app; the workflow does not send print or cash-drawer commands.
- **Control de Mesas:** the dining room's tables (3). Tap a table when you seat someone and tap it again when it frees up. Customers who choose **Comer aquí** see how many tables are free, live; when none are, that option switches itself off. Taking a dine-in order never marks a table by itself, and closing the shift frees all of them. Dine-in tickets carry a «COMER AQUÍ» tag.
- **Inventario:** toggle dishes or modifiers. Every connected customer sees **Agotado** immediately. The server also rejects stale carts containing unavailable choices.
- **Pausar Pedidos Web:** customers see “La cocina está a tope. Por favor, ordena directamente en el mostrador.” Existing orders remain trackable.
- **Caja y ventas:** shows sales split into cash in the drawer and SPEI transfers, gross cash received, change, paid count and delivered-item rankings. Search, filter, and export the ledger.
- **Cerrar Turno:** deliver and collect payment for ready orders, or cancel unpaid tickets first. Confirm to archive the final state and start an empty shift. Current menu availability is retained.

`Sin Conexión` disables submissions and staff mutations. Reconnection requests fresh server state. The customer session, pending submission ID, and active order ID survive refresh/tab closure in the same browser; clearing browser storage removes that recovery capability. Unknown acknowledgement results must be checked before retrying; the existing request/payment IDs prevent duplicate orders or cash recognition.

## Data and recovery

Default live file: **`.masaflow-realtime/data.json`**. Set `MASAFLOW_DATA_DIR` to use a different directory. Every mutation is synchronously written through an atomic temporary-file replacement, with file and directory fsync before success. If durability cannot be confirmed after replacement, the service blocks further changes until restart and ledger verification. A writer lock prevents concurrent servers from sharing the same file. Startup validates the saved ledger; invalid data is never silently discarded.

**Menu catalog:** a fresh install is seeded from `shared/realtime/catalog.js`: 31 dishes in five sections plus quesillo add-ons ($10 on huaraches and gorditas, $5 on sopes, quesadillas and pambazos). Bebidas are not seeded because the printed menu leaves their prices blank. An existing install that still holds the old four-dish placeholder menu (and nothing else) is switched to this catalog once, on the next start; `data.before-zapata-menu-r<revision>.json` is saved beside `data.json` first. Paid history keeps the names and prices it was sold at, and a menu that has been changed in any other way is never replaced. Every dish also offers a **required** «Al comal (sin grasa)» or «Frito (con grasa)» choice, with no default so the kitchen never gets an ambiguous ticket. Cebolla, cilantro, both salsas and extra quesillo each have an explicit Sí/No choice. An install saved before these existed gains them once on the next start: only missing modifiers are added (never removed, renamed or re-priced), stock switches and dishes you created are kept, and `data.before-catalog-r<revision>.json` is saved beside `data.json` first.

**Special preparation:** the printed menu's two specials are optional notes, not separate dishes. Huaraches and sopes add base de nopal, frijoles, pico de gallo, queso and crema; quesadillas, gorditas and pambazos add cecina, longaniza, nopal and quesillo. Customers turn this on under **ESPECIALES DE ZAPATA** while ordering; the kitchen sees the included ingredients in a short note. It has no extra charge unless `SPECIAL_PRICE_CENTS` is changed in `shared/realtime/catalog.js`. Existing paid orders keep their sold prices. Ordering extra quesillo on top of a special that already includes it reads «doble quesillo».

**Mesas:** customers see every table («Mesa 1 · Libre / Ocupada») live on the menu and under «Comer aquí» in checkout, driven by the same taps staff make in Control de Mesas.

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

## The name on screen

Customers and staff see **Los Huaraches de Zapata** (the page titles, the header, the home-screen icon label, the install help and the Academy). The name lives in `shared/ui/brand.ts` and in the three `realtime.html` pages, and a test fails if the software's own name, MasaFlow, shows up in anything a person reads. MasaFlow stays as the project name inside folders, environment variables, browser storage keys and the launcher's health check: changing those would orphan saved data and break the launcher, so they are deliberately untouched.

## Logo

The mascot is `docs/brand/mascot-source.jpg`. Everything else is generated from it: the header logo, the favicon, the home-screen icons (including the Android maskable one) and the iPhone icon. To change the logo, replace that picture and rebuild the icons (macOS, no extra tools):

```sh
swiftc -module-cache-path "$TMPDIR/swiftcache" scripts/build-logo.swift -o "$TMPDIR/build-logo"
"$TMPDIR/build-logo" docs/brand/mascot-source.jpg shared/pwa assets/apple-touch-icon.png
```

The script removes the white sticker background (it expects a white or very light background around the drawing), so a picture on a coloured background needs that step adjusted. Then run `npm run build`.
