import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Banknote, Check } from "lucide-react";
import { Brand, Modal, centsOf, mxn } from "../../../../shared/ui/components";
import type { GhostSalesMetrics } from "./types";

/**
 * Practice twin of the real «Caja y ventas» page (apps/analytics): the same title, cards
 * and the same «Cerrar Turno» confirmation, fed only with practice tickets. The real
 * close-out has no cash-count step, so neither does this one.
 */
export function PracticeAnalytics({
  metrics,
  queueSize,
  onBack,
  onOpenClose,
  onConfirmClose,
}: {
  metrics: GhostSalesMetrics;
  /** Tickets still in the practice queue (the real button is off while any remain). */
  queueSize: number;
  onBack: () => void;
  onOpenClose: () => void;
  onConfirmClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [archived, setArchived] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const countedCashCents = centsOf(countedCash);
  const differenceCents =
    countedCashCents === null ? null : countedCashCents - metrics.cashCents;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closing) onBack();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closing, onBack]);
  const maximum = metrics.itemPerformance[0]?.quantity || 1;
  return (
    <div className="z-layer-modal fixed inset-0 overflow-y-auto overscroll-contain bg-cream pb-[env(safe-area-inset-bottom)] pt-[var(--academy-bar-h,0px)]">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-8">
          <Brand />
          <button
            type="button"
            data-tour-allow="analytics-back"
            className="btn gap-2"
            onClick={onBack}
          >
            <ArrowLeft size={16} />
            Volver al POS
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-5 py-8 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="display text-4xl md:text-5xl">Caja y ventas.</h1>
            <p className="mt-3 text-sm text-stone-500">
              Turno de práctica · Ciudad de México
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              disabled
              title="No disponible en la práctica"
            >
              Exportar historial
            </button>
            <button
              className="btn btn-primary"
              data-help="close-shift"
              data-tour-target="btn-close-shift"
              onClick={() => {
                setClosing(true);
                onOpenClose();
              }}
            >
              Cerrar Turno
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
        {archived && (
          <p
            role="status"
            className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            <Check className="mr-2 inline" size={17} />
            Turno de práctica archivado. En la caja real aquí aparecería el
            nombre del archivo.
          </p>
        )}
        <section
          data-help="sales-card"
          data-tour-target="analytics-sales-card"
          className="rounded-2xl bg-clay-600 p-6 text-white"
        >
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
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              {/* Same rule as the live screen: the split appears with the first transfer. */}
              {metrics.speiOrders > 0 && (
                <>
                  <div>
                    <dt className="text-xs text-white/75">
                      Ventas en efectivo
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {mxn(metrics.cashCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-white/75">
                      Transferencias ({metrics.speiOrders})
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {mxn(metrics.speiCents)}
                    </dd>
                  </div>
                </>
              )}
              <div>
                <dt className="text-xs text-white/75">Efectivo recibido</dt>
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
        <section
          data-help="cash-count-card"
          className="panel mt-6 border-2 border-stone-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-2 text-stone-900">
            <span className="text-xl">💵</span>
            <h2 className="text-xl font-bold">Conteo de Efectivo Físico</h2>
          </div>
          <p className="mt-2 text-sm text-stone-600">
            Es hora de ir a casa. Toma el dinero real del cajón y cuéntalo con
            calma billete por billete.
          </p>
          <label className="mt-5 block text-lg font-bold text-stone-900">
            ¿Cuánto efectivo contaste? (MXN)
            <input
              className="field mt-2 w-full text-xl tabular-nums"
              inputMode="decimal"
              value={countedCash}
              onChange={(event) => setCountedCash(event.target.value)}
              placeholder="0.00"
            />
          </label>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <span className="block text-xs font-bold uppercase tracking-wide text-stone-500">
                Lo que debe haber en efectivo
              </span>
              <span className="mt-1 block text-2xl font-black text-stone-900 tabular-nums">
                {mxn(metrics.cashCents)}
              </span>
            </div>
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <span className="block text-xs font-bold uppercase tracking-wide text-stone-500">
                Diferencia
              </span>
              <span
                className={`mt-1 block text-2xl font-black tabular-nums ${differenceCents === null ? "text-stone-500" : differenceCents < 0 ? "text-red-700" : "text-emerald-700"}`}
              >
                {differenceCents === null
                  ? "—"
                  : differenceCents < 0
                    ? `Faltan ${mxn(-differenceCents)}`
                    : differenceCents > 0
                      ? `Sobran ${mxn(differenceCents)}`
                      : mxn(0)}
              </span>
            </div>
          </div>
        </section>
        <section className="panel mt-6">
          <h2 className="text-xl font-bold">Los más vendidos</h2>
          <p className="mb-6 mt-1 text-sm text-stone-500">
            Unidades de pedidos entregados · {metrics.completedOrders} pedidos
          </p>
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
                    <span className="font-normal text-stone-500">unidades</span>
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
        </section>
      </main>
      {closing && (
        <Modal
          title="Cerrar Turno"
          onClose={() => setClosing(false)}
          layer="inline"
        >
          <p className="mb-5">
            Se guardará un archivo permanente con el historial y los totales. El
            nuevo turno empezará en cero.
          </p>
          <dl
            data-tour-target="close-shift-summary"
            className="mb-5 space-y-3 rounded-xl bg-stone-100 p-4"
          >
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
              <dd>{queueSize}</dd>
            </div>
          </dl>
          {queueSize > 0 && (
            <p className="mb-5 text-sm font-semibold text-red-700">
              Entrega los pedidos pagados y resuelve los pedidos por pagar antes
              de cerrar.
            </p>
          )}
          <div className="flex gap-3">
            <button className="btn flex-1" onClick={() => setClosing(false)}>
              Volver
            </button>
            <button
              className="btn btn-primary flex-1"
              data-help="archive-close"
              data-tour-target="btn-confirm-close-shift"
              disabled={queueSize > 0}
              onClick={() => {
                setClosing(false);
                setArchived(true);
                onConfirmClose();
              }}
            >
              Archivar y cerrar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
