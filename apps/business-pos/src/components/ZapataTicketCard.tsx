import React, { memo } from "react";
import { AlertCircle, Clock3, Utensils, Building2, Flame } from "lucide-react";
import type { Order } from "../../../../shared/types/realtime";
import { mxn, orderLabel } from "../../../../shared/ui/components";

export interface ZapataTicketCardProps {
  order: Order;
  onAdvance?: () => void;
  onPay?: () => void;
  onNoShow?: () => void;
  onAcknowledgeRestriction?: () => void;
  restrictionAcknowledged?: boolean;
  simulator?: boolean;
  isSPEI?: boolean;
  cookingStyle?: "con_grasa" | "sin_grasa";
}

export const ZapataTicketCard = memo(function ZapataTicketCard({
  order,
  onAdvance,
  onPay,
  onNoShow,
  onAcknowledgeRestriction,
  restrictionAcknowledged = false,
  simulator = false,
  isSPEI = false,
  cookingStyle,
}: ZapataTicketCardProps) {
  const isCooking = order.status === "cooking";
  const isReview = order.status === "review";
  const isReady = order.status === "ready";

  // Scan items for modifiers
  const hasSinGrasa =
    cookingStyle === "sin_grasa" ||
    order.items.some(
      (item) =>
        item.name.toLowerCase().includes("sin grasa") ||
        item.modifiers?.some((m) =>
          m.name.toLowerCase().includes("sin grasa") ||
          m.name.toLowerCase().includes("comal seco")
        )
    );

  const hasExtraQuesillo = order.items.some(
    (item) =>
      item.modifiers?.some((m) =>
        m.name.toLowerCase().includes("quesillo")
      )
  );

  const omissions = order.items.flatMap((item) =>
    (item.modifiers || []).filter((m) => m.kind === "omit")
  );

  return (
    <article
      data-order-id={order.id}
      data-tour-target={simulator ? "zapata-ticket-card" : undefined}
      className={`relative overflow-hidden rounded-2xl border-2 bg-white p-4 shadow-sm transition-all ${
        hasSinGrasa
          ? "border-purple-500 bg-purple-50/20"
          : omissions.length > 0
            ? "border-amber-400 bg-amber-50/20"
            : "border-stone-200"
      }`}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2 border-b border-stone-200 pb-2.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black text-stone-900">
              {orderLabel(order)}
            </span>
            {isSPEI && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-xs font-black text-white">
                <Building2 className="size-3.5" />
                SPEI BBVA
              </span>
            )}
          </div>
          <p className="font-bold text-stone-700">{order.customerName}</p>
        </div>

        <div className="text-right">
          <strong className="text-lg font-black tabular-nums text-stone-900">
            {mxn(order.totalCents)}
          </strong>
          <span className="block text-[10px] font-black uppercase tracking-wider text-stone-400">
            {order.items.reduce((acc, i) => acc + i.quantity, 0)} platillos
          </span>
        </div>
      </div>

      {/* Critical Kitchen Badges */}
      {(hasSinGrasa || hasExtraQuesillo || omissions.length > 0) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {hasSinGrasa && (
            <span
              data-tour-target={simulator ? "badge-sin-grasa" : undefined}
              className="inline-flex items-center gap-1 rounded-lg bg-purple-700 px-2.5 py-1 text-xs font-black text-white shadow-xs"
            >
              <Flame className="size-3.5" />
              SIN GRASA (COMAL SECO)
            </span>
          )}

          {hasExtraQuesillo && (
            <span
              data-tour-target={simulator ? "badge-quesillo" : undefined}
              className="inline-flex items-center rounded-lg bg-[#E03188] px-2.5 py-1 text-xs font-black text-white shadow-xs"
            >
              + C/QUESILLO
            </span>
          )}

          {omissions.map((omission) => (
            <button
              key={omission.id}
              type="button"
              data-tour-target={simulator ? `badge-omit-${omission.id}` : undefined}
              onClick={onAcknowledgeRestriction}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-black uppercase text-white transition-transform ${
                restrictionAcknowledged
                  ? "bg-emerald-700 ring-2 ring-emerald-400"
                  : "bg-red-600 animate-pulse hover:scale-105 active:scale-95"
              }`}
            >
              <AlertCircle className="size-3.5" />
              {omission.name.toUpperCase()}
              {restrictionAcknowledged && " ✓"}
            </button>
          ))}
        </div>
      )}

      {/* Line Items */}
      <div className="space-y-2 py-1">
        {order.items.map((item, idx) => (
          <div key={idx} className="border-b border-stone-100 pb-2 last:border-b-0 last:pb-0">
            <div className="flex items-center justify-between text-sm font-bold text-stone-900">
              <span>
                {item.quantity} × {item.name}
              </span>
              <span className="tabular-nums font-semibold text-stone-600">
                {mxn(item.lineTotalCents)}
              </span>
            </div>

            {item.modifiers && item.modifiers.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {item.modifiers.map((mod) => (
                  <span
                    key={mod.id}
                    className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                      mod.kind === "omit"
                        ? "bg-red-100 text-red-800"
                        : mod.name.toLowerCase().includes("quesillo")
                          ? "bg-rose-100 text-[#E03188]"
                          : "bg-stone-100 text-stone-700"
                    }`}
                  >
                    {mod.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex gap-2 border-t border-stone-200 pt-3">
        {isReview && onAdvance && (
          <button
            type="button"
            data-tour-target={simulator ? "accept-demo-order" : undefined}
            onClick={onAdvance}
            className="btn btn-primary min-h-[44px] flex-1 font-black text-sm"
          >
            Aceptar y Cocinar
          </button>
        )}

        {isCooking && onAdvance && (
          <button
            type="button"
            data-tour-target={simulator ? "mark-demo-ready" : undefined}
            onClick={onAdvance}
            className="btn min-h-[44px] flex-1 bg-emerald-600 font-black text-sm text-white hover:bg-emerald-700"
          >
            Marcar Lista
          </button>
        )}

        {isReady && onPay && (
          <button
            type="button"
            data-tour-target={simulator ? "pay-demo-order" : undefined}
            onClick={onPay}
            className="btn btn-primary min-h-[44px] flex-1 font-black text-sm"
          >
            Cobrar al Entregar
          </button>
        )}
      </div>
    </article>
  );
});
