import { useState } from "react";
import { Check, Flame, Minus, Plus, Utensils, X } from "lucide-react";
import type { MenuItem, Modifier, OrderInput } from "../../../../shared/types/realtime";
import { useRealtime } from "../../../../shared/ui/RealtimeProvider";
import { Modal, mxn, Quantity } from "../../../../shared/ui/components";

type CartLine = OrderInput["items"][number];

export function itemAvailable(
  item: MenuItem,
  modifiers: { id: string; kind: string; available: boolean }[],
) {
  const masas = modifiers.filter(
    (m) => item.modifierIds.includes(m.id) && m.kind === "masa",
  );
  return item.available && (!masas.length || masas.some((m) => m.available));
}

export function CustomizeModal({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const { snapshot } = useRealtime();
  const modifiers = snapshot
    ? snapshot.modifiers.filter((m) => item.modifierIds.includes(m.id))
    : [];

  const [selected, setSelected] = useState<string[]>(() => {
    const firstMasa = modifiers.find((m) => m.kind === "masa" && m.available);
    return firstMasa ? [firstMasa.id] : [];
  });
  const [quantity, setQuantity] = useState(1);

  const hasMasa = modifiers.some((m) => m.kind === "masa");
  const selectedMasaId = selected.find(
    (id) => modifiers.find((v) => v.id === id)?.kind === "masa",
  );

  const valid =
    itemAvailable(item, modifiers) &&
    selected.every((id) => modifiers.find((m) => m.id === id)?.available) &&
    (!hasMasa || Boolean(selectedMasaId));

  const price =
    item.priceCents +
    modifiers
      .filter((m) => selected.includes(m.id))
      .reduce((sum, m) => sum + m.priceCents, 0);

  const masaModifiers = modifiers.filter((m) => m.kind === "masa");
  const extraModifiers = modifiers.filter((m) => m.kind === "extra");
  const omitModifiers = modifiers.filter((m) => m.kind === "omit");

  return (
    <Modal title={item.name} onClose={onClose}>
      <p className="mb-5 text-sm leading-relaxed text-stone-600">
        {item.description}
      </p>

      {/* 1. Masa Selection (Required) */}
      {masaModifiers.length > 0 && (
        <fieldset className="mb-6">
          <legend className="eyebrow mb-2 flex items-center justify-between text-clay-700">
            <span>1. Elige tu masa</span>
            <span className="text-[11px] font-bold text-clay-600 uppercase">
              Obligatorio · 1 opción
            </span>
          </legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {masaModifiers.map((m) => {
              const isSelected = selected.includes(m.id);
              const isBlue =
                m.name.toLowerCase().includes("azul") || m.id.includes("blue");

              return (
                <label
                  key={m.id}
                  className={`relative flex min-h-14 cursor-pointer items-center justify-between rounded-xl border-2 p-3.5 transition-all ${
                    isSelected
                      ? "border-clay-600 bg-clay-50/60 shadow-2xs"
                      : "border-stone-200 bg-white hover:border-stone-300"
                  } ${!m.available ? "cursor-not-allowed opacity-40 bg-stone-100" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="masa"
                      checked={isSelected}
                      disabled={!m.available}
                      className="h-4 w-4 text-clay-600 focus:ring-0"
                      onChange={() =>
                        setSelected((prev) => [
                          ...prev.filter(
                            (id) =>
                              modifiers.find((v) => v.id === id)?.kind !==
                              "masa",
                          ),
                          m.id,
                        ])
                      }
                    />
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-stone-900 text-sm">
                        <span>{m.name}</span>
                        {isBlue && (
                          <span className="rounded bg-indigo-100 px-1.5 py-0.2 text-[10px] font-bold text-indigo-900">
                            Criollo
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-stone-500">
                        {isBlue ? "Sabor terroso tradicional" : "Masa clásica de maíz"}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-stone-600">
                    {!m.available ? "Agotado" : "Incluido"}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* 2. Extras (Optional) */}
      {extraModifiers.length > 0 && (
        <fieldset className="mb-6">
          <legend className="eyebrow mb-2 flex items-center justify-between text-stone-700">
            <span>2. Ingredientes extra</span>
            <span className="text-[11px] font-medium text-stone-400">
              Opcional
            </span>
          </legend>
          <div className="space-y-2">
            {extraModifiers.map((m) => {
              const isSelected = selected.includes(m.id);
              return (
                <label
                  key={m.id}
                  className={`flex min-h-12 cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors ${
                    isSelected
                      ? "border-emerald-600 bg-emerald-50/50"
                      : "border-stone-200 bg-white hover:border-stone-300"
                  } ${!m.available ? "opacity-40" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!m.available}
                      className="h-4 w-4 rounded text-emerald-700 focus:ring-0"
                      onChange={() =>
                        setSelected((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== m.id)
                            : [...prev, m.id],
                        )
                      }
                    />
                    <span className="text-sm font-semibold text-stone-900">
                      {m.name}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-emerald-800">
                    {!m.available
                      ? "Agotado"
                      : m.priceCents
                        ? `+${mxn(m.priceCents)}`
                        : "Gratis"}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* 3. Omits (No Cebolla, No Cilantro) */}
      {omitModifiers.length > 0 && (
        <fieldset className="mb-6">
          <legend className="eyebrow mb-2 flex items-center justify-between text-stone-700">
            <span>3. Preferencias de preparación</span>
            <span className="text-[11px] font-medium text-stone-400">
              Exclusiones
            </span>
          </legend>
          <div className="space-y-2">
            {omitModifiers.map((m) => {
              const isSelected = selected.includes(m.id);
              return (
                <label
                  key={m.id}
                  className={`flex min-h-12 cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors ${
                    isSelected
                      ? "border-red-400 bg-red-50/60"
                      : "border-stone-200 bg-white hover:border-stone-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      className="h-4 w-4 rounded text-red-600 focus:ring-0"
                      onChange={() =>
                        setSelected((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== m.id)
                            : [...prev, m.id],
                        )
                      }
                    />
                    <span className="text-sm font-medium text-stone-800">
                      {m.name}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="text-[11px] font-bold text-red-700">
                      Sin este ingrediente
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Quantity & CTA */}
      <div className="mt-6 border-t border-stone-200 pt-5">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-sm font-bold text-stone-800">Cantidad</span>
          <Quantity value={quantity} onChange={setQuantity} />
        </div>

        <button
          className="btn btn-primary w-full text-base py-3"
          disabled={!valid}
          onClick={() => {
            onAdd({ menuItemId: item.id, quantity, modifierIds: selected });
            onClose();
          }}
        >
          Agregar al pedido · {mxn(price * quantity)} MXN
        </button>
      </div>
    </Modal>
  );
}
