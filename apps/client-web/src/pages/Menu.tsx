import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ChefHat,
  Flame,
  Plus,
  Search,
  ShoppingBag,
  Utensils,
  X,
} from "lucide-react";
import type {
  MenuItem,
  OrderInput,
  OrderType,
  PaymentMethod,
} from "../../../../shared/types/realtime";
import {
  readStorage,
  useRealtime,
  uuid,
  writeStorage,
} from "../../../../shared/ui/RealtimeProvider";
import { summarizeCart } from "../../../../shared/ui/cart-summary.js";
import { ownerDescription } from "../../../../shared/ui/dish-description.js";
import {
  Brand,
  enableAudio,
  mxn,
  SoundButton,
  PWAInstallButton,
} from "../../../../shared/ui/components";
import { CartDrawer } from "./CartDrawer";
import { CustomizeModal, itemAvailable } from "./CustomizeModal";
import { DiningRoom } from "./DiningRoom";
import { OrderStatus } from "./OrderStatus";
import huaracheHero from "../assets/huarache-hero.jpg";
import "./customer-menu.css";

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
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [orderType, setOrderType] = useState<OrderType>("takeout");
  const [orderTypeNotice, setOrderTypeNotice] = useState("");
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
  const [cartBumped, setCartBumped] = useState(false);
  const totalItemsCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const previousItemCount = useRef(totalItemsCount);

  useEffect(() => {
    if (totalItemsCount <= previousItemCount.current) {
      previousItemCount.current = totalItemsCount;
      return;
    }
    previousItemCount.current = totalItemsCount;
    setCartBumped(true);
    const timer = window.setTimeout(() => setCartBumped(false), 200);
    return () => window.clearTimeout(timer);
  }, [totalItemsCount]);

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

  // The last free table can fill while someone is deciding. Switch them to takeout and say so, rather than
  // letting them submit a dine-in order the server would refuse.
  const tablesAvailable = (snapshot?.tables ?? []).filter(
    (table) => table.status === "available",
  ).length;
  useEffect(() => {
    if (!snapshot || orderType !== "dine_in" || tablesAvailable > 0) return;
    setOrderType("takeout");
    setOrderTypeNotice(
      "Se ocuparon todas las mesas. Cambiamos tu pedido a «Para llevar».",
    );
  }, [snapshot, orderType, tablesAvailable]);

  const filteredItems = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.menuItems.filter((item) => {
      const matchesCategory = category === "Todo" || item.category === category;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        [item.name, item.category, ownerDescription(item)].some((text) =>
          text?.toLowerCase().includes(query),
        );
      return matchesCategory && matchesSearch;
    });
  }, [snapshot, category, searchQuery]);

  // Sections follow the printed menu: first appearance in the catalog decides the order.
  const groups = useMemo(() => {
    const byCategory = new Map<string, MenuItem[]>();
    for (const item of filteredItems)
      byCategory.set(item.category, [
        ...(byCategory.get(item.category) ?? []),
        item,
      ]);
    return [...byCategory];
  }, [filteredItems]);

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
          El turno pudo haber concluido o tu comanda ya fue entregada. Consulta
          al personal del mostrador si necesitas verificar tu servicio.
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

  // Pausing web orders only hides the public menu; existing orders remain active.
  if (!snapshot.acceptingOrders) {
    return (
      <div className="mx-auto flex min-h-[90dvh] max-w-lg flex-col items-center justify-center p-8 text-center">
        <Brand />
        <ChefHat className="my-8 text-clay-600 animate-pulse" size={64} />
        <h1 className="display text-4xl">Pedidos por internet pausados.</h1>
        <p className="mt-5 text-xl text-stone-600">
          Puedes ordenar directamente en el mostrador. Tus pedidos existentes
          siguen en curso.
        </p>
        <p className="mt-8 text-sm text-stone-500">
          Este menú volverá a estar disponible cuando se reanuden los pedidos
          web.
        </p>
      </div>
    );
  }

  const customizeItem = snapshot.menuItems.find((m) => m.id === customizeId);

  const cartSummary = summarizeCart(
    cart,
    snapshot.menuItems,
    snapshot.modifiers,
  );
  const estimatedTotalCents = cartSummary.totalCents;
  const cartItemCount = cartSummary.itemCount;
  const cartLines = cartSummary.lines;
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
      paymentIntent: payment,
      orderType,
    };
    const quotedTotalCents = pending ? pendingTotalCents : estimatedTotalCents;

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
            {pending?.paymentIntent === "spei" ? "Tu total es" : "Paga"}{" "}
            <strong className="tabular-nums">
              {pendingTotalCents === null
                ? "el total confirmado en mostrador"
                : `${mxn(pendingTotalCents)} MXN`}
            </strong>{" "}
            {pending?.paymentIntent === "spei"
              ? "y pagas por transferencia. En cuanto se confirme tu pedido verás los datos del banco."
              : "en el mostrador para que empecemos a cocinar."}
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
    <div className="customer-menu">
      {/* Top Customer Header */}
      <header className="menu-header">
        <div className="menu-header-inner">
          <div className="menu-brand">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width="38" height="56" />
            <span>Los Huaraches<br />de Zapata</span>
          </div>
          <div className="menu-header-actions">
            <SoundButton />
            <PWAInstallButton />
            {totalItemsCount > 0 && (
              <button
                className="menu-header-cart"
                onClick={() => setCheckout(true)}
                aria-label={`Ver mi pedido, ${totalItemsCount} ${totalItemsCount === 1 ? "artículo" : "artículos"}`}
              >
                <ShoppingBag size={18} />
                <span
                  key={totalItemsCount}
                  className={cartBumped ? "animate-bump" : ""}
                >
                  {totalItemsCount}
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="menu-hero" aria-labelledby="menu-hero-title">
        <img className="menu-hero-photo" src={huaracheHero} alt="Huarache de bistec servido en un plato de barro" fetchPriority="high" />
        <div className="menu-hero-inner">
          <h1 id="menu-hero-title">Sabor por<br className="menu-hero-break" /> tradición.</h1>
          <p>Elige tus antojitos y dinos cómo te gustan. Los preparamos para ti; paga al recoger en efectivo o por transferencia.</p>
        </div>
      </section>

      <main className="menu-content">
        <div className="menu-browse">

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

        {localError && (
          <p
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800"
          >
            {localError}
          </p>
        )}

        {/* Dining room: live table status, so people know before they pick «Comer aquí» */}
        <DiningRoom variant="banner" />

        {/* Search & Filter Toolbar */}
        <div className="menu-toolbar">
          {/* Categories bar */}
          <nav
            className="menu-categories"
            aria-label="Categorías del menú"
          >
            {categories.map((c) => {
              return (
                <button
                  key={c}
                  className="menu-category"
                  aria-pressed={c === category}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              );
            })}
          </nav>

          {/* Search Input */}
          <div className="menu-search">
            <Search
              size={20}
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Buscar antojito…"
              aria-label="Buscar antojito"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="Borrar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Menu items remain server-supplied, including owner-created dishes and live stock. */}
        {filteredItems.length === 0 ? (
          <div className="menu-no-results">
            <Utensils className="mx-auto mb-3 text-stone-400" size={32} />
            <h3 className="font-bold text-stone-800">
              No encontramos antojitos con esa búsqueda.
            </h3>
            <p className="mt-1 text-xs text-stone-500">
              Intenta con otra categoría o borra el término de búsqueda.
            </p>
          </div>
        ) : (
          <div className="menu-groups">
            {groups.map(([groupName, groupItems]) => (
              <section key={groupName} className="menu-group" aria-label={groupName}>
                <h2>
                  {groupName}
                </h2>
                <div className="menu-items">
                  {groupItems.map((item) => {
                    const available = itemAvailable(item, snapshot.modifiers);
                    const description = ownerDescription(item);

                    return (
                      <article
                        key={item.id}
                        className="menu-item"
                        data-available={available}
                      >
                        <div className="menu-item-copy">
                          <h3>{item.name}</h3>
                          {description && <p>{description}</p>}
                        </div>
                        <div className="menu-item-action">
                          <strong>{mxn(item.priceCents)}</strong>
                          <button
                            disabled={!available || Boolean(pending)}
                            aria-label={`Agregar ${item.name}`}
                            onClick={() => setCustomizeId(item.id)}
                          >
                            {available ? (
                              <>
                                <Plus size={16} aria-hidden="true" />
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
              </section>
            ))}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-stone-500">
          Precios en pesos mexicanos (MXN).
        </p>
        <p className="mt-2 text-center text-xs font-semibold text-stone-600">
          Lunes a sábado · 9:30 a.m. – 5:00 p.m. · Tel.{" "}
          <a className="inline-block py-2 underline" href="tel:+525632149403">
            56 3214 9403
          </a>
        </p>
        </div>

        <aside className="menu-order-summary" aria-label="Carrito">
          <h2>Tu pedido</h2>
          {cart.length === 0 ? (
            <div className="menu-order-empty">
              <ShoppingBag size={46} strokeWidth={1.3} aria-hidden="true" />
              <p>Agrega un antojito para empezar.</p>
            </div>
          ) : (
            <ul className="menu-order-lines">
              {cartLines.map(({ key, quantity, itemName, lineTotalCents }) => (
                <li key={key}>
                  <span>{quantity} × {itemName}</span>
                  <strong>{mxn(lineTotalCents)}</strong>
                </li>
              ))}
            </ul>
          )}
          <div className="menu-order-footer">
            <div className="menu-order-total">
              <span>Total estimado</span>
              <strong data-testid="cart-total">{mxn(estimatedTotalCents)} MXN</strong>
            </div>
            <button disabled={cart.length === 0 || Boolean(pending)} onClick={() => setCheckout(true)}>
              Ver mi pedido ({cartItemCount})
            </button>
          </div>
          <span className="sr-only" data-testid="cart-item-count">{cartItemCount} {cartItemCount === 1 ? "artículo" : "artículos"}</span>
        </aside>
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
                {mxn(estimatedTotalCents)} MXN
              </strong>
            </div>

            <button
              className="btn btn-primary flex-1 py-3 text-sm font-bold shadow-md transition-transform duration-200 active:scale-90"
              onClick={() => setCheckout(true)}
            >
              <ShoppingBag size={18} />
              <span>Ver mi pedido ({cartItemCount})</span>
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
          payment={payment}
          setPayment={setPayment}
          orderType={orderType}
          setOrderType={(next) => {
            setOrderTypeNotice("");
            setOrderType(next);
          }}
          orderTypeNotice={orderTypeNotice}
          busy={busy}
          pending={pending}
          connected={connected}
        />
      )}
    </div>
  );
}
