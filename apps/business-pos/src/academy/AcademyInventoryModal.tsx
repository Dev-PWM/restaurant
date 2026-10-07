import { Check, Minus, X, SlidersHorizontal } from "lucide-react";

interface GhostItem {
  id: string;
  name: string;
  available: boolean;
}

interface AcademyInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: GhostItem[];
  onToggleItem: (id: string) => void;
  guidedTarget: string | null;
  onToggleAllowed: boolean;
}

export function AcademyInventoryModal({
  isOpen,
  onClose,
  items,
  onToggleItem,
  guidedTarget,
  onToggleAllowed,
}: AcademyInventoryModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-lg rounded-3xl border-2 border-stone-700 bg-stone-900 text-stone-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 bg-stone-950 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-yellow-400 text-stone-950 font-black">
              <SlidersHorizontal className="size-5 stroke-[2.5]" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-white">
                Inventario & Disponibilidad (86)
              </h2>
              <p className="text-xs text-yellow-400 font-bold">
                Módulo 4: Pánico y Agotados · Modo Práctica
              </p>
            </div>
          </div>
          <button
            type="button"
            data-tour-target="close-inventory"
            data-tour-action="inventory-close"
            onClick={onClose}
            className={`rounded-full p-2 text-stone-400 hover:bg-stone-800 hover:text-white ${
              guidedTarget === "close-inventory" ? "relative z-50 ring-4 ring-yellow-400 bg-stone-800 text-white" : ""
            }`}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-stone-300">
            Al marcar un platillo como <strong>Agotado (86)</strong>, el sistema bloquea inmediatamente su venta en la app de los comensales.
          </p>

          <div className="divide-y divide-stone-800 rounded-2xl bg-stone-950 border border-stone-800 p-2">
            {items.map((item) => {
              const isTargetItem = item.id === "gordita-chicharron" || item.name.toLowerCase().includes("chicharrón");
              const isHighlighted = guidedTarget === "toggle-86-gordita" && isTargetItem;

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 p-3 rounded-xl transition-all ${
                    isHighlighted ? "bg-amber-950/40 border border-yellow-400/50" : ""
                  }`}
                >
                  <div>
                    <span className="font-bold text-sm text-stone-100 block">
                      {item.name}
                    </span>
                    <span className="text-[11px] text-stone-400">
                      {item.available ? "Disponible en menú móvil" : "Bloqueado para clientes (86)"}
                    </span>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.available}
                    aria-label={`Disponibilidad de ${item.name}`}
                    data-tour-target={isTargetItem ? "toggle-86-gordita" : undefined}
                    data-tour-action={isTargetItem ? "toggle-stock" : undefined}
                    onClick={() => {
                      if (isHighlighted && !onToggleAllowed) return;
                      onToggleItem(item.id);
                    }}
                    className={`flex min-h-11 min-w-24 items-center justify-center gap-2 rounded-full px-3 text-xs font-black transition-all ${
                      item.available
                        ? "bg-emerald-700 text-white hover:bg-emerald-600"
                        : "bg-red-900/80 text-red-200 border border-red-700 hover:bg-red-800"
                    } ${isHighlighted ? "relative z-50 ring-4 ring-yellow-400 ring-offset-2 ring-offset-stone-900" : ""}`}
                  >
                    <span
                      className={`flex size-4 items-center justify-center rounded-full text-black ${
                        item.available ? "bg-white" : "bg-red-400"
                      }`}
                    >
                      {item.available ? <Check className="size-3 stroke-[3]" /> : <Minus className="size-3 stroke-[3]" />}
                    </span>
                    {item.available ? "Disponible" : "Agotado (86)"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
