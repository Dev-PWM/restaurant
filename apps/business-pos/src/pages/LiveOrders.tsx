import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Boxes,
  Check,
  ChefHat,
  Clock3,
  Flame,
  History,
  LayoutGrid,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Table,
} from "lucide-react";
import type { Order } from "../../../../shared/types/realtime";
import { useRealtime } from "../../../../shared/ui/RealtimeProvider";
import { BatchingView } from "./BatchingView";
import {
  chime,
  EmptyState,
  enableAudio,
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
      title={`Cobrar al entregar ${orderLabel(order)} · ${order.customerName}`}
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
          className="field mt-2 text-2xl tabular-nums"
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
      <div className="my-4 grid grid-cols-2 gap-3">
        {[100, 200, 500].map((preset) => (
          <button
            className="btn min-h-16 text-xl tabular-nums"
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
        <button
          className="btn min-h-16 text-lg tabular-nums"
          disabled={busy}
          onClick={() => {
            setValue((order.totalCents / 100).toFixed(2));
            setKeepChange(false);
          }}
        >
          Exacto · {mxn(order.totalCents)}
        </button>
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
        Confirmar pago y entregar
        <ArrowRight size={18} />
      </button>
      <button
        className="btn mt-3 w-full"
        disabled={!connected || busy}
        onClick={() => void pay(order.totalCents)}
      >
        Efectivo exacto · Cobrar y entregar {mxn(order.totalCents)}
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
  const isCooking = order.status === "cooking";
  const isReview = order.status === "review";
  const tracksElapsedTime = isReview || isCooking;
  const startTime = Date.parse(
    isCooking ? order.acceptedAt || order.createdAt : order.createdAt,
  );
  const elapsedSeconds = tracksElapsedTime
    ? Math.max(0, Math.floor((now - startTime) / 1000))
    : 0;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedTimer = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const aging =
    (isReview && elapsedSeconds > 180) ||
    (isCooking && elapsedSeconds > 900);
  const isWarning =
    (isCooking && minutes >= 5) || (isReview && minutes >= 2);
  const agingLimitSeconds = isReview ? 180 : 900;
  const progressPercent = Math.min(
    100,
    Math.max(4, Math.round((elapsedSeconds / agingLimitSeconds) * 100)),
  );
  async function advance() {
    setBusy(true);
    await command("pos_update_status", {
      orderId: order.id,
      status: order.status === "review" ? "cooking" : "ready",
    });
    setBusy(false);
  }
  return (
    <article
      data-order-id={order.id}
      className={`overflow-hidden rounded-xl border-2 bg-white shadow-xs transition-colors ${
        aging
          ? "animate-pulse border-red-500 bg-red-50/40"
          : order.status === "cooking" && minutes >= 5
            ? "border-amber-400 bg-amber-50"
            : order.status === "review" && minutes >= 8
              ? "border-amber-300"
              : "border-stone-200"
      }`}
      aria-label={`Pedido ${orderLabel(order)} de ${order.customerName}`}
    >
      {tracksElapsedTime && (
        <div
          className="h-1.5 w-full bg-stone-100"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Tiempo de espera: ${minutes} minutos`}
        >
          <div
            className={`h-full transition-all duration-220 ease-linear ${
              aging
                ? "bg-red-500 animate-pulse"
                : isWarning
                  ? "bg-amber-400"
                  : "bg-clay-600"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
      <div className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <strong className="text-xl tracking-tight">{orderLabel(order)}</strong>
            <p className="font-semibold text-stone-900">{order.customerName}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {tracksElapsedTime && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono font-bold tabular-nums shadow-xs ${
                  aging
                    ? "border-red-400 bg-red-100 text-red-800 ring-2 ring-red-400/40"
                    : isWarning
                      ? "border-amber-300 bg-amber-100 text-amber-900"
                      : "border-stone-200 bg-stone-100 text-stone-700"
                }`}
                title={`Tiempo transcurrido: ${minutes} min ${seconds} s`}
                aria-label={`Tiempo transcurrido: ${minutes} minutos con ${seconds} segundos`}
              >
                <Clock3
                  size={13}
                  className={`shrink-0 ${
                    aging
                      ? "text-red-600 animate-bounce"
                      : isWarning
                        ? "text-amber-600"
                        : "text-stone-500"
                  }`}
                />
                {formattedTimer}
              </span>
            )}
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                aging
                  ? "font-bold text-red-700"
                  : isWarning
                    ? "font-bold text-amber-800"
                    : "text-stone-400"
              }`}
            >
              {aging
                ? "Demorado"
                : isWarning
                  ? "Atención"
                  : order.status === "review"
                      ? "En revisión"
                    : order.status === "cooking"
                      ? "Cocinando"
                        : "Lista para recoger"}
            </span>
          </div>
        </div>
        <OrderLines order={order} />
        <div className="mt-4 flex items-center justify-between border-t border-dashed border-stone-200 pt-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-stone-500">{time(order.createdAt)}</span>
          </div>
          <strong>{mxn(order.totalCents)}</strong>
        </div>
        {order.status === "review" ? (
          <>
            <button
              className="btn btn-primary mt-4 w-full"
              disabled={!connected || busy}
              onClick={() => void advance()}
            >
              <Check size={17} />
              Aceptar y empezar a cocinar
            </button>
            <button
              className="btn btn-danger mt-2 w-full"
              disabled={!connected || busy}
              onClick={() => setNoShow(true)}
            >
              Anular pedido / No-Show
            </button>
          </>
        ) : order.status === "ready" ? (
          <>
            <button
              className="btn mt-4 w-full border-emerald-800 bg-emerald-800 text-white hover:bg-emerald-900"
              disabled={!connected || busy}
              onClick={onPay}
            >
              Cobrar al entregar
              <ArrowRight size={16} />
            </button>
            <button
              className="btn btn-danger mt-2 w-full"
              disabled={!connected || busy}
              onClick={() => setNoShow(true)}
            >
              Anular pedido / No-Show
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary mt-4 w-full"
            disabled={!connected || busy}
            onClick={() => void advance()}
          >
            <Check size={17} />
            Marcar lista para recoger
          </button>
        )}
        {noShow && (
          <Modal
            title="¿Anular pedido / marcar No-Show?"
            onClose={() => setNoShow(false)}
          >
            <p className="mb-5">
              Se quitará {orderLabel(order)} de la fila. El historial conservará
              sus platillos y cantidades como No-Show; no se registrará ningún
              ingreso de efectivo.
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
      </div>
    </article>
  );
}

function TicketSkeleton() {
  return (
    <div
      className="panel animate-pulse space-y-4"
      aria-hidden="true"
    >
      <div className="flex justify-between gap-3">
        <div className="h-6 w-20 rounded bg-stone-200" />
        <div className="h-6 w-14 rounded bg-stone-200" />
      </div>
      <div className="h-4 w-2/3 rounded bg-stone-200" />
      <div className="h-3 w-full rounded bg-stone-200" />
      <div className="h-3 w-4/5 rounded bg-stone-200" />
      <div className="h-10 w-full rounded-xl bg-stone-200" />
    </div>
  );
}

export function CompletedOrdersSection({ orders }: { orders: Order[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "completed" | "no_show">("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const completedList = useMemo(() => {
    return orders
      .filter((o) => {
        if (filter !== "all" && o.status !== filter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          o.customerName.toLowerCase().includes(q) ||
          orderLabel(o).toLowerCase().includes(q) ||
          o.items.some((i) => i.name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const timeA = a.completedAt || a.transaction?.paidAt || a.createdAt;
        const timeB = b.completedAt || b.transaction?.paidAt || b.createdAt;
        return timeB.localeCompare(timeA);
      });
  }, [orders, search, filter]);

  const totalFulfilled = orders.filter((o) => o.status === "completed").length;
  const totalRevenueCents = orders
    .filter((o) => o.status === "completed" && o.transaction)
    .reduce((sum, o) => sum + (o.transaction?.totalCents || 0), 0);
  const averageTicketCents =
    totalFulfilled > 0 ? Math.round(totalRevenueCents / totalFulfilled) : 0;

  return (
    <section aria-label="Historial y auditoría de pedidos completados">
      {/* Audit Banner */}
      <div className="mb-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-800">
                <Check size={14} />
              </span>
              <h2 className="text-base font-bold text-stone-900">
                Auditoría de Servicio en Vivo
              </h2>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Verifica el historial de comandas entregadas, montos cobrados y tiempos originales de este turno sin necesidad de cerrar turno.
            </p>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1">
            <button
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                viewMode === "cards"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-900"
              }`}
              onClick={() => setViewMode("cards")}
              title="Vista en tarjetas"
            >
              <LayoutGrid size={14} />
              <span>Tarjetas</span>
            </button>
            <button
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                viewMode === "table"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-900"
              }`}
              onClick={() => setViewMode("table")}
              title="Vista en tabla de auditoría"
            >
              <Table size={14} />
              <span>Tabla de Auditoría</span>
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="block text-xs text-stone-500">
                Total entregados
              </span>
              <strong className="text-xl font-bold text-stone-900">
                {totalFulfilled} pedidos
              </strong>
            </div>
            <div className="hidden h-8 w-px bg-stone-200 sm:block" />
            <div>
              <span className="block text-xs text-stone-500">
                Ventas verificadas
              </span>
              <strong className="text-xl font-bold text-emerald-800 tabular-nums">
                {mxn(totalRevenueCents)} MXN
              </strong>
            </div>
            <div className="hidden h-8 w-px bg-stone-200 sm:block" />
            <div>
              <span className="block text-xs text-stone-500">
                Ticket promedio
              </span>
              <strong className="text-xl font-bold text-stone-800 tabular-nums">
                {mxn(averageTicketCents)} MXN
              </strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="search"
                placeholder="Buscar cliente o #pedido…"
                className="field w-56 pl-9 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="field w-auto text-sm"
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as "all" | "completed" | "no_show")
              }
            >
              <option value="all">Todos los completados</option>
              <option value="completed">Solo Entregados</option>
              <option value="no_show">Solo No-Show</option>
            </select>
          </div>
        </div>
      </div>

      {completedList.length === 0 ? (
        <EmptyState>
          {orders.length === 0
            ? "Aún no se han completado pedidos en este turno. Cuando marques un pedido como 'Entregado', aparecerá aquí para auditoría."
            : "No se encontraron pedidos con ese criterio de búsqueda."}
        </EmptyState>
      ) : viewMode === "table" ? (
        /* Tabular Audit View */
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-xs">
          <table className="w-full text-left text-xs text-stone-700">
            <thead className="border-b border-stone-200 bg-stone-50 text-[11px] font-bold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3.5">Ticket</th>
                <th className="px-4 py-3.5">Cliente</th>
                <th className="px-4 py-3.5">Hora Original (Creado)</th>
                <th className="px-4 py-3.5">Hora Entregado</th>
                <th className="px-4 py-3.5">Duración Servicio</th>
                <th className="px-4 py-3.5">Platillos</th>
                <th className="px-4 py-3.5 text-right">Total Cobrado</th>
                <th className="px-4 py-3.5">Detalle Efectivo</th>
                <th className="px-4 py-3.5 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium">
              {completedList.map((order) => {
                const isNoShow = order.status === "no_show";
                const prepMinutes =
                  order.completedAt && order.paidAt
                    ? Math.max(
                        1,
                        Math.round(
                          (new Date(order.completedAt).getTime() -
                            new Date(order.paidAt).getTime()) /
                            60000,
                        ),
                      )
                    : null;

                return (
                  <tr key={order.id} className="hover:bg-stone-50/70">
                    <td className="px-4 py-3">
                      <strong className="text-sm font-bold text-clay-700">
                        {orderLabel(order)}
                      </strong>
                    </td>
                    <td className="px-4 py-3 font-semibold text-stone-900">
                      {order.customerName}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-stone-600">
                      <span className="font-bold text-stone-800">
                        {time(order.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-stone-600">
                      {order.completedAt ? time(order.completedAt) : "--"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-emerald-800">
                      {prepMinutes !== null ? `~${prepMinutes} min` : "--"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="line-clamp-2 text-stone-600">
                        {order.items
                          .map((i) => `${i.quantity}× ${i.name}`)
                          .join(", ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-stone-900">
                      {mxn(order.totalCents)}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-stone-500">
                      {order.transaction ? (
                        <span>
                          Recibido: {mxn(order.transaction.tenderedCents)} · Cambio:{" "}
                          {mxn(order.transaction.changeCents)}
                        </span>
                      ) : (
                        "--"
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                          isNoShow
                            ? "bg-stone-100 text-stone-600"
                            : "bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {isNoShow ? "No-Show" : "Entregado"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Card Audit View */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {completedList.map((order) => {
            const isNoShow = order.status === "no_show";
            const prepMinutes =
              order.completedAt && order.paidAt
                ? Math.max(
                    1,
                    Math.round(
                      (new Date(order.completedAt).getTime() -
                        new Date(order.paidAt).getTime()) /
                        60000,
                    ),
                  )
                : null;

            return (
              <article
                key={order.id}
                className="panel flex flex-col justify-between border-stone-200 bg-white"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="display text-2xl font-bold">
                        {orderLabel(order)}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                          isNoShow
                            ? "bg-stone-100 text-stone-600"
                            : "bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {isNoShow ? "No-Show" : "Entregado"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs">
                    <strong className="text-sm text-stone-900">
                      {order.customerName}
                    </strong>
                    <span className="font-bold text-stone-900 tabular-nums">
                      {mxn(order.totalCents)}
                    </span>
                  </div>

                  {/* Audit Timestamps */}
                  <div className="mt-2.5 rounded-lg bg-stone-50 p-2.5 border border-stone-100 space-y-1 text-[11px] text-stone-600">
                    <div className="flex justify-between">
                      <span className="text-stone-500">Hora original (Creado):</span>
                      <strong className="font-mono text-stone-800">
                        {time(order.createdAt)}
                      </strong>
                    </div>
                    {order.paidAt && (
                      <div className="flex justify-between">
                        <span className="text-stone-500">Hora cobrado (Caja):</span>
                        <strong className="font-mono text-stone-800">
                          {time(order.paidAt)}
                        </strong>
                      </div>
                    )}
                    {order.completedAt && (
                      <div className="flex justify-between">
                        <span className="text-stone-500">Hora entregado:</span>
                        <strong className="font-mono text-stone-800">
                          {time(order.completedAt)}
                        </strong>
                      </div>
                    )}
                    {prepMinutes !== null && (
                      <div className="flex justify-between pt-1 border-t border-stone-200/60 text-emerald-800 font-semibold">
                        <span>Tiempo de preparación:</span>
                        <span>~{prepMinutes} min</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 border-t border-dashed border-stone-100 pt-2">
                    <OrderLines order={order} />
                  </div>
                </div>

                <div className="mt-4 border-t border-stone-100 pt-3">
                  <div className="flex justify-between text-sm font-bold">
                    <span>Total de la orden</span>
                    <span className="tabular-nums">
                      {mxn(order.totalCents)}
                    </span>
                  </div>
                  {order.transaction && (
                    <p className="mt-1 text-xs text-stone-500">
                      Efectivo recibido: {mxn(order.transaction.tenderedCents)} · Cambio:{" "}
                      {mxn(order.transaction.changeCents)}
                      {order.transaction.tipCents > 0 && (
                        <> · Propina: {mxn(order.transaction.tipCents)}</>
                      )}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function LiveOrders() {
  const { snapshot, connected, command } = useRealtime();
  const [inventory, setInventory] = useState(false),
    [payId, setPayId] = useState<string | null>(null),
    [pausing, setPausing] = useState(false),
    [kitchenOnly, setKitchenOnly] = useState(false),
    [showComalDetails, setShowComalDetails] = useState(false),
    [activeTab, setActiveTab] = useState<
      "queue" | "batching" | "completed"
    >("queue"),
    [activeLane, setActiveLane] = useState<"review" | "cooking" | "ready">(
      "review",
    );
  const previousActive = useRef<Set<string> | null>(null);
  const previousCooking = useRef<Set<string> | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const previousTicketPositions = useRef(
    new Map<string, { left: number; top: number }>(),
  );
  const now = useTicketTimer();
  const layoutKey =
    snapshot?.activeOrders.map((order) => `${order.id}:${order.status}`).join("|") ??
    "";

  useEffect(() => {
    const unlock = () => {
      enableAudio();
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const currentActive = new Set(snapshot.activeOrders.map((o) => o.id));
    const currentCooking = new Set(
      snapshot.activeOrders
        .filter((o) => o.status === "cooking")
        .map((o) => o.id),
    );

    if (previousActive.current !== null) {
      const hasNewCooking = [...currentCooking].some(
        (id) => !previousCooking.current?.has(id),
      );
      const hasNewOrder = [...currentActive].some(
        (id) => !previousActive.current?.has(id),
      );

      if (hasNewCooking) {
        chime("kitchen");
      } else if (hasNewOrder) {
        chime("new");
      }
    }

    previousActive.current = currentActive;
    previousCooking.current = currentCooking;
  }, [snapshot]);
  const cookingOrders =
    snapshot?.activeOrders.filter((o) => o.status === "cooking") ?? [];

  const comalSummary = useMemo(() => {
    const itemMap = new Map<
      string,
      { name: string; total: number; masas: Record<string, number> }
    >();
    let totalPieces = 0;
    for (const order of cookingOrders) {
      for (const line of order.items) {
        totalPieces += line.quantity;
        const entry = itemMap.get(line.name) || {
          name: line.name,
          total: 0,
          masas: {},
        };
        entry.total += line.quantity;
        const masaMod = line.modifiers.find((m) => m.kind === "masa");
        const masaName = masaMod ? masaMod.name : "Estándar";
        entry.masas[masaName] = (entry.masas[masaName] || 0) + line.quantity;
        itemMap.set(line.name, entry);
      }
    }
    return {
      items: Array.from(itemMap.values()),
      totalPieces,
    };
  }, [cookingOrders]);
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const positions = new Map<string, { left: number; top: number }>();
    for (const card of board.querySelectorAll<HTMLElement>("[data-order-id]")) {
      if (!card.getClientRects().length) continue;
      const id = card.dataset.orderId;
      if (!id) continue;
      const rect = card.getBoundingClientRect();
      const next = { left: rect.left, top: rect.top };
      const previous = previousTicketPositions.current.get(id);
      if (!reducedMotion && typeof card.animate === "function") {
        if (previous) {
          const x = previous.left - next.left;
          const y = previous.top - next.top;
          if (x || y) {
            card.animate(
              [
                { transform: `translate(${x}px, ${y}px)` },
                { transform: "translate(0, 0)" },
              ],
              { duration: 220, easing: "ease-out" },
            );
          }
        } else {
          card.animate(
            [
              { opacity: 0.7, transform: "translateY(8px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 220, easing: "ease-out" },
          );
        }
      }
      positions.set(id, next);
    }
    previousTicketPositions.current = positions;
  }, [layoutKey]);
  if (!snapshot) {
    return (
      <main
        className="mx-auto max-w-[1600px] px-5 py-8"
        role="status"
        aria-label="Conectando con la cocina"
        aria-busy="true"
      >
        <h1 className="display mb-6 text-3xl">Conectando con la cocina…</h1>
        <div className="grid gap-5 md:grid-cols-3">
          {["En revisión", "Cocinando", "Lista para recoger"].map((lane) => (
            <section key={lane} className="space-y-3 rounded-2xl bg-stone-100 p-3">
              <h2 className="px-2 py-2 font-bold text-stone-700">{lane}</h2>
              <TicketSkeleton />
              <TicketSkeleton />
            </section>
          ))}
        </div>
      </main>
    );
  }
  const payOrder = snapshot.activeOrders.find(
    (o) => o.id === payId && o.status === "ready",
  );

  const lanes = [
    {
      status: "review",
      title: "En revisión",
      note: "Acepta el pedido para empezar a cocinar.",
      color: "bg-stone-500",
    },
    {
      status: "cooking",
      title: "Cocinando",
      note: "Pedidos aceptados. Manos a la masa.",
      color: "bg-clay-600",
    },
    {
      status: "ready",
      title: "Lista para recoger",
      note: "Cobra al entregar o marca No-Show.",
      color: "bg-emerald-700",
    },
  ] as const;

  const visibleLanes = kitchenOnly
    ? lanes.filter((lane) => lane.status !== "review")
    : lanes;
  const laneCounts = {
    review: snapshot.activeOrders.filter((order) => order.status === "review")
      .length,
    cooking: cookingOrders.length,
    ready: snapshot.activeOrders.filter((order) => order.status === "ready")
      .length,
  };

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
      {activeTab === "queue" && (
        <nav
          className="sticky top-0 z-20 flex border-b border-stone-200 bg-white shadow-sm md:hidden"
          role="tablist"
          aria-label="Filas de pedidos"
        >
        {visibleLanes.map((lane) => (
          <button
            key={lane.status}
            id={`lane-tab-${lane.status}`}
            type="button"
            role="tab"
            aria-selected={activeLane === lane.status}
            aria-controls={`lane-panel-${lane.status}`}
            className={`min-h-12 flex-1 border-b-4 px-2 py-3 text-center text-sm font-bold ${activeLane === lane.status ? "border-clay-600 text-clay-700" : "border-transparent text-stone-500"}`}
            onClick={() => setActiveLane(lane.status)}
          >
            {lane.title}
            <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs tabular-nums">
              {laneCounts[lane.status]}
            </span>
          </button>
        ))}
        </nav>
      )}
      <main className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow mb-2">Un buen turno empieza aquí</p>
            <h1 className="display text-4xl lg:text-5xl">
              Al ritmo del comal.
            </h1>
            <p className="mt-3 text-stone-600">
              {activeTab === "queue"
                ? `${snapshot.activeOrders.length} pedidos en fila · Solo efectivo, siempre al mostrador.`
                : activeTab === "batching"
                  ? `Agrupación por estaciones y tipos de platillo · ${cookingOrders.length} comandas en preparación.`
                  : `${snapshot.completedOrders.filter((o) => o.status === "completed").length} pedidos entregados en este turno.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeTab === "queue" && (
              <button
                className={`btn transition-colors ${
                  kitchenOnly
                    ? "border-clay-600 bg-clay-50 text-clay-900 font-bold"
                    : "border-stone-300 text-stone-700"
                }`}
                onClick={() => {
                  const next = !kitchenOnly;
                  setKitchenOnly(next);
                  if (next && activeLane === "review") setActiveLane("cooking");
                }}
                title="Ocultar o mostrar fila de caja"
              >
                <ChefHat size={16} />
                <span>
                  {kitchenOnly ? "Solo Cocina (Activo)" : "Modo Cocina"}
                </span>
              </button>
            )}
            <SoundButton />
          </div>
        </div>

        {/* Tab switcher: En Fila vs Lotes vs Completados */}
        <div className="mb-6 flex border-b border-stone-200" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "queue"}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition-colors ${
              activeTab === "queue"
                ? "border-clay-600 text-clay-800"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
            onClick={() => setActiveTab("queue")}
          >
            <Clock3 size={16} />
            <span>Pedidos en Fila</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-black ${
                activeTab === "queue"
                  ? "bg-clay-100 text-clay-800"
                  : "bg-stone-100 text-stone-600"
              }`}
            >
              {snapshot.activeOrders.length}
            </span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "batching"}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition-colors ${
              activeTab === "batching"
                ? "border-clay-600 text-clay-800"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
            onClick={() => setActiveTab("batching")}
          >
            <Boxes size={16} />
            <span>Lotes de Cocina (Batching)</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-black ${
                activeTab === "batching"
                  ? "bg-amber-100 text-amber-900"
                  : "bg-stone-100 text-stone-600"
              }`}
            >
              {cookingOrders.length}
            </span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "completed"}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition-colors ${
              activeTab === "completed"
                ? "border-clay-600 text-clay-800"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
            onClick={() => setActiveTab("completed")}
          >
            <Check size={16} />
            <span>Pedidos Completados</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-black ${
                activeTab === "completed"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-stone-100 text-stone-600"
              }`}
            >
              {
                snapshot.completedOrders.filter((o) => o.status === "completed")
                  .length
              }
            </span>
          </button>
        </div>

        {activeTab === "completed" ? (
          <CompletedOrdersSection orders={snapshot.completedOrders} />
        ) : activeTab === "batching" ? (
          <BatchingView
            orders={snapshot.activeOrders}
            command={command}
            connected={connected}
          />
        ) : (
          <>
            {comalSummary.totalPieces > 0 && (
              <section
                className="mb-6 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-xs"
                aria-label="Resumen de platillos al comal"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                      <Flame size={20} />
                    </span>
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-bold text-amber-950">
                        <span>En el comal ahora:</span>
                        <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-black text-amber-950">
                          {comalSummary.totalPieces}{" "}
                          {comalSummary.totalPieces === 1 ? "pieza" : "piezas"}
                        </span>
                      </h2>
                      <p className="mt-0.5 text-xs font-medium text-amber-900/80">
                        {comalSummary.items
                          .map((i) => `${i.total}× ${i.name}`)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <button
                    className="cursor-pointer text-xs font-bold text-amber-900 underline hover:text-amber-950"
                    onClick={() => setShowComalDetails(!showComalDetails)}
                  >
                    {showComalDetails ? "Ocultar masas" : "Ver detalle de masa"}
                  </button>
                </div>
                {showComalDetails && (
                  <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-amber-200/60 pt-3 text-xs sm:grid-cols-3 md:grid-cols-4">
                    {comalSummary.items.map((item) => (
                      <div
                        key={item.name}
                        className="rounded-lg border border-amber-200/50 bg-white/80 p-2.5 shadow-xs"
                      >
                        <strong className="block font-semibold text-stone-900">
                          {item.total}× {item.name}
                        </strong>
                        <ul className="mt-1 space-y-0.5 text-[11px] text-stone-600">
                          {Object.entries(item.masas).map(([masa, qty]) => (
                            <li key={masa} className="flex justify-between">
                              <span>{masa}:</span>
                              <span className="font-bold">{qty}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {!snapshot.acceptingOrders && (
              <div className="mb-5 rounded-xl bg-amber-100 p-4 font-semibold text-amber-950">
                Pedidos web pausados. Los pedidos existentes siguen en cocina.
              </div>
            )}
            <div
              ref={boardRef}
              className={`grid items-start gap-5 ${
                kitchenOnly ? "md:grid-cols-2" : "md:grid-cols-3"
              }`}
            >
              {visibleLanes.map((lane) => {
                const orders = snapshot.activeOrders.filter(
                  (o) => o.status === lane.status,
                );
                return (
                  <section
                    key={lane.status}
                    className={`${lane.status === activeLane ? "flex" : "hidden"} min-w-0 flex-col rounded-2xl bg-stone-100 p-3 md:flex`}
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
                      {!connected && <TicketSkeleton />}
                      {!orders.length && connected && (
                        <EmptyState>
                          Sin pedidos {lane.title.toLowerCase()}
                        </EmptyState>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
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
