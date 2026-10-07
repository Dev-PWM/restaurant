import { useState } from "react";
import {
  DollarSign,
  TrendingUp,
  Receipt,
  UserX,
  Lock,
  CheckCircle2,
  AlertCircle,
  X,
  FileCheck2,
} from "lucide-react";
import { mxn } from "../../../../shared/ui/components";
import type { GhostSalesMetrics } from "./types";

interface AcademyLedgerModalProps {
  metrics: GhostSalesMetrics;
  isOpen: boolean;
  onClose: () => void;
  guidedTarget: string | null;
  onInspectRevenue: () => void;
  onOpenCloseShift: () => void;
  isBlindDropOpen: boolean;
  onBlindDropConfirmed: () => void;
  onCardClickAllowed: boolean;
}

export function AcademyLedgerModal({
  metrics,
  isOpen,
  onClose,
  guidedTarget,
  onInspectRevenue,
  onOpenCloseShift,
  isBlindDropOpen,
  onBlindDropConfirmed,
  onCardClickAllowed,
}: AcademyLedgerModalProps) {
  const [declaredCash, setDeclaredCash] = useState("");
  const [showDiscrepancyError, setShowDiscrepancyError] = useState(false);

  if (!isOpen) return null;

  const expectedCashCents = metrics.revenueCents; // 55500
  const enteredNum = parseFloat(declaredCash);
  const enteredCents = isNaN(enteredNum) ? 0 : Math.round(enteredNum * 100);
  const discrepancyCents = enteredCents - expectedCashCents;
  const isExactMatch = enteredCents === expectedCashCents;

  const handleConfirmClose = () => {
    if (!isExactMatch) {
      setShowDiscrepancyError(true);
      return;
    }
    onBlindDropConfirmed();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-3xl rounded-3xl border-2 border-stone-700 bg-stone-900 text-stone-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 bg-stone-950 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-yellow-400 text-stone-950 font-black">
              <DollarSign className="size-6 stroke-[2.5]" />
            </span>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white">
                Auditoría de Turno & Caja de Práctica
              </h2>
              <p className="text-xs text-yellow-400 font-bold">
                Módulo 5: Ganancias y Cierre · Datos Sandboxed
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-tour-action="ledger-close"
            className="rounded-full p-2 text-stone-400 hover:bg-stone-800 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Revenue KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Main Revenue Card */}
            <div
              data-tour-target="card-revenue-display"
              data-tour-action="inspect-revenue"
              onClick={() => {
                if (guidedTarget === "card-revenue-display" && onCardClickAllowed) {
                  onInspectRevenue();
                }
              }}
              className={`relative rounded-2xl p-4 transition-all cursor-pointer ${
                guidedTarget === "card-revenue-display"
                  ? "bg-amber-950/70 border-2 border-yellow-400 ring-4 ring-yellow-400/50 shadow-xl"
                  : "bg-stone-950 border border-stone-800 hover:border-stone-700"
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold text-stone-400">
                <span>Ingresos del Día</span>
                <TrendingUp className="size-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-3xl font-black text-white tabular-nums">
                {mxn(metrics.revenueCents)}
              </div>
              <p className="mt-1 text-xs text-stone-400">
                Suma de 3 comandas de práctica cobradas ($185 × 3).
              </p>
              {guidedTarget === "card-revenue-display" && (
                <div className="mt-2 rounded-lg bg-yellow-400/20 px-2 py-1 text-[11px] font-bold text-yellow-300 border border-yellow-400/30 text-center animate-pulse">
                  👆 Toca esta tarjeta para verificar ingresos
                </div>
              )}
            </div>

            {/* Paid Orders Card */}
            <div className="rounded-2xl bg-stone-950 border border-stone-800 p-4">
              <div className="flex items-center justify-between text-xs font-bold text-stone-400">
                <span>Comandas Cobradas</span>
                <Receipt className="size-4 text-amber-400" />
              </div>
              <div className="mt-2 text-3xl font-black text-white tabular-nums">
                {metrics.paidOrders}
              </div>
              <p className="mt-1 text-xs text-stone-400">
                Recibido: {mxn(metrics.tenderedCents)} · Cambio: {mxn(metrics.changeCents)}
              </p>
            </div>

            {/* No-Shows / Voids Card */}
            <div className="rounded-2xl bg-stone-950 border border-stone-800 p-4">
              <div className="flex items-center justify-between text-xs font-bold text-stone-400">
                <span>No-Shows / Anulados</span>
                <UserX className="size-4 text-red-400" />
              </div>
              <div className="mt-2 text-3xl font-black text-white tabular-nums">
                {metrics.noShows}
              </div>
              <p className="mt-1 text-xs text-stone-400">
                Merma auditada: $0.00 cobrado.
              </p>
            </div>
          </div>

          {/* Audit breakdown table */}
          <div className="rounded-2xl bg-stone-950 border border-stone-800 p-4">
            <h3 className="text-sm font-bold text-stone-300 mb-3 flex items-center gap-2">
              <FileCheck2 className="size-4 text-yellow-400" />
              Desglose de Órdenes del Turno de Práctica
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-stone-800/80">
                <span className="text-stone-300">Comanda #1: Orden de Prueba (El Flujo Perfecto)</span>
                <span className="font-bold text-emerald-400 tabular-nums">+$185.00 MXN</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-stone-800/80">
                <span className="text-stone-300">Comanda #2: Cliente Exigente (Sin Queso verificado)</span>
                <span className="font-bold text-emerald-400 tabular-nums">+$185.00 MXN</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-stone-800/80">
                <span className="text-stone-300">Comanda #3: Pago salvado con Deshacer ($500 recibido)</span>
                <span className="font-bold text-emerald-400 tabular-nums">+$185.00 MXN</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-stone-800/80">
                <span className="text-stone-300">Comanda #4: Cliente No-Show (Anulación auditada)</span>
                <span className="font-bold text-stone-500 tabular-nums">$0.00 MXN (Anulado)</span>
              </div>
              <div className="flex justify-between items-center pt-2 font-bold text-sm">
                <span className="text-white">Efectivo Total en Cajón:</span>
                <span className="text-yellow-400 text-base tabular-nums">$555.00 MXN</span>
              </div>
            </div>
          </div>

          {/* Blind Drop Modal View if open */}
          {isBlindDropOpen ? (
            <div className="rounded-2xl border-2 border-yellow-500/80 bg-amber-950/40 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Lock className="size-5 text-yellow-400" />
                <h4 className="text-base font-bold text-white">
                  Arqueo de Caja a Ciegas (Blind Drop)
                </h4>
              </div>
              <p className="text-xs text-stone-300 leading-relaxed">
                El cajero debe ingresar el efectivo físico total que contó en el cajón de dinero. El sistema no revela la cifra para evitar fraudes en el arqueo.
              </p>

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">
                  Efectivo Físico Contado (MXN):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    data-tour-target="input-blind-drop"
                    data-tour-action="blind-drop-input"
                    value={declaredCash}
                    onChange={(e) => {
                      setDeclaredCash(e.target.value);
                      setShowDiscrepancyError(false);
                    }}
                    placeholder="Ej. 555"
                    className="field flex-1 text-xl font-black tabular-nums bg-stone-900 border-yellow-400 text-yellow-400"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setDeclaredCash("555");
                      setShowDiscrepancyError(false);
                    }}
                    className="btn btn-secondary text-xs px-3 font-bold"
                  >
                    Cuadre Exacto: $555.00
                  </button>
                </div>
              </div>

              {/* Live discrepancy calculation */}
              {declaredCash && (
                <div
                  className={`rounded-xl p-3 text-xs font-bold flex items-center gap-2 ${
                    isExactMatch
                      ? "bg-emerald-950/80 text-emerald-300 border border-emerald-600/50"
                      : "bg-red-950/80 text-red-300 border border-red-600/50"
                  }`}
                >
                  {isExactMatch ? (
                    <>
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                      <span>
                        ¡Cuadre perfecto! Diferencia de $0.00 MXN. Todo el efectivo físico coincide con el registro del turno.
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="size-4 shrink-0 text-red-400" />
                      <span>
                        Discrepancia detectada: {discrepancyCents > 0 ? "Sobrante de" : "Faltante de"}{" "}
                        {mxn(Math.abs(discrepancyCents))}. Escribe 555 para cuadrar.
                      </span>
                    </>
                  )}
                </div>
              )}

              {showDiscrepancyError && !isExactMatch && (
                <p className="text-xs font-bold text-red-400">
                  ⚠️ No puedes cerrar turno con descuadre en la capacitación. Ingresa 555.
                </p>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  data-tour-target="btn-confirm-close-shift"
                  data-tour-action="close-shift-confirm"
                  onClick={handleConfirmClose}
                  disabled={!isExactMatch}
                  className="btn btn-primary w-full text-base font-black py-3 disabled:opacity-40"
                >
                  Archivar y cerrar turno de práctica
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-2">
              <button
                type="button"
                data-tour-target="btn-close-shift"
                data-tour-action="close-shift-open"
                onClick={onOpenCloseShift}
                className="btn btn-primary w-full text-base font-black py-3.5 shadow-xl"
              >
                Cerrar Turno (Iniciar Corte de Caja Seguro)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
