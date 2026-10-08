import React, { memo, useState } from "react";
import { PlusCircle, Sparkles, X, Check, Flame, HelpCircle } from "lucide-react";
import type {
  MenuItem,
  ZapataCategory,
} from "../../../../shared/types/zapata";
import {
  getQuesilloPriceForCategory,
  allowsGreaseChoiceForCategory,
} from "../../../../shared/types/zapata";
import { mxn } from "../../../../shared/ui/components";

export interface CustomDishModalProps {
  onClose: () => void;
  onSave: (dish: MenuItem) => void;
  simulator?: boolean;
}

export const CustomDishModal = memo(function CustomDishModal({
  onClose,
  onSave,
  simulator = false,
}: CustomDishModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ZapataCategory>("huaraches");
  const [priceInput, setPriceInput] = useState("");
  const [description, setDescription] = useState("");

  const quesilloPrice = getQuesilloPriceForCategory(category);
  const allowsQuesillo = quesilloPrice > 0;
  const allowsGrease = allowsGreaseChoiceForCategory(category);

  const parsedPrice = parseFloat(priceInput);
  const isValidPrice = !isNaN(parsedPrice) && parsedPrice > 0;
  const priceCents = Math.round((isValidPrice ? parsedPrice : 0) * 100);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !isValidPrice) return;

    const newDish: MenuItem = {
      id: `custom-${category}-${Date.now()}`,
      name: name.trim(),
      category,
      basePrice: parsedPrice,
      allowsQuesillo,
      quesilloPrice,
      allowsGreaseChoice: allowsGrease,
      description: description.trim() || `Platillo especial: ${name.trim()}`,
    };

    onSave(newDish);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-dish-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div
        data-tour-target={simulator ? "custom-dish-modal" : undefined}
        className="w-full max-w-lg rounded-2xl border-2 border-stone-200 bg-[#FDFBF7] p-6 shadow-2xl transition-all"
      >
        <div className="flex items-start justify-between border-b border-stone-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-[#2E94A5] text-white shadow-xs">
              <Sparkles className="size-6" />
            </div>
            <div>
              <h2
                id="custom-dish-title"
                className="text-xl font-black tracking-tight text-stone-900"
              >
                Crear Nuevo Platillo
              </h2>
              <p className="text-xs font-semibold text-stone-500">
                Inventario dinámico · Los Huaraches de Zapata
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-xl border border-stone-300 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
            aria-label="Cerrar modal"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-stone-700">
              Nombre del Platillo *
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Huarache de Costilla Especial"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-xl border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-900 font-semibold focus:border-[#2E94A5] focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-stone-700">
                Categoría *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ZapataCategory)}
                className="mt-1.5 w-full rounded-xl border-2 border-stone-300 bg-white px-3 py-2.5 font-bold text-stone-900 focus:border-[#2E94A5] focus:outline-hidden"
              >
                <option value="huaraches">Huaraches (+$10 Quesillo)</option>
                <option value="gorditas">Gorditas (+$10 Quesillo)</option>
                <option value="sopes">Sopes (+$5 Quesillo)</option>
                <option value="quesadillas">Quesadillas (+$5 Quesillo)</option>
                <option value="pambazos">Pambazos (+$5 Quesillo)</option>
                <option value="especiales">Especiales de Zapata</option>
                <option value="bebidas">Bebidas</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-stone-700">
                Precio Base (MXN) *
              </label>
              <div className="relative mt-1.5">
                <span className="absolute left-3.5 top-2.5 font-bold text-stone-500">$</span>
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  required
                  placeholder="0.00"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-full rounded-xl border-2 border-stone-300 bg-white py-2.5 pl-8 pr-4 text-stone-900 font-bold tabular-nums focus:border-[#2E94A5] focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-stone-700">
              Descripción Corta (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ingredientes o notas para el cliente..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5 w-full rounded-xl border-2 border-stone-300 bg-white px-4 py-2 text-sm text-stone-900 focus:border-[#2E94A5] focus:outline-hidden"
            />
          </div>

          {/* Smart Automation Rules Preview */}
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-xs">
            <p className="font-black uppercase tracking-wider text-stone-500 mb-2">
              Reglas Automáticas de Zapata
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-stone-700">Extra Quesillo:</span>
                {allowsQuesillo ? (
                  <span className="font-bold text-[#E03188] bg-rose-50 px-2 py-0.5 rounded-md border border-[#E03188]/30">
                    +${quesilloPrice}.00 MXN
                  </span>
                ) : (
                  <span className="text-stone-500">No aplica</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-700">Selector Grasa / Al Comal Seco:</span>
                <span className={`font-bold ${allowsGrease ? "text-purple-700" : "text-stone-500"}`}>
                  {allowsGrease ? "Habilitado (Gratis)" : "Deshabilitado"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-700">Personalización de Verduras (Cebolla, Cilantro, etc.):</span>
                <span className="font-bold text-emerald-700">
                  Gratis ($0.00)
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn flex-1 border-stone-300 bg-stone-100 font-bold text-stone-700 hover:bg-stone-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !isValidPrice}
              className="btn flex-1 bg-[#2E94A5] font-black text-white hover:bg-[#257b8a] disabled:opacity-50"
            >
              <PlusCircle className="size-5" />
              Guardar Platillo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});
