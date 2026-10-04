import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Pause,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import type { Order } from "../../../../shared/types/realtime";
import { useRealtime } from "../../../../shared/ui/RealtimeProvider";
import {
  chime,
  EmptyState,
  InventoryControl,
  Modal,
  mxn,
  OrderLines,
  orderLabel,
  SoundButton,
  StaffHeader,
  time,
  useTicketTimer,
} from "../../../../shared/ui/components";
export function CashTender({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const { command, connected } = useRealtime();
  const [value, setValue] = useState(""),
    [keepChange, setKeepChange] = useState(false),
    [busy, setBusy] = useState(false);
  const valid = /^\d{1,7}(?:\.\d{0,2})?$/.test(value),
    parts = value.split(".");
  const cents = valid
    ? Number(parts[0]) * 100 + Number((parts[1] || "").padEnd(2, "0"))
    : 0;
  const surplus = cents - order.totalCents;
  const tipCents = keepChange && surplus > 0 ? surplus : 0;
  const change = surplus - tipCents;
  async function pay(amount: number, tip = 0) {
    setBusy(true);
    const result = await command("pos_order_paid", {
      orderId: order.id,
      tenderedCents: amount,
      tipCents: tip,
    });
    setBusy(false);
    if (result.ok) onClose();
  }
  return (
    <Modal
      title={`Cobrar ${orderLabel(order)} · ${order.customerName}`}
      onClose={onClose}
    >
      <OrderLines order={order} />
      <div className="my-6 flex items-end justify-between border-t border-stone-200 pt-5">
        <span>Total a cobrar</span>
        <strong className="text-4xl tabular-nums">
          {mxn(order.totalCents)}
        </strong>
      </div>
      <label className="block text-sm font-semibold">
        Efectivo recibido (MXN)
        <input
          autoFocus
          className="field mt-2 text-2xl"
          inputMode="decimal"
          value={value}
          placeholder="0.00"
          disabled={busy}
          onChange={(e) => {
            setValue(e.target.value);
            setKeepChange(false);
          }}
        />
      </label>
      <div className="my-3 grid grid-cols-3 gap-2">
        {[50, 100, 500].map((preset) => (
          <button
            className="btn"
            key={preset}
            disabled={busy}
            onClick={() => {
              setValue(String(preset));
              setKeepChange(false);
            }}
          >
            {mxn(preset * 100)}
          </button>
        ))}
      </div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-stone-200 p-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={keepChange}
          disabled={busy || !valid || surplus <= 0}
          onChange={(event) => setKeepChange(event.target.checked)}
        />
        El cliente deja el cambio como propina
      </label>
      <div
        className={`my-5 rounded-xl p-4 ${change >= 0 ? "bg-emerald-50 text-emerald-900" : "bg-stone-100"}`}
      >
        <div className="flex justify-between">
          <span>{change >= 0 ? "Cambio a entregar" : "Falta por recibir"}</span>
          <strong className="text-2xl tabular-nums">
            {mxn(Math.abs(change))}
          </strong>
        </div>
        {tipCents > 0 && (
          <div className="mt-3 flex justify-between border-t border-emerald-200 pt-3">
            <span>Propina registrada</span>
            <strong>{mxn(tipCents)}</strong>
          </div>
        )}
      </div>
      <button
        className="btn btn-primary w-full"
        disabled={!connected || busy || !valid || change < 0}
        onClick={() => void pay(cents, tipCents)}
      >
        Confirmar pago
        <ArrowRight size={18} />
      </button>
      <button
        className="btn mt-3 w-full"
        disabled={!connected || busy}
        onClick={() => void pay(order.totalCents)}
      >
        Efectivo Exacto · Cobrar {mxn(order.totalCents)}
      </button>
      <p className="mt-4 text-center text-xs text-stone-500">
        Confirma solo después de recibir el efectivo.
      </p>
    </Modal>
  );
}
export function TicketCard({
  order,
  now,
  onPay,
}: {
  order: Order;
  now: number;
  onPay: () => void;
}) {
  const { command, connected } = useRealtime();
  const [noShow, setNoShow] = useState(false),
    [busy, setBusy] = useState(false);
  const minutes = Math.max(
    0,
    Math.floor((now - Date.parse(order.paidAt || order.createdAt)) / 60000),
  );
  const aging = order.status === "cooking" && minutes >= 10;
  async function advance() {
    setBusy(true);
    await command("pos_update_status", {
      orderId: order.id,
      status: order.status === "cooking" ? "ready" : "completed",
    });
    setBusy(false);
  }
  return (
    <article
      className={`rounded-xl border-2 bg-white p-4 ${aging ? "animate-pulse border-red-500" : order.status === "cooking" && minutes >= 5 ? "border-amber-400 bg-amber-50" : "border-stone-200"}`}
      aria-label={`Pedido ${orderLabel(order)} de ${order.customerName}`}
    >
      <div className="mb-4 flex justify-between gap-2">
        <div>
          <strong className="text-xl">{orderLabel(order)}</strong>
          <p className="font-semibold">{order.customerName}</p>
        </div>
        <span
          className={`flex items-start gap-1 text-xs ${aging ? "font-bold text-red-700" : "text-stone-500"}`}
        >
          <Clock3 size={14} />
          {minutes} min
        </span>
      </div>
      <OrderLines order={order} />
      <div className="mt-4 flex justify-between border-t border-dashed border-stone-200 pt-3 text-sm">
        <span className="text-stone-500">{time(order.createdAt)}</span>
        <strong>{mxn(order.totalCents)}</strong>
      </div>
      {order.status === "unpaid" ? (
        <>
          <button
            className="btn btn-primary mt-4 w-full"
            disabled={!connected || busy}
            onClick={onPay}
          >
            Cobrar en efectivo
            <ArrowRight size={16} />
          </button>
          <button
            className="btn btn-danger mt-2 w-full"
            disabled={!connected || busy}
            onClick={() => setNoShow(true)}
          >
            No-Show
          </button>
        </>
      ) : (
        <button
          className={`btn mt-4 w-full ${order.status === "ready" ? "border-emerald-800 bg-emerald-800 text-white hover:bg-emerald-900" : "btn-primary"}`}
          disabled={!connected || busy}
          onClick={() => void advance()}
        >
          <Check size={17} />
          {order.status === "cooking" ? "Marcar lista" : "Entregado"}
        </button>
      )}
      {noShow && (
        <Modal title="¿Marcar como No-Show?" onClose={() => setNoShow(false)}>
          <p className="mb-5">
            Se quitará {orderLabel(order)} de la fila. El historial conservará
            el pedido como No-Show, sin ingreso de efectivo.
          </p>
          <div className="flex gap-3">
            <button className="btn flex-1" onClick={() => setNoShow(false)}>
              Volver
            </button>
            <button
              className="btn btn-danger flex-1"
              disabled={!connected || busy}
              onClick={async () => {
                setBusy(true);
                const reply = await command("pos_mark_noshow", {
                  orderId: order.id,
                });
                setBusy(false);
                if (reply.ok) setNoShow(false);
              }}
            >
              Confirmar No-Show
            </button>
          </div>
        </Modal>
      )}
    </article>
  );
}
export function LiveOrders() {
  const { snapshot, connected, command } = useRealtime();
  const [inventory, setInventory] = useState(false),
    [payId, setPayId] = useState<string | null>(null),
    [pausing, setPausing] = useState(false);
  const previous = useRef<Set<string> | null>(null);
  const now = useTicketTimer();
  useEffect(() => {
    if (!snapshot) return;
    const next = new Set(
      snapshot.activeOrders
        .filter((o) => o.status === "unpaid")
        .map((o) => o.id),
    );
    if (previous.current && [...next].some((id) => !previous.current!.has(id)))
      chime();
    previous.current = next;
  }, [snapshot]);
  if (!snapshot) return null;
  const payOrder = snapshot.activeOrders.find(
    (o) => o.id === payId && o.status === "unpaid",
  );
  const lanes = [
    {
      status: "unpaid",
      title: "Por Pagar",
      note: "Recibe el efectivo para empezar.",
      color: "bg-stone-500",
    },
    {
      status: "cooking",
      title: "Cocinando",
      note: "Pagados. Manos a la masa.",
      color: "bg-clay-600",
    },
    {
      status: "ready",
      title: "Lista",
      note: "Todo listo para entregar.",
      color: "bg-emerald-700",
    },
  ];
  return (
    <>
      <StaffHeader page="pos">
        <button className="btn" onClick={() => setInventory(true)}>
          <SlidersHorizontal size={16} />
          Inventario
        </button>
        <button
          role="switch"
          aria-checked={!snapshot.acceptingOrders}
          className={`btn ${snapshot.acceptingOrders ? "" : "btn-danger"}`}
          disabled={!connected || pausing}
          onClick={async () => {
            setPausing(true);
            await command("pos_toggle_accepting_orders", {
              acceptingOrders: !snapshot.acceptingOrders,
            });
            setPausing(false);
          }}
        >
          {snapshot.acceptingOrders ? <Pause size={16} /> : <Play size={16} />}
          Pausar Pedidos Web
        </button>
      </StaffHeader>
      <main className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow mb-2">Un buen turno empieza aquí</p>
            <h1 className="display text-4xl lg:text-5xl">
              Al ritmo del comal.
            </h1>
            <p className="mt-3 text-stone-600">
              {snapshot.activeOrders.length} pedidos en fila · Solo efectivo,
              siempre al mostrador.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SoundButton />
          </div>
        </div>
        {!snapshot.acceptingOrders && (
          <div className="mb-5 rounded-xl bg-amber-100 p-4 font-semibold text-amber-950">
            Pedidos web pausados. Los pedidos existentes siguen en cocina.
          </div>
        )}
        <div className="grid items-start gap-5 md:grid-cols-3">
          {lanes.map((lane) => {
            const orders = snapshot.activeOrders.filter(
              (o) => o.status === lane.status,
            );
            return (
              <section
                key={lane.status}
                className="min-w-0 rounded-2xl bg-stone-100 p-3"
                aria-label={lane.title}
              >
                <header className="px-2 pb-5 pt-2">
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${lane.color}`}
                      />
                      {lane.title}
                    </h2>
                    <span className="rounded-md bg-white px-2.5 py-1 text-sm font-bold">
                      {orders.length}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-stone-500">{lane.note}</p>
                </header>
                <div className="space-y-3">
                  {orders.map((order) => (
                    <TicketCard
                      key={order.id}
                      order={order}
                      now={now}
                      onPay={() => setPayId(order.id)}
                    />
                  ))}
                  {!orders.length && (
                    <EmptyState>
                      Sin pedidos {lane.title.toLowerCase()}
                    </EmptyState>
                  )}
                </div>
              </section>
            );
          })}
        </div>
        <footer className="mt-8 flex flex-wrap justify-between gap-3 text-xs text-stone-500">
          <span>Hecho con masa. Servido con cuidado.</span>
          <span>
            Venta del turno: {mxn(snapshot.salesMetrics?.revenueCents || 0)} MXN
          </span>
        </footer>
      </main>
      {inventory && <InventoryControl onClose={() => setInventory(false)} />}{" "}
      {payOrder && (
        <CashTender order={payOrder} onClose={() => setPayId(null)} />
      )}
    </>
  );
}
