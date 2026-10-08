import React, { memo } from "react";
import { Utensils, Users, CheckCircle2, AlertCircle, X } from "lucide-react";
import type { TableInfo } from "../../../../shared/types/zapata";
import { mxn } from "../../../../shared/ui/components";

export interface TableMapProps {
  tables: TableInfo[];
  onSelectTable: (tableNumber: number) => void;
  onClose?: () => void;
  selectedTableNumber?: number | null;
  simulator?: boolean;
}

export const TableMap = memo(function TableMap({
  tables,
  onSelectTable,
  onClose,
  selectedTableNumber,
  simulator = false,
}: TableMapProps) {
  const occupiedCount = tables.filter((t) => t.status === "occupied").length;
  const availableCount = tables.length - occupiedCount;

  return (
    <div
      data-tour-target={simulator ? "table-map" : undefined}
      className="rounded-2xl border-2 border-stone-200 bg-[#FDFBF7] p-5 shadow-sm transition-all"
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
            <p className="text-xs font-semibold text-stone-500">
              <span className="font-bold text-[#2E94A5]">{availableCount} disponibles</span>
              {" · "}
              <span className="font-bold text-[#E03188]">{occupiedCount} ocupadas</span>
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

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4">
        {tables.map((table) => {
          const isOccupied = table.status === "occupied";
          const isSelected = selectedTableNumber === table.number;

          return (
            <button
              key={table.number}
              type="button"
              data-tour-target={simulator ? `table-card-${table.number}` : undefined}
              onClick={() => onSelectTable(table.number)}
              className={`group relative flex min-h-[120px] flex-col justify-between rounded-xl border-2 p-3.5 text-left transition-all ${
                isSelected
                  ? "ring-4 ring-[#2E94A5] ring-offset-2"
                  : ""
              } ${
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
                    <p className="truncate font-bold">
                      {table.customerName || "Cliente"}
                    </p>
                    {table.activeOrderTotalCents !== undefined && (
                      <p className="font-black tabular-nums text-[#E03188]">
                        Cuenta: {mxn(table.activeOrderTotalCents)}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] font-bold text-stone-500 group-hover:text-[#2E94A5]">
                    + Toca para abrir cuenta
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
