import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Banknote,
  Calculator,
  Check,
  Coins,
  Printer,
  SlidersHorizontal,
} from "lucide-react";
import type { Order } from "../../../../../shared/types/realtime";
import { useRealtime } from "../../../../../shared/ui/RealtimeProvider";
import {
  EmptyState,
  InventoryControl,
  Modal,
  mxn,
  orderLabel,
  printThermalTicket,
  StaffHeader,
  time,
} from "../../../../../shared/ui/components";
const labels: Record<string, string> = {
  unpaid: "Por pagar",
  cooking: "Cocinando",
  ready: "Lista",
  completed: "Entregado",
  no_show: "No-Show",
};
export function TransactionTable({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState(""),
    [status, setStatus] = useState("all");
  const rows = orders
    .filter(
      (o) =>
        (!filter ||
          `${o.customerName} ${orderLabel(o)}`
            .toLowerCase()
            .includes(filter.toLowerCase())) &&
        (status === "all" || status === "no_show"
          ? status === "all" || o.status === "no_show"
          : Boolean(o.transaction)),
    )
    .sort((a, b) =>
      (b.transaction?.paidAt || b.completedAt || b.createdAt).localeCompare(
        a.transaction?.paidAt || a.completedAt || a.createdAt,
      ),
    );
  const [page, setPage] = useState(0),
    pageCount = Math.max(1, Math.ceil(rows.length / 50)),
    current = Math.min(page, pageCount - 1);
  return (
    <section className="panel mt-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Historial del turno</h2>
          <p className="mt-1 text-sm text-stone-500">
            Pagos registrados y pedidos No-Show · {rows.length} registros
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="field w-52"
            aria-label="Buscar transacciones"
            placeholder="Nombre o pedido…"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
          />
          <select
            className="field w-auto"
            aria-label="Filtrar transacciones"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">Todos</option>
            <option value="paid">Pagados</option>
            <option value="no_show">No-Show</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              {[
                "Hora / Pedido",
                "Cliente y platillos",
                "Estado",
                "Venta",
                "Recibido",
                "Propina",
                "Cambio",
              ].map((label) => (
                <th
                  key={label}
                  className={`px-3 py-3 ${["Venta", "Recibido", "Propina", "Cambio"].includes(label) ? "text-right" : ""}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(current * 50, current * 50 + 50).map((o) => (
              <tr key={o.id} className="border-b border-stone-100 align-top">
                <td className="px-3 py-4">
                  <div className="flex items-center gap-1.5">
                    <strong>{orderLabel(o)}</strong>
                    <button
                      className="p-1 text-stone-400 hover:text-stone-700 transition-colors"
                      title="Imprimir comanda térmica"
                      aria-label={`Imprimir comanda ${orderLabel(o)}`}
                      onClick={() => printThermalTicket(o)}
                    >
                      <Printer size={13} />
                    </button>
                  </div>
                  <span className="mt-1 block text-xs text-stone-500">
                    {time(
                      o.transaction?.paidAt || o.completedAt || o.createdAt,
                    )}
                  </span>
                </td>
                <td className="max-w-sm px-3 py-4">
                  <strong>{o.customerName}</strong>
                  <ul className="mt-1 space-y-1 text-xs text-stone-500">
                    {o.items.map((line, i) => (
                      <li key={i}>
                        {line.quantity} × {line.name}
                        {line.modifiers.length > 0 &&
                          ` · ${line.modifiers.map((m) => m.name).join(", ")}`}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-3 py-4">
                  <span
                    className={`whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold ${o.status === "no_show" ? "bg-stone-100 text-stone-600" : "bg-emerald-50 text-emerald-800"}`}
                  >
                    {labels[o.status]}
                  </span>
                </td>
                <td className="px-3 py-4 text-right font-bold tabular-nums">
                  {mxn(o.transaction?.totalCents || 0)}
                </td>
                <td className="px-3 py-4 text-right tabular-nums">
                  {o.transaction ? mxn(o.transaction.tenderedCents) : "—"}
                </td>
                <td className="px-3 py-4 text-right tabular-nums">
                  {o.transaction ? mxn(o.transaction.tipCents) : "—"}
                </td>
                <td className="px-3 py-4 text-right tabular-nums">
                  {o.transaction ? mxn(o.transaction.changeCents) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <EmptyState>Aquí aparecerán los pagos y pedidos cerrados.</EmptyState>
      )}
      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            className="btn"
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            Anterior
          </button>
          <span>
            {current + 1} / {pageCount}
          </span>
          <button
            className="btn"
            disabled={current + 1 >= pageCount}
            onClick={() => setPage(current + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
    </section>
  );
}
function exportLedger(orders: Order[]) {
  const protect = (value: unknown) => {
    const text = String(value ?? "");
    return `"${(/^[=+@\-\t\r\n]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
  };
  const rows: unknown[][] = [
    [
      "Pedido",
      "Cliente",
      "Estado",
      "Hora",
      "Platillos",
      "Venta MXN",
      "Recibido MXN",
      "Propina MXN",
      "Cambio MXN",
    ],
  ];
  for (const o of orders)
    rows.push([
      o.number,
      o.customerName,
      labels[o.status],
      o.transaction?.paidAt || o.completedAt,
      o.items
        .map(
          (l) =>
            `${l.quantity} × ${l.name} (${l.modifiers.map((m) => m.name).join(", ")})`,
        )
        .join("; "),
      ((o.transaction?.totalCents || 0) / 100).toFixed(2),
      ((o.transaction?.tenderedCents || 0) / 100).toFixed(2),
      ((o.transaction?.tipCents || 0) / 100).toFixed(2),
      ((o.transaction?.changeCents || 0) / 100).toFixed(2),
    ]);
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + rows.map((row) => row.map(protect).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "masaflow-ledger.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const DENOMINATIONS = [
  { label: "$1,000", valueCents: 100000 },
  { label: "$500", valueCents: 50000 },
  { label: "$200", valueCents: 20000 },
  { label: "$100", valueCents: 10000 },
  { label: "$50", valueCents: 5000 },
  { label: "$20", valueCents: 2000 },
  { label: "$10", valueCents: 1000 },
  { label: "$5", valueCents: 500 },
  { label: "$2", valueCents: 200 },
  { label: "$1", valueCents: 100 },
  { label: "50¢", valueCents: 50 },
];

export function DenominationCounter({
  expectedCents,
}: {
  expectedCents: number;
}) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const totalCents = Object.entries(counts).reduce(
    (sum, [idx, count]) =>
      sum + (DENOMINATIONS[Number(idx)]?.valueCents || 0) * (count || 0),
    0,
  );
  const diff = totalCents - expectedCents;

  return (
    <div className="mb-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-stone-900">
          <Coins size={16} className="text-clay-600" />
          <span>Arqueo de gaveta (Billetes y monedas)</span>
        </h3>
        <button
          type="button"
          className="cursor-pointer text-xs text-stone-500 underline hover:text-stone-800"
          onClick={() => setCounts({})}
        >
          Limpiar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        {DENOMINATIONS.map((d, index) => (
          <div
            key={d.label}
            className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-2 shadow-2xs"
          >
            <span className="font-semibold text-stone-700">{d.label}</span>
            <input
              type="number"
              min="0"
              placeholder="0"
              className="field h-8 w-14 px-1 py-0 text-center text-sm font-bold"
              value={counts[index] || ""}
              onChange={(e) => {
                const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                setCounts((prev) => ({ ...prev, [index]: val }));
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-3 text-sm">
        <div>
          <span className="block text-xs text-stone-500">Total contado:</span>
          <strong className="text-lg font-bold tabular-nums text-stone-900">
            {mxn(totalCents)}
          </strong>
        </div>
        <div className="text-right">
          <span className="block text-xs text-stone-500">
            Diferencia vs sistema:
          </span>
          <strong
            className={`text-sm font-bold tabular-nums ${
              totalCents === 0
                ? "text-stone-400"
                : diff === 0
                  ? "text-emerald-700"
                  : diff > 0
                    ? "text-blue-700"
                    : "text-red-700"
            }`}
          >
            {totalCents === 0
              ? "Sin contar"
              : diff === 0
                ? "Cuadrada ($0.00)"
                : diff > 0
                  ? `+${mxn(diff)} (Sobrante)`
                  : `-${mxn(Math.abs(diff))} (Faltante)`}
          </strong>
        </div>
      </div>
    </div>
  );
}

export function Analytics() {
  const { snapshot, connected, command } = useRealtime();
  const [inventory, setInventory] = useState(false),
    [close, setClose] = useState(false),
    [busy, setBusy] = useState(false),
    [archive, setArchive] = useState("");
  if (!snapshot?.salesMetrics) return null;
  const metrics = snapshot.salesMetrics,
    ledger = [
      ...snapshot.activeOrders.filter((o) => o.transaction),
      ...snapshot.completedOrders,
    ];
  const top = [...metrics.itemPerformance].sort(
      (a, b) => b.revenueCents - a.revenueCents,
    )[0],
    favorite = metrics.favoriteCombinations[0],
    maximum = metrics.itemPerformance[0]?.quantity || 1;
  return (
    <>
      <StaffHeader page="analytics">
        <button className="btn" onClick={() => setInventory(true)}>
          <SlidersHorizontal size={16} />
          Inventario
        </button>
      </StaffHeader>
      <main className="mx-auto max-w-[1440px] px-5 py-8 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow mb-2">Cada peso, en su lugar</p>
            <h1 className="display text-4xl md:text-5xl">Caja y ventas.</h1>
            <p className="mt-3 text-sm text-stone-500">
              Turno abierto{" "}
              {new Intl.DateTimeFormat("es-MX", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "America/Mexico_City",
              }).format(new Date(snapshot.shiftOpenedAt))}{" "}
              · Ciudad de México
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => exportLedger(ledger)}>
              <ArrowDownToLine size={16} />
              Exportar historial
            </button>
            <button
              className="btn btn-primary"
              disabled={!connected || busy}
              onClick={() => setClose(true)}
            >
              Cerrar Turno
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
        {archive && (
          <p
            role="status"
            className="mb-5 break-all rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            <Check className="mr-2 inline" size={17} />
            Turno archivado: {archive}. La caja está lista para empezar.
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_1fr]">
          <section className="rounded-2xl bg-clay-600 p-6 text-white">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Banknote size={18} />
              Ventas cobradas · MXN
            </p>
            <p className="my-4 text-5xl font-semibold tracking-tight tabular-nums">
              {mxn(metrics.revenueCents)}
            </p>
            <p className="text-sm text-white/90">
              {metrics.paidOrders} pedidos pagados · {metrics.noShows} No-Show
              excluidos
            </p>
          </section>
          <section className="panel">
            <p className="eyebrow">Efectivo en caja · MXN</p>
            <p className="my-4 text-3xl font-semibold tabular-nums">
              {mxn(metrics.cashHeldCents)}
            </p>
            <p className="text-sm text-stone-500">
              Recibido: {mxn(metrics.tenderedCents)} · Cambio:{" "}
              <strong className="text-stone-900">
                {mxn(metrics.changeCents)}
              </strong>
            </p>
            <p className="mt-2 text-xs text-stone-500">
              Ventas + propinas = efectivo en caja
            </p>
          </section>
          <section className="panel">
            <p className="eyebrow">Propinas</p>
            <p className="my-4 text-3xl font-semibold tabular-nums">
              {mxn(metrics.tipsCents)}
            </p>
            <p className="mb-2 text-sm text-stone-500">
              Ticket promedio:{" "}
              <strong className="text-stone-900">
                {mxn(metrics.averageTicketCents)}
              </strong>
            </p>
            <p className="text-sm text-stone-500">
              Hora de mayor actividad:{" "}
              <strong className="text-stone-900">
                {metrics.peakHour ? `${metrics.peakHour}:00 h` : "—"}
              </strong>
            </p>
            <p className="mt-2 text-xs text-stone-500">
              Solo pagos del turno actual
            </p>
          </section>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <section className="panel">
            <h2 className="text-xl font-bold">Los más vendidos</h2>
            <p className="mb-6 mt-1 text-sm text-stone-500">
              Unidades de pedidos entregados · {metrics.completedOrders} pedidos
            </p>
            {metrics.itemPerformance.length ? (
              <ol className="space-y-5">
                {metrics.itemPerformance.map((item, index) => (
                  <li key={item.id}>
                    <div className="mb-2 flex justify-between gap-3 text-sm">
                      <span>
                        <span className="mr-3 text-stone-400">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <strong>{item.name}</strong>
                      </span>
                      <span className="font-bold">
                        {item.quantity}{" "}
                        <span className="font-normal text-stone-500">
                          unidades
                        </span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-clay-600"
                        style={{ width: `${(item.quantity / maximum) * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-xs text-stone-500">
                      {mxn(item.revenueCents)} MXN
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState>
                Entrega el primer pedido para ver los favoritos.
              </EmptyState>
            )}
          </section>
          <section className="rounded-2xl border border-clay-100 bg-clay-50 p-6">
            <p className="eyebrow text-clay-700">Los favoritos de la casa</p>
            <h2 className="display mb-3 mt-5 text-3xl">
              {top?.name || "El próximo favorito está por llegar."}
            </h2>
            <p className="text-sm text-stone-600">
              {top
                ? `${mxn(top.revenueCents)} MXN · Mayor ingreso de pedidos entregados`
                : "Descubre qué platillos y combinaciones eligen más tus clientes."}
            </p>
            <div className="mt-7 border-t border-clay-100 pt-5">
              <p className="eyebrow mb-3">Combinación preferida</p>
              <p className="font-semibold">
                {favorite?.name || "Sin pedidos entregados aún"}
              </p>
              {favorite && (
                <p className="mt-2 text-sm text-stone-500">
                  Elegida {favorite.quantity} veces
                </p>
              )}
            </div>
          </section>
        </div>
        <TransactionTable orders={ledger} />
        <footer className="mt-6 text-xs text-stone-500">
          Actualizado {time(snapshot.observedAt)} ·{" "}
          {connected ? "En vivo" : "Último estado guardado — Sin Conexión"} ·
          Importes finales en MXN
        </footer>
      </main>
      {inventory && <InventoryControl onClose={() => setInventory(false)} />}{" "}
      {close && (
        <Modal title="Cerrar Turno" onClose={() => setClose(false)}>
          <p className="mb-5">
            Se guardará un archivo permanente con el historial y los totales. El
            nuevo turno empezará en cero.
          </p>
          <DenominationCounter expectedCents={metrics.cashHeldCents} />
          <dl className="mb-5 space-y-3 rounded-xl bg-stone-100 p-4">
            <div className="flex justify-between">
              <dt>Ventas cobradas</dt>
              <dd className="font-bold">{mxn(metrics.revenueCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Propinas</dt>
              <dd className="font-bold">{mxn(metrics.tipsCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Efectivo en caja</dt>
              <dd className="font-bold">{mxn(metrics.cashHeldCents)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>No-Show / anulaciones sin cobro</dt>
              <dd>{metrics.voidCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Pedidos en fila</dt>
              <dd>{snapshot.activeOrders.length}</dd>
            </div>
          </dl>
          {snapshot.activeOrders.length > 0 && (
            <p className="mb-5 text-sm font-semibold text-red-700">
              Entrega los pedidos pagados y resuelve los pedidos por pagar antes
              de cerrar.
            </p>
          )}
          <div className="flex gap-3">
            <button className="btn flex-1" onClick={() => setClose(false)}>
              Volver
            </button>
            <button
              className="btn btn-primary flex-1"
              disabled={!connected || busy || snapshot.activeOrders.length > 0}
              onClick={async () => {
                setBusy(true);
                const reply = await command("pos_close_shift", {
                  shiftId: snapshot.shiftId,
                  expectedRevision: snapshot.revision,
                });
                setBusy(false);
                if (reply.ok) {
                  setArchive(reply.archive || "");
                  setClose(false);
                }
              }}
            >
              Archivar y cerrar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
