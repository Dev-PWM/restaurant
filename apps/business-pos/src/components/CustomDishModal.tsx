import { memo, useState, type FormEvent } from "react";
import { PlusCircle, Sparkles } from "lucide-react";
import type {
  Commands,
  MenuItem,
  Modifier,
} from "../../../../shared/types/realtime";
import { uuid } from "../../../../shared/ui/RealtimeProvider";
import { Modal, centsOf, mxn } from "../../../../shared/ui/components";

/** Sections a dish can live in, in menu order. The server holds the same list and refuses anything else. */
const CATEGORIES = [
  "Huaraches",
  "Gorditas",
  "Sopes",
  "Quesadillas",
  "Pambazos",
  "Especiales de Zapata",
  "Bebidas",
] as const;

export type NewDish = Commands["admin_add_menu_item"];

/** What the practice form starts with. Never sent anywhere: practice reports the tap and stores nothing. */
const PRACTICE_DISH = { name: "Huarache de Costilla", price: "120.50" } as const;

export interface CustomDishModalProps {
  onClose: () => void;
  /** Resolves to an error message to show, or null when the dish was saved. */
  onSubmit: (dish: NewDish) => Promise<string | null>;
  /** Today's menu, used only to show what a dish in the chosen section will offer. */
  menuItems: MenuItem[];
  modifiers: Modifier[];
  simulator?: boolean;
}

/** What a new dish in this section gets: the same as the dishes already there. */
function rulesFor(category: string, menuItems: MenuItem[], modifiers: Modifier[]) {
  const sample = menuItems.find((item) => item.category === category);
  const offered = modifiers.filter((m) => sample?.modifierIds.includes(m.id));
  return {
    quesilloCents:
      offered.find((m) => m.kind === "extra" && m.id.startsWith("quesillo-"))
        ?.priceCents ?? 0,
    cookingChoice: offered.some((m) => m.kind === "prep"),
    toppings: offered.some((m) => m.kind === "omit" || m.kind === "extra"),
  };
}

export const CustomDishModal = memo(function CustomDishModal({
  onClose,
  onSubmit,
  menuItems,
  modifiers,
  simulator = false,
}: CustomDishModalProps) {
  // Practice opens with a believable dish already typed, so the lesson is about the form and not about typing.
  const [name, setName] = useState(simulator ? PRACTICE_DISH.name : "");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [priceInput, setPriceInput] = useState(simulator ? PRACTICE_DISH.price : "");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // One id per dialog: if the answer is lost and the cashier taps save again, the server sees the same dish.
  const [id] = useState(uuid);

  const priceCents = centsOf(priceInput.trim());
  const valid = name.trim().length > 0 && priceCents !== null && priceCents > 0;
  const rules = rulesFor(category, menuItems, modifiers);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid || saving || priceCents === null) return;
    setSaving(true);
    setError("");
    const problem = await onSubmit({
      id,
      name: name.trim(),
      category,
      priceCents,
      ...(description.trim() ? { description: description.trim() } : {}),
    });
    setSaving(false);
    if (problem) setError(problem);
    else onClose();
  }

  return (
    <Modal
      title="Crear nuevo platillo"
      onClose={onClose}
      layer={simulator ? "inline" : "native"}
      closeTarget={simulator ? "close-custom-dish" : undefined}
    >
      <form
        onSubmit={(event) => void handleSubmit(event)}
        data-tour-target={simulator ? "custom-dish-modal" : undefined}
        className="space-y-4"
      >
        <div className="flex items-center gap-3 border-b border-stone-200 pb-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#2E94A5] text-white">
            <Sparkles className="size-5" />
          </div>
          <p className="text-sm text-stone-600">
            El platillo aparece en el menú de los clientes al instante, con las
            mismas opciones que los demás de su sección.
          </p>
        </div>

        <label className="block text-xs font-black uppercase tracking-wider text-stone-700">
          Nombre del platillo *
          <input
            data-tour-target={simulator ? "custom-dish-name" : undefined}
            className="field mt-1.5 w-full text-base font-semibold normal-case tracking-normal"
            type="text"
            maxLength={60}
            placeholder="Ej. Huarache de Costilla"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-xs font-black uppercase tracking-wider text-stone-700">
            Sección *
            <select
              data-tour-target={simulator ? "custom-dish-category" : undefined}
              className="field mt-1.5 w-full text-base font-bold normal-case tracking-normal"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-black uppercase tracking-wider text-stone-700">
            Precio (MXN) *
            <input
              data-tour-target={simulator ? "custom-dish-price" : undefined}
              className="field mt-1.5 w-full text-base font-bold tabular-nums normal-case tracking-normal"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={priceInput}
              onChange={(event) => setPriceInput(event.target.value)}
              aria-invalid={priceInput !== "" && priceCents === null}
            />
          </label>
        </div>

        <label className="block text-xs font-black uppercase tracking-wider text-stone-700">
          Descripción corta (opcional)
          <input
            className="field mt-1.5 w-full text-sm normal-case tracking-normal"
            type="text"
            maxLength={140}
            placeholder="Ingredientes o notas para el cliente…"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <div
          className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-xs"
          data-testid="custom-dish-rules"
          data-tour-target={simulator ? "custom-dish-rules" : undefined}
        >
          <p className="mb-2 font-black uppercase tracking-wider text-stone-500">
            Opciones que tendrá en «{category}»
          </p>
          <ul className="space-y-1.5 text-stone-700">
            <li className="flex justify-between gap-3">
              <span>Con quesillo</span>
              <strong>
                {rules.quesilloCents ? `+${mxn(rules.quesilloCents)}` : "No aplica"}
              </strong>
            </li>
            <li className="flex justify-between gap-3">
              <span>«Al comal» o «Frito» (obligatorio)</span>
              <strong>{rules.cookingChoice ? "Sí" : "No aplica"}</strong>
            </li>
            <li className="flex justify-between gap-3">
              <span>Sin cebolla, sin cilantro, salsas</span>
              <strong>{rules.toppings ? "Gratis" : "No aplica"}</strong>
            </li>
          </ul>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900"
          >
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="btn flex-1 border-stone-300 bg-stone-100 font-bold text-stone-700 hover:bg-stone-200"
          >
            Cancelar
          </button>
          <button
            type="submit"
            data-tour-target={simulator ? "save-custom-dish" : undefined}
            disabled={!valid || saving}
            className="btn btn-primary flex-1 font-black disabled:opacity-50"
          >
            <PlusCircle className="size-5" />
            {saving ? "Guardando…" : "Guardar platillo"}
          </button>
        </div>
      </form>
    </Modal>
  );
});
