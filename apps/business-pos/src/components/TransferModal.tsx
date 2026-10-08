import React, { memo, useState } from "react";
import { Building2, Copy, Check, AlertTriangle, ShieldCheck, X } from "lucide-react";
import { BBVA_BANK_INFO } from "../../../../shared/types/zapata";
import { mxn } from "../../../../shared/ui/components";

export interface TransferModalProps {
  orderTotalCents: number;
  orderNumber?: string | number;
  customerName?: string;
  onClose: () => void;
  onConfirmReceived?: () => void;
  simulator?: boolean;
}

export const TransferModal = memo(function TransferModal({
  orderTotalCents,
  orderNumber,
  customerName,
  onClose,
  onConfirmReceived,
  simulator = false,
}: TransferModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(BBVA_BANK_INFO.clabe).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div
        data-tour-target={simulator ? "spei-modal" : undefined}
        className="w-full max-w-lg rounded-2xl border-2 border-stone-200 bg-[#FDFBF7] p-6 shadow-2xl transition-all"
      >
        <div className="flex items-start justify-between border-b border-stone-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <Building2 className="size-6" />
            </div>
            <div>
              <h2
                id="transfer-modal-title"
                className="text-xl font-black tracking-tight text-stone-900"
              >
                Transferencia SPEI · BBVA
              </h2>
              <p className="text-xs font-semibold text-stone-500">
                Pago directo de banco a banco sin comisiones
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-xl border border-stone-300 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
            aria-label="Cerrar modal de transferencia"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="my-5 rounded-xl border border-blue-200 bg-blue-50/70 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-stone-700">Monto exacto a transferir:</span>
            <strong className="text-3xl font-black tabular-nums text-blue-900">
              {mxn(orderTotalCents)}
            </strong>
          </div>
          {(orderNumber || customerName) && (
            <div className="mt-2 text-xs font-medium text-stone-600">
              {orderNumber && <span className="mr-2">Orden #{orderNumber}</span>}
              {customerName && <span>Cliente: {customerName}</span>}
            </div>
          )}
        </div>

        <div className="space-y-3.5 rounded-xl border border-stone-200 bg-white p-4">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-stone-500">
              Banco Receptor
            </span>
            <p className="text-base font-bold text-stone-900">{BBVA_BANK_INFO.bank}</p>
          </div>

          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-stone-500">
              Titular de la Cuenta
            </span>
            <p className="text-base font-bold text-stone-900">{BBVA_BANK_INFO.beneficiary}</p>
          </div>

          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-stone-500">
              CLABE Interbancaria (18 dígitos)
            </span>
            <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border-2 border-stone-300 bg-stone-50 p-2.5">
              <code className="text-base font-mono font-black tracking-wider text-stone-900">
                {BBVA_BANK_INFO.clabe}
              </code>
              <button
                type="button"
                data-tour-target={simulator ? "btn-copy-clabe" : undefined}
                onClick={handleCopy}
                className="flex min-h-[38px] items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-stone-800"
              >
                {copied ? (
                  <>
                    <Check className="size-4 text-emerald-400" />
                    <span>¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    <span>Copiar CLABE</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <p>
            <strong>Cajero:</strong> Verifica la notificación en la aplicación móvil de BBVA antes de confirmar la entrega del pedido.
          </p>
        </div>

        {onConfirmReceived && (
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn flex-1 border-stone-300 bg-stone-100 font-bold text-stone-700 hover:bg-stone-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              data-tour-target={simulator ? "confirm-spei-payment" : undefined}
              onClick={onConfirmReceived}
              className="btn flex-1 bg-blue-600 font-bold text-white hover:bg-blue-700"
            >
              <ShieldCheck className="size-5" />
              Confirmar Recepción SPEI
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
