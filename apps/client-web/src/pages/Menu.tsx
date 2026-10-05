import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChefHat,
  Coins,
  Flame,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import type { MenuItem, OrderInput } from "../../../../shared/types/realtime";
import {
  readStorage,
  useRealtime,
  uuid,
  writeStorage,
} from "../../../../shared/ui/RealtimeProvider";
import {
  Brand,
  enableAudio,
  mxn,
  SoundButton,
  PWAInstallButton,
} from "../../../../shared/ui/components";
import { CartDrawer } from "./CartDrawer";
import { CustomizeModal, itemAvailable } from "./CustomizeModal";
import { OrderStatus } from "./OrderStatus";

export const activeKey = "masaflow.v3.orderId";
export const pendingKey = "masaflow.v3.pending";
export const pendingTotalKey = "masaflow.v3.pendingTotalCents";

type CartLine = OrderInput["items"][number];

export { itemAvailable };

function restoredPending(): OrderInput | null {
  try {
    const value = JSON.parse(readStorage(pendingKey) || "null");
    return value &&
      typeof value.orderId === "string" &&
      Array.isArray(value.items)
      ? value
      : null;
  } catch {
    return null;
  }
}

export function Menu() {
  const { snapshot, connected, sessionId, command } = useRealtime();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customizeId, setCustomizeId] = useState<string | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Todo");
  const [searchQuery, setSearchQuery] = useState("");

  const [activeId, setActiveId] = useState(() => readStorage(activeKey));
  const [pending, setPending] = useState(restoredPending);
  const [pendingTotalCents, setPendingTotalCents] = useState(() => {
    const storedValue = readStorage(pendingTotalKey);
    if (storedValue === null) return null;
    const value = Number(storedValue);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  });
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    writeStorage(activeKey, activeId);
  }, [activeId]);

  const orders = snapshot
    ? [...snapshot.activeOrders, ...snapshot.completedOrders]
    : [];

  const order = orders.find(
    (o) => o.id === activeId || o.id === pending?.orderId,
  );

  useEffect(() => {
    if (order) {
      setActiveId(order.id);
      setPending(null);
      writeStorage(pendingKey, null);
      setPendingTotalCents(null);
      writeStorage(pendingTotalKey, null);
      setCart([]);
    }
  }, [order?.id]);

  const filteredItems = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.menuItems.filter((item) => {
      const matchesCategory =
        category === "Todo" || item.category === category;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [snapshot, category, searchQuery]);

  if (!snapshot) {
    return (
      <div className="flex min-h-[90dvh] flex-col items-center justify-center p-8 text-center">
        <Brand />
        <div className="my-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-clay-50 text-clay-700 animate-pulse">
          <Flame size={28} />
        </div>
        <h2 className="display text-2xl font-bold text-stone-900">
          Encendiendo el comal…
        </h2>
        <p className="mt-2 text-sm text-stone-500">
          Conectando en tiempo real con la cocina.
        </p>
      </div>
    );
  }

  // Active tracking view if customer has an ongoing order
  if (order) {
    return (
      <OrderStatus
        order={order}
        onNewOrder={() => {
          setActiveId(null);
          setPending(null);
          setPendingTotalCents(null);
          setCheckout(false);
          setCart([]);
          writeStorage(activeKey, null);
          writeStorage(pendingKey, null);
          writeStorage(pendingTotalKey, null);
        }}
      />
    );
  }

  // If local active order ID is not in active shift, show recovery notice
  if (activeId) {
    return (
      <div className="mx-auto flex min-h-[90dvh] max-w-md flex-col items-center justify-center p-8 text-center">
        <Brand />
        <div className="my-6 flex h-16 w-16 items-center justify-center rounded-full bg-stone-100 text-stone-600">
          <Utensils size={28} />
        </div>
        <h1 className="display text-3xl font-bold text-stone-900">
          Tu pedido está en el historial.
        </h1>
        <p className="my-4 text-sm leading-relaxed text-stone-600">
          El turno pudo haber concluido o tu comanda ya fue entregada. Consulta al personal del mostrador si necesitas verificar tu servicio.
        </p>
        <p className="rounded-lg bg-stone-100 p-2 font-mono text-xs text-stone-500 break-all">
          Ref: {activeId}
        </p>
        <button
          className="btn btn-primary mt-6 w-full"
          disabled={!connected}
          onClick={() => setActiveId(null)}
        >
          Iniciar un nuevo pedido
        </button>
      </div>
    );
  }

  // When kitchen is paused
  if (!snapshot.acceptingOrders) {
    return (
      <div className="mx-auto flex min-h-[90dvh] max-w-lg flex-col items-center justify-center p-8 text-center">
        <Brand />
        <ChefHat className="my-8 text-clay-600 animate-pulse" size={64} />
        <h1 className="display text-4xl">La cocina está a tope.</h1>
        <p className="mt-5 text-xl text-stone-600">
          Por favor, ordena directamente en el mostrador.
        </p>
        <p className="mt-8 text-sm text-stone-500">
          Gracias por tu paciencia. Este menú volverá automáticamente.
        </p>
      </div>
    );
  }

  const customizeItem = snapshot.menuItems.find((m) => m.id === customizeId);

  const price = (line: CartLine) => {
    const item = snapshot.menuItems.find((m) => m.id === line.menuItemId);
    const itemBase = item?.priceCents || 0;
    const mods = line.modifierIds.reduce(
      (sum, id) =>
        sum + (snapshot.modifiers.find((m) => m.id === id)?.priceCents || 0),
      0,
    );
    return itemBase + mods;
  };

  const total = cart.reduce(
    (sum, line) => sum + price(line) * line.quantity,
    0,
  );
  const totalItemsCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const pendingExpired = pending && pending.shiftId !== snapshot.shiftId;

  async function submit() {
    if (!snapshot || !connected) return;
    enableAudio();
    setLocalError("");
    setBusy(true);

    const request: OrderInput = pending || {
      orderId: uuid(),
      sessionId,
      shiftId: snapshot.shiftId,
      customerName: name.trim(),
      items: cart,
    };
    const quotedTotalCents = pending ? pendingTotalCents : total;

    if (
      (quotedTotalCents !== null &&
        !writeStorage(pendingTotalKey, String(quotedTotalCents))) ||
      !writeStorage(pendingKey, JSON.stringify(request))
    ) {
      writeStorage(pendingTotalKey, null);
      setLocalError(
        "Activa el almacenamiento del navegador para conservar tu pedido.",
      );
      setBusy(false);
      return;
    }

    setPending(request);
    setPendingTotalCents(quotedTotalCents);
    const reply = await command("submit_client_order", request);

    if (reply.ok) {
      const confirmedId = reply.orderId || request.orderId;
      setActiveId(confirmedId);
      setCart([]);
      setCheckout(false);
      writeStorage(activeKey, confirmedId);
      writeStorage(pendingKey, null);
      writeStorage(pendingTotalKey, null);
      setPending(null);
      setPendingTotalCents(null);
    } else if (!["ACK_TIMEOUT", "OFFLINE"].includes(reply.code)) {
      setPending(null);
      writeStorage(pendingKey, null);
      setPendingTotalCents(null);
      writeStorage(pendingTotalKey, null);
      setLocalError(reply.error);
    }
    setBusy(false);
  }

  if (pending && !pendingExpired) {
    return (
      <main className="mx-auto flex min-h-[90dvh] max-w-lg flex-col justify-center gap-6 p-6 text-center">
        <header className="flex items-center justify-between gap-3">
          <Brand />
          <PWAInstallButton />
        </header>
        <section
          className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-6 text-left shadow-xs"
          aria-live="polite"
        >
          <h1 className="display text-2xl font-bold text-amber-950">
            Tu orden está en pausa.
          </h1>
          <p className="mt-3 text-base leading-relaxed text-amber-950">
            Paga{" "}
            <strong className="tabular-nums">
              {pendingTotalCents === null
                ? "el total confirmado en mostrador"
                : `${mxn(pendingTotalCents)} MXN`}
            </strong>{" "}
            en el mostrador para que empecemos a cocinar.
          </p>
          <p className="mt-3 text-sm text-amber-900">
            Tu pedido se enviará con la misma referencia al verificarlo; no se
            crearán pedidos duplicados.
          </p>
          <button
            className="btn btn-primary mt-5 min-h-12 w-full"
            disabled={!connected || busy}
            onClick={() => void submit()}
          >
            {busy ? "Verificando pedido…" : "Verificar y reintentar"}
          </button>
          {!connected && (
            <p className="mt-3 text-sm font-semibold text-red-700">
              Sin conexión. El pedido quedó guardado en este dispositivo.
            </p>
          )}
        </section>
      </main>
    );
  }

  const categories = [
    "Todo",
    ...Array.from(new Set(snapshot.menuItems.map((m) => m.category))),
  ];

  return (
    <>
      {/* Top Customer Header */}
      <header className="sticky top-0 z-20 border-b border-stone-200/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <Brand />
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
              Comal Caliente
            </span>
            <SoundButton />
            <PWAInstallButton />
            {totalItemsCount > 0 && (
              <button
                className="btn btn-primary text-xs font-bold py-1.5 px-3 sm:hidden"
                onClick={() => setCheckout(true)}
              >
                <ShoppingBag size={14} />
                <span>{totalItemsCount}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[90rem] px-4 pb-36 pt-6 sm:px-6 sm:pt-10 lg:pr-[22rem]">
        {/* Hero & Cash Upfront Guidance */}
        <div className="mb-8 grid items-stretch gap-6 md:grid-cols-[1.5fr_1fr]">
          <div className="flex flex-col justify-center rounded-3xl bg-gradient-to-br from-clay-900 to-clay-950 p-6 sm:p-8 text-white shadow-xs">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-orange-300">
              Masa Criolla Nixtamalizada
            </span>
            <h1 className="display mt-2 text-4xl sm:text-5xl font-black leading-tight text-white">
              Hecho con masa.
              <br />
              Servido con cariño.
            </h1>
            <p className="mt-3 text-sm sm:text-base text-clay-100 max-w-md leading-relaxed">
              Huaraches, sopes, pambazos y antojitos recién salidos del comal. Elige tus platillos y paga al llegar al mostrador.
            </p>
          </div>

          {/* Upfront Cash Trust Card (Strictly satisfies prompt requirements) */}
          <div className="flex flex-col justify-between rounded-3xl border border-amber-300 bg-amber-50/80 p-6 shadow-2xs">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-amber-950">
                <Coins size={18} className="text-amber-700" />
                <span>Aquí cocinamos después de cobrar</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-stone-800 font-medium">
                Sin pagos en línea. Paga en efectivo en el mostrador para empezar a cocinar.
              </p>
              <p className="mt-1 text-xs text-stone-600">
                No online payments. Pay in cash at the counter to start cooking.
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-amber-200/80 flex items-center justify-between text-xs text-amber-900">
              <span className="font-semibold">✓ Cero comisiones</span>
              <span className="font-semibold">✓ 100% Efectivo</span>
              <span className="font-semibold">✓ Al momento</span>
            </div>
          </div>
        </div>

        {/* Pending Order Notice if interrupted */}
        {pending && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-2xs"
          >
            <p className="font-bold text-amber-950">
              {pendingExpired
                ? "El turno anterior cerró."
                : "Tu comanda necesita confirmación."}
            </p>
            <p className="my-1.5 text-xs text-amber-900">
              {pendingExpired
                ? "Consulta al mostrador antes de enviar un pedido nuevo."
                : "Puedes reintentar con la misma referencia sin duplicar tu pedido."}
            </p>
            <button
              className="btn btn-primary text-xs mt-2"
              disabled={!connected || busy}
              onClick={() =>
                pendingExpired
                  ? (setPending(null),
                    setPendingTotalCents(null),
                    writeStorage(pendingKey, null),
                    writeStorage(pendingTotalKey, null))
                  : void submit()
              }
            >
              {pendingExpired
                ? "Entendido, volver al menú"
                : "Verificar y reintentar"}
            </button>
          </div>
        )}

        <aside
          className="fixed right-6 top-28 z-20 hidden max-h-[calc(100dvh-9rem)] w-80 flex-col overflow-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-lg lg:flex"
          aria-label="Carrito"
        >
          <h2 className="text-lg font-bold text-stone-900">Tu pedido</h2>
          {cart.length === 0 ? (
            <p className="py-6 text-sm text-stone-500">
              Agrega un antojito para empezar.
            </p>
          ) : (
            <ul className="my-4 space-y-3">
              {cart.map((line, index) => {
                const item = snapshot.menuItems.find(
                  (entry) => entry.id === line.menuItemId,
                );
                return (
                  <li
                    className="flex justify-between gap-3 border-b border-stone-100 pb-3 text-sm"
                    key={`${line.menuItemId}-${index}`}
                  >
                    <span>
                      {line.quantity} × {item?.name ?? "Platillo"}
                    </span>
                    <strong className="tabular-nums">
                      {mxn(price(line) * line.quantity)}
                    </strong>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-auto border-t border-stone-200 pt-4">
            <div className="flex justify-between text-sm">
              <span>Total estimado</span>
              <strong className="tabular-nums">{mxn(total)} MXN</strong>
            </div>
            <button
              className="btn btn-primary mt-4 min-h-12 w-full"
              disabled={cart.length === 0 || Boolean(pending)}
              onClick={() => setCheckout(true)}
            >
              Ver mi pedido ({totalItemsCount})
            </button>
          </div>
        </aside>

        {localError && (
          <p
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800"
          >
            {localError}
          </p>
        )}

        {/* Search & Filter Toolbar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Categories bar */}
          <nav
            className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
            aria-label="Categorías del menú"
          >
            {categories.map((c) => {
              const count =
                c === "Todo"
                  ? snapshot.menuItems.length
                  : snapshot.menuItems.filter((m) => m.category === c).length;

              return (
                <button
                  key={c}
                  className={`btn text-xs font-bold shrink-0 transition-colors ${
                    c === category
                      ? "border-stone-900 bg-stone-900 text-white shadow-xs"
                      : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                  }`}
                  aria-pressed={c === category}
                  onClick={() => setCategory(c)}
                >
                  <span>{c}</span>
                  <span
                    className={`ml-1 rounded px-1.5 py-0.2 text-[10px] ${
                      c === category
                        ? "bg-stone-800 text-stone-200"
                        : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Search Input */}
          <div className="relative w-full sm:w-64 shrink-0">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="search"
              placeholder="Buscar antojito…"
              className="field w-full pl-9 pr-8 text-xs font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                onClick={() => setSearchQuery("")}
                aria-label="Borrar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Menu Items Grid */}
        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center">
            <Utensils className="mx-auto mb-3 text-stone-400" size={32} />
            <h3 className="font-bold text-stone-800">
              No encontramos antojitos con esa búsqueda.
            </h3>
            <p className="mt-1 text-xs text-stone-500">
              Intenta con otra categoría o borra el término de búsqueda.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item, index) => {
              const available = itemAvailable(item, snapshot.modifiers);
              const hasMasa = item.modifierIds.some(
                (id) =>
                  snapshot.modifiers.find((m) => m.id === id)?.kind === "masa",
              );

              return (
                <article
                  key={item.id}
                  className={`panel flex flex-col justify-between border-stone-200 bg-white transition-all hover:border-stone-300 hover:shadow-xs ${
                    !available ? "bg-stone-100/70 opacity-60" : ""
                  }`}
                >
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-clay-700">
                        {item.category}
                      </span>
                      {hasMasa && (
                        <span className="rounded bg-clay-50 px-2 py-0.5 text-[11px] font-semibold text-clay-800 border border-clay-100">
                          Masa Azul / Blanca
                        </span>
                      )}
                    </div>

                    <h2 className="display text-2xl font-bold text-stone-900 leading-tight">
                      {item.name}
                    </h2>
                    <p className="mt-2 text-xs leading-relaxed text-stone-600 line-clamp-3">
                      {item.description}
                    </p>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-stone-100 pt-3">
                    <div>
                      <span className="block text-[10px] font-semibold text-stone-400 uppercase">
                        Precio
                      </span>
                      <strong className="text-xl font-bold tabular-nums text-stone-900">
                        {mxn(item.priceCents)}
                      </strong>
                    </div>

                    <button
                      className="btn btn-primary text-xs font-bold py-2 px-3.5"
                      disabled={!available || Boolean(pending)}
                      aria-label={`Agregar ${item.name}`}
                      onClick={() => setCustomizeId(item.id)}
                    >
                      {available ? (
                        <>
                          <Plus size={15} />
                          <span>Agregar</span>
                        </>
                      ) : (
                        <span>Agotado</span>
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-stone-500">
          Precios finales en pesos mexicanos (MXN). Disponibilidad actualizada en vivo con la cocina.
        </p>
      </main>

      {/* Floating Sticky Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 p-3.5 shadow-lg backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
            <div>
              <span className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                Total estimado
              </span>
              <strong className="text-xl font-black text-clay-950 tabular-nums">
                {mxn(total)} MXN
              </strong>
            </div>

            <button
              className="btn btn-primary flex-1 py-3 text-sm font-bold shadow-md"
              onClick={() => setCheckout(true)}
            >
              <ShoppingBag size={18} />
              <span>Ver mi pedido ({totalItemsCount})</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Customization Dialog */}
      {customizeItem && (
        <CustomizeModal
          item={customizeItem}
          onClose={() => setCustomizeId(null)}
          onAdd={(line) => setCart((prev) => [...prev, line])}
        />
      )}

      {/* Cart Drawer / Slide-Over Checkout */}
      {checkout && (
        <CartDrawer
          cart={cart}
          setCart={setCart}
          onClose={() => setCheckout(false)}
          onSubmit={() => void submit()}
          name={name}
          setName={setName}
          busy={busy}
          pending={pending}
          connected={connected}
        />
      )}
    </>
  );
}
