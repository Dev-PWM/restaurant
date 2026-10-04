import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChefHat,
  Plus,
  ShoppingBag,
  Trash2,
  Utensils,
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
  Modal,
  mxn,
  Quantity,
} from "../../../../shared/ui/components";
import { OrderStatus } from "./OrderStatus";
export const activeKey = "masaflow.v3.orderId",
  pendingKey = "masaflow.v3.pending";
type CartLine = OrderInput["items"][number];
export function itemAvailable(
  item: MenuItem,
  modifiers: { id: string; kind: string; available: boolean }[],
) {
  const masas = modifiers.filter(
    (m) => item.modifierIds.includes(m.id) && m.kind === "masa",
  );
  return item.available && (!masas.length || masas.some((m) => m.available));
}
function Customize({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const { snapshot } = useRealtime();
  const modifiers = snapshot!.modifiers.filter((m) =>
    item.modifierIds.includes(m.id),
  );
  const [selected, setSelected] = useState<string[]>(() => {
    const first = modifiers.find((m) => m.kind === "masa" && m.available);
    return first ? [first.id] : [];
  });
  const [quantity, setQuantity] = useState(1);
  const hasMasa = modifiers.some((m) => m.kind === "masa"),
    valid =
      itemAvailable(item, modifiers) &&
      selected.every((id) => modifiers.find((m) => m.id === id)?.available) &&
      (!hasMasa ||
        selected.some(
          (id) => modifiers.find((m) => m.id === id)?.kind === "masa",
        ));
  const price =
    item.priceCents +
    modifiers
      .filter((m) => selected.includes(m.id))
      .reduce((sum, m) => sum + m.priceCents, 0);
  return (
    <Modal title={item.name} onClose={onClose}>
      <p className="mb-5 text-stone-600">{item.description}</p>
      {(["masa", "extra", "omit"] as const).map(
        (kind) =>
          modifiers.some((m) => m.kind === kind) && (
            <fieldset key={kind} className="mb-6">
              <legend className="mb-2 text-sm font-bold">
                {kind === "masa"
                  ? "Elige tu masa · 1 opción"
                  : kind === "extra"
                    ? "Algo extra"
                    : "Lo prefiero sin…"}
              </legend>
              {modifiers
                .filter((m) => m.kind === kind)
                .map((m) => (
                  <label
                    key={m.id}
                    className={`my-2 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 ${selected.includes(m.id) ? "border-clay-600 bg-clay-50" : "border-stone-200"} ${!m.available ? "opacity-50" : ""}`}
                  >
                    <input
                      type={kind === "masa" ? "radio" : "checkbox"}
                      name="masa"
                      checked={selected.includes(m.id)}
                      disabled={!m.available}
                      onChange={() =>
                        setSelected((previous) =>
                          kind === "masa"
                            ? [
                                ...previous.filter(
                                  (id) =>
                                    modifiers.find((v) => v.id === id)?.kind !==
                                    "masa",
                                ),
                                m.id,
                              ]
                            : previous.includes(m.id)
                              ? previous.filter((id) => id !== m.id)
                              : [...previous, m.id],
                        )
                      }
                    />
                    <span className="flex-1">{m.name}</span>
                    <span className="text-sm">
                      {!m.available
                        ? "Agotado"
                        : m.priceCents
                          ? `+${mxn(m.priceCents)}`
                          : "Incluido"}
                    </span>
                  </label>
                ))}
            </fieldset>
          ),
      )}
      <div className="mb-5 flex items-center justify-between">
        <span className="font-semibold">Cantidad</span>
        <Quantity value={quantity} onChange={setQuantity} />
      </div>
      <button
        className="btn btn-primary w-full"
        disabled={!valid}
        onClick={() => {
          onAdd({ menuItemId: item.id, quantity, modifierIds: selected });
          onClose();
        }}
      >
        Agregar al carrito · {mxn(price * quantity)}
      </button>
    </Modal>
  );
}
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
  const [cart, setCart] = useState<CartLine[]>([]),
    [customizeId, setCustomizeId] = useState<string | null>(null),
    [checkout, setCheckout] = useState(false),
    [name, setName] = useState(""),
    [category, setCategory] = useState("Todo");
  const [activeId, setActiveId] = useState(() => readStorage(activeKey)),
    [pending, setPending] = useState(restoredPending),
    [busy, setBusy] = useState(false),
    [localError, setLocalError] = useState("");
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
      setCart([]);
    }
  }, [order?.id]);
  if (!snapshot)
    return (
      <div className="p-10 text-center">
        <Brand />
        <p className="mt-8">Conectando con el comal…</p>
      </div>
    );
  if (order)
    return (
      <OrderStatus
        order={order}
        onNewOrder={() => {
          setActiveId(null);
          setPending(null);
          setCheckout(false);
          setCart([]);
          writeStorage(activeKey, null);
          writeStorage(pendingKey, null);
        }}
      />
    );
  if (activeId)
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <Brand />
        <h1 className="display mt-10 text-3xl">
          Tu pedido está en el historial.
        </h1>
        <p className="my-5">
          El turno pudo haber cerrado. Consulta al mostrador con tu referencia
          antes de volver a pedir.
        </p>
        <p className="break-all font-mono text-xs">{activeId}</p>
        <button
          className="btn mt-6"
          disabled={!connected}
          onClick={() => setActiveId(null)}
        >
          Volver al menú
        </button>
      </div>
    );
  if (!snapshot.acceptingOrders)
    return (
      <div className="mx-auto flex min-h-[90dvh] max-w-lg flex-col items-center justify-center p-8 text-center">
        <Brand />
        <ChefHat className="my-8 text-clay-600" size={64} />
        <h1 className="display text-4xl">La cocina está a tope.</h1>
        <p className="mt-5 text-xl text-stone-600">
          Por favor, ordena directamente en el mostrador.
        </p>
        <p className="mt-8 text-sm text-stone-500">
          Gracias por tu paciencia. Este menú volverá automáticamente.
        </p>
      </div>
    );
  const customize = snapshot.menuItems.find((m) => m.id === customizeId);
  const price = (line: CartLine) =>
    (snapshot.menuItems.find((m) => m.id === line.menuItemId)?.priceCents ||
      0) +
    line.modifierIds.reduce(
      (sum, id) =>
        sum + (snapshot.modifiers.find((m) => m.id === id)?.priceCents || 0),
      0,
    );
  const validCart =
    cart.length > 0 &&
    cart.every((line) => {
      const item = snapshot.menuItems.find((m) => m.id === line.menuItemId);
      return (
        item &&
        itemAvailable(item, snapshot.modifiers) &&
        line.modifierIds.every(
          (id) => snapshot.modifiers.find((m) => m.id === id)?.available,
        )
      );
    });
  const total = cart.reduce(
    (sum, line) => sum + price(line) * line.quantity,
    0,
  );
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
    if (!writeStorage(pendingKey, JSON.stringify(request))) {
      setLocalError(
        "Activa el almacenamiento del navegador para conservar tu pedido.",
      );
      setBusy(false);
      return;
    }
    setPending(request);
    const reply = await command("submit_client_order", request);
    if (reply.ok) {
      setActiveId(reply.orderId || request.orderId);
      setCart([]);
      setCheckout(false);
      writeStorage(activeKey, reply.orderId || request.orderId);
      writeStorage(pendingKey, null);
      setPending(null);
    } else if (!["ACK_TIMEOUT", "OFFLINE"].includes(reply.code)) {
      setPending(null);
      writeStorage(pendingKey, null);
      setLocalError(reply.error);
    }
    setBusy(false);
  }
  return (
    <>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5">
          <Brand />
          <span className="text-xs font-semibold text-stone-500">
            HECHO AL MOMENTO
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-36 pt-9 md:pt-14">
        <div className="mb-9 grid items-end gap-7 md:grid-cols-[1.5fr_1fr]">
          <div>
            <p className="eyebrow mb-3 text-clay-700">Del comal a tu mesa</p>
            <h1 className="display max-w-xl text-5xl leading-[1.08] md:text-6xl">
              Hecho con masa.
              <br />
              Servido con cariño.
            </h1>
            <p className="mt-5 max-w-lg text-stone-600">
              Tus antojitos de siempre, recién hechos. Elige, personaliza y paga
              al llegar al mostrador.
            </p>
          </div>
          <div className="rounded-2xl bg-clay-50 p-5">
            <div className="mb-2 flex items-center gap-2 font-bold text-clay-700">
              <Utensils size={18} />
              Aquí cocinamos después de cobrar.
            </div>
            <p className="text-sm leading-relaxed text-stone-700">
              Sin pagos en línea. Paga en efectivo en el mostrador para empezar
              a cocinar.
            </p>
            <p className="mt-2 text-xs text-stone-600">
              No online payments. Pay in cash at the counter to start cooking.
            </p>
          </div>
        </div>
        {pending && (
          <div role="alert" className="mb-6 rounded-xl bg-amber-100 p-5">
            <p className="font-bold">
              {pendingExpired
                ? "El turno anterior cerró."
                : "Tu envío necesita confirmación."}
            </p>
            <p className="my-2 text-sm">
              {pendingExpired
                ? "Consulta al mostrador antes de enviar un pedido nuevo."
                : "Puedes reintentar con la misma referencia sin duplicar tu pedido."}
            </p>
            <button
              className="btn"
              disabled={!connected || busy}
              onClick={() =>
                pendingExpired
                  ? (setPending(null), writeStorage(pendingKey, null))
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
            className="mb-4 rounded-xl bg-red-50 p-4 text-red-800"
          >
            {localError}
          </p>
        )}
        <nav className="mb-7 flex flex-wrap gap-2" aria-label="Categorías">
          {["Todo", ...new Set(snapshot.menuItems.map((m) => m.category))].map(
            (c) => (
              <button
                key={c}
                className={`btn rounded-full ${c === category ? "border-stone-900 bg-stone-900 text-white hover:bg-stone-800" : ""}`}
                aria-pressed={c === category}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ),
          )}
        </nav>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.menuItems
            .filter((m) => category === "Todo" || m.category === category)
            .map((item, index) => {
              const available = itemAvailable(item, snapshot.modifiers);
              return (
                <article
                  key={item.id}
                  className={`panel flex flex-col ${!available ? "bg-stone-100 opacity-60" : ""}`}
                >
                  <div className="mb-5 flex items-center justify-between">
                    <span className="eyebrow">{item.category}</span>
                    <span className="display text-3xl text-clay-600">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h2 className="display text-3xl">{item.name}</h2>
                  <p className="mb-6 mt-3 flex-1 text-sm leading-relaxed text-stone-600">
                    {item.description}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-xl tabular-nums">
                      {mxn(item.priceCents)}
                    </strong>
                    <button
                      className="btn"
                      disabled={!available || Boolean(pending)}
                      aria-label={`Agregar ${item.name}`}
                      onClick={() => setCustomizeId(item.id)}
                    >
                      {available ? (
                        <>
                          <Plus size={17} />
                          Agregar
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
        <p className="mt-8 text-xs text-stone-500">
          Precios finales en pesos mexicanos (MXN). Disponibilidad actualizada
          en vivo.
        </p>
      </main>
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white p-4">
          <button
            className="btn btn-primary mx-auto flex w-full max-w-xl justify-between"
            onClick={() => setCheckout(true)}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag size={18} />
              {cart.reduce((sum, line) => sum + line.quantity, 0)} · Ver mi
              pedido
            </span>
            <span>
              {mxn(total)} <ArrowRight className="ml-2 inline" size={16} />
            </span>
          </button>
        </div>
      )}
      {customize && (
        <Customize
          item={customize}
          onClose={() => setCustomizeId(null)}
          onAdd={(line) => setCart((previous) => [...previous, line])}
        />
      )}{" "}
      {checkout && (
        <Modal title="Tu pedido" onClose={() => setCheckout(false)}>
          <div className="space-y-4">
            {cart.map((line, i) => (
              <div key={i} className="border-b border-stone-200 pb-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <strong>
                      {line.quantity} ×{" "}
                      {
                        snapshot.menuItems.find((m) => m.id === line.menuItemId)
                          ?.name
                      }
                    </strong>
                    <p className="mt-1 text-xs text-stone-500">
                      {line.modifierIds
                        .map(
                          (id) =>
                            snapshot.modifiers.find((m) => m.id === id)?.name,
                        )
                        .join(" · ")}
                    </p>
                  </div>
                  <button
                    className="btn"
                    disabled={busy || Boolean(pending)}
                    aria-label={`Quitar platillo ${i + 1}`}
                    onClick={() =>
                      setCart((previous) =>
                        previous.filter((_, index) => i !== index),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <p className="mt-2 font-semibold">
                  {mxn(price(line) * line.quantity)}
                </p>
              </div>
            ))}
          </div>
          <div className="my-5 flex justify-between text-xl font-bold">
            <span>Total</span>
            <span>{mxn(total)} MXN</span>
          </div>
          <label className="block text-sm font-semibold">
            Tu nombre
            <input
              className="field mb-5 mt-2"
              autoComplete="given-name"
              maxLength={60}
              value={name}
              disabled={busy || Boolean(pending)}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {!validCart && (
            <p role="alert" className="mb-4 text-sm text-red-700">
              Un producto está agotado o tu carrito está vacío. Revisa tu
              pedido.
            </p>
          )}
          <p className="mb-5 rounded-xl bg-clay-50 p-4 text-sm">
            Paga en efectivo al llegar al mostrador. Empezaremos a cocinar
            cuando recibamos tu pago.
          </p>
          <button
            className="btn btn-primary w-full"
            disabled={
              !connected || busy || (!pending && (!validCart || !name.trim()))
            }
            onClick={() => void submit()}
          >
            {busy
              ? "Enviando…"
              : pending
                ? "Verificar y reintentar"
                : "Enviar pedido"}
            <ArrowRight size={18} />
          </button>
        </Modal>
      )}
    </>
  );
}
