import { memo } from "react";
import { Utensils, CheckCircle2, AlertCircle, X } from "lucide-react";
import type { Table } from "../../../../shared/types/realtime";
import { time } from "../../../../shared/ui/components";

export interface TableMapProps {
  tables: Table[];
  /** Flips the table: free becomes occupied, occupied becomes free. */
  onToggleTable: (tableNumber: number) => void;
  onClose?: () => void;
  /** Adds the tour targets used by the training; the live board carries none. */
  simulator?: boolean;
  /** Shown above the tables when the last change could not be saved. */
  notice?: string;
}

export const TableMap = memo(function TableMap({
  tables,
  onToggleTable,
  onClose,
  simulator = false,
  notice = "",
}: TableMapProps) {
  const occupiedCount = tables.filter((t) => t.status === "occupied").length;
  const availableCount = tables.length - occupiedCount;

  return (
    <div
      data-tour-target={simulator ? "table-map" : undefined}
      className="rounded-2xl border-2 border-stone-200 bg-[#FDFBF7] p-5 shadow-sm"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#2E94A5]/10 text-[#2E94A5]">
            <Utensils className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-stone-900">
              Control de Mesas · Comedor
            </h2>
            <p
              className="text-xs font-semibold text-stone-500"
              data-testid="table-counts"
            >
              <span className="font-bold text-[#2E94A5]">
                {availableCount} {availableCount === 1 ? "disponible" : "disponibles"}
              </span>
              {" · "}
              <span className="font-bold text-[#E03188]">
                {occupiedCount} {occupiedCount === 1 ? "ocupada" : "ocupadas"}
              </span>
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-xl border border-stone-300 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
            aria-label="Cerrar mapa de mesas"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <p className="mb-4 text-xs leading-relaxed text-stone-600">
        Toca una mesa cuando sientes a alguien, y tócala otra vez cuando se
        desocupe. Los clientes ven cuántas mesas hay libres cuando eligen «Comer
        aquí».
      </p>
      {notice && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-900"
        >
          {notice}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4">
        {tables.map((table) => {
          const isOccupied = table.status === "occupied";

          return (
            <button
              key={table.number}
              type="button"
              data-help="table-card"
              data-table-status={table.status}
              data-tour-target={simulator ? `table-card-${table.number}` : undefined}
              aria-label={`Mesa ${table.number}, ${isOccupied ? "ocupada" : "disponible"}. Toca para ${isOccupied ? "liberarla" : "marcarla ocupada"}.`}
              onClick={() => onToggleTable(table.number)}
              className={`group relative flex min-h-[120px] flex-col justify-between rounded-xl border-2 p-3.5 text-left transition-colors ${
                isOccupied
                  ? "border-[#E03188] bg-rose-50/70 text-[#E03188] hover:bg-rose-100/60"
                  : "border-[#2E94A5] bg-white text-[#2E94A5] hover:bg-cyan-50/40"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider opacity-80">
                    Mesa
                  </span>
                  <p className="text-2xl font-black tabular-nums leading-none">
                    #{table.number}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                    isOccupied
                      ? "bg-[#E03188] text-white"
                      : "bg-[#2E94A5] text-white"
                  }`}
                >
                  {isOccupied ? (
                    <>
                      <AlertCircle className="size-3" />
                      Ocupada
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-3" />
                      Disponible
                    </>
                  )}
                </span>
              </div>

              <div className="mt-2 border-t border-current/15 pt-2 text-xs">
                {isOccupied ? (
                  <div className="space-y-0.5 font-medium text-stone-800">
                    {table.occupiedSince && (
                      <p className="font-bold">
                        Desde las {time(table.occupiedSince)}
                      </p>
                    )}
                    <p className="text-[11px] font-bold text-stone-500 group-hover:text-[#E03188]">
                      Toca para liberar
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] font-bold text-stone-500 group-hover:text-[#2E94A5]">
                    Toca para marcar ocupada
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});
