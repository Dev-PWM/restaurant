import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Banknote,
  Check,
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
  StaffHeader,
  time,
} from "../../../../../shared/ui/components";
const labels: Record<string, string> = {
  review: "En revisión",
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
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              {[
                "Hora / Pedido",
                "Cliente y platillos",
                "Estado",
                "Venta",
                "Recibido",
                "Cambio",
              ].map((label) => (
                <th
                  key={label}
                  className={`px-3 py-3 ${["Venta", "Recibido", "Cambio"].includes(label) ? "text-right" : ""}`}
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
                  <strong>{orderLabel(o)}</strong>
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
  const maximum = metrics.itemPerformance[0]?.quantity || 1;
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
        <div>
          <section className="rounded-2xl bg-clay-600 p-6 text-white">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Banknote size={18} />
              Ventas cobradas · MXN
            </p>
            <p className="my-4 text-5xl font-semibold tracking-tight tabular-nums">
              {mxn(metrics.revenueCents)}
            </p>
            <div className="flex flex-wrap items-end justify-between gap-5 border-t border-white/25 pt-4">
              <p className="text-sm text-white/90">
                {metrics.paidOrders} pedidos pagados · {metrics.noShows} No-Show
                excluidos
              </p>
              <dl className="flex gap-8">
                <div>
                  <dt className="text-xs text-white/75">Recibido</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">
                    {mxn(metrics.tenderedCents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/75">Cambio</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">
                    {mxn(metrics.changeCents)}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </div>
        <div className="mt-6">
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
                Entrega el primer pedido para ver los platillos más vendidos.
              </EmptyState>
            )}
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
          <dl className="mb-5 space-y-3 rounded-xl bg-stone-100 p-4">
            <div className="flex justify-between">
              <dt>Ventas cobradas</dt>
              <dd className="font-bold">{mxn(metrics.revenueCents)}</dd>
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
