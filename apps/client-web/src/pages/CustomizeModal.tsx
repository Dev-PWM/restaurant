import { useState } from "react";
import { Check, Star } from "lucide-react";
import type { MenuItem, Modifier, OrderInput } from "../../../../shared/types/realtime";
import { useRealtime } from "../../../../shared/ui/RealtimeProvider";
import { Modal, mxn, Quantity } from "../../../../shared/ui/components";
import { LineChoices } from "../../../../shared/ui/line-choices";
import { toppingName } from "../../../../shared/ui/choice-groups.js";
import { ownerDescription } from "../../../../shared/ui/dish-description.js";

type CartLine = OrderInput["items"][number];

/** Choices where the customer must pick exactly one of the dish's options. Mirrors REQUIRED_CHOICE_KINDS on the server. */
const REQUIRED_KINDS = ["masa", "prep"] as const;

export function itemAvailable(
  item: MenuItem,
  modifiers: { id: string; kind: string; available: boolean }[],
) {
  return (
    item.available &&
    REQUIRED_KINDS.every((kind) => {
      const options = modifiers.filter(
        (m) => item.modifierIds.includes(m.id) && m.kind === kind,
      );
      // A dish with every comal/frito option sold out cannot be ordered at all.
      return !options.length || options.some((m) => m.available);
    })
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * One yes/no decision as two big buttons. Both answers are always visible, so nobody has to guess what
 * "not ticked" means: the customer sees «Con cebolla» or «Sin cebolla» and the kitchen reads the same thing.
 */
function TwoWayChoice({
  name,
  title,
  hint,
  offLabel,
  onLabel,
  on,
  onChange,
  onDisabled = false,
  tone,
}: {
  name: string;
  title: string;
  hint?: string;
  offLabel: string;
  onLabel: string;
  on: boolean;
  onChange: (on: boolean) => void;
  /** Sold out: the «on» answer cannot be picked. */
  onDisabled?: boolean;
  /** «omit» colours the «on» answer red (a SIN); «add» colours it green (a CON). */
  tone: "omit" | "add";
}) {
  const onStyle = tone === "omit" ? "bg-red-600 text-white" : "bg-green-600 text-white";
  return (
    <fieldset
      className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white py-2.5 pr-2.5 pl-3.5"
      data-topping={name}
    >
      <legend className="sr-only">{title}</legend>
      <div className="min-w-0" aria-hidden="true">
        <span className="block text-[15px] font-bold leading-tight text-stone-900">{title}</span>
        {hint && (
          <span className={`mt-0.5 block text-xs ${onDisabled ? "font-semibold text-red-700" : "text-stone-500"}`}>
            {hint}
          </span>
        )}
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
        {([false, true] as const).map((value) => {
          const checked = on === value;
          const disabled = value && onDisabled;
          return (
            <label
              key={String(value)}
              className={`flex min-h-10 min-w-[4.5rem] items-center justify-center rounded-md px-3 text-sm font-bold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-clay-600 ${
                disabled
                  ? "cursor-not-allowed text-stone-300 line-through"
                  : checked
                    ? value
                      ? `${onStyle} shadow-sm`
                      : "bg-white text-stone-900 shadow-sm"
                    : "cursor-pointer text-stone-600 hover:bg-stone-200"
              }`}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(value)}
              />
              {value ? onLabel : offLabel}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
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
    // Masa keeps its first-available default. Comal/frito never does: the customer must choose, so the
    // kitchen never receives a ticket where nobody decided.
    const firstMasa = modifiers.find((m) => m.kind === "masa" && m.available);
    return firstMasa ? [firstMasa.id] : [];
  });
  const [quantity, setQuantity] = useState(1);

  const kindOf = (id: string) => modifiers.find((v) => v.id === id)?.kind;
  const missingChoice = REQUIRED_KINDS.some(
    (kind) =>
      modifiers.some((m) => m.kind === kind) &&
      !selected.some((id) => kindOf(id) === kind),
  );

  const valid =
    itemAvailable(item, modifiers) &&
    selected.every((id) => modifiers.find((m) => m.id === id)?.available) &&
    !missingChoice;

  const price =
    item.priceCents +
    modifiers
      .filter((m) => selected.includes(m.id))
      .reduce((sum, m) => sum + m.priceCents, 0);

  const prepModifiers = modifiers.filter((m) => m.kind === "prep");
  const masaModifiers = modifiers.filter((m) => m.kind === "masa");
  const specialModifiers = modifiers.filter((m) => m.kind === "special");
  const extraModifiers = modifiers.filter((m) => m.kind === "extra");
  const omitModifiers = modifiers.filter((m) => m.kind === "omit");
  const hasToppings = extraModifiers.length > 0 || omitModifiers.length > 0;
  // A dish may offer only some of these groups, so the step numbers count the ones shown.
  let step = 0;
  const prepStep = prepModifiers.length ? ++step : 0;
  const masaStep = masaModifiers.length ? ++step : 0;
  const specialStep = specialModifiers.length ? ++step : 0;
  const toppingsStep = hasToppings ? ++step : 0;

  const chosenSpecial = modifiers.find((m) => m.kind === "special" && selected.includes(m.id)) ?? null;
  const setChosen = (id: string, on: boolean) =>
    setSelected((prev) =>
      on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((other) => other !== id),
    );
  // What the kitchen will read, in the order the dish offers its options.
  const chosen = modifiers.filter((m) => selected.includes(m.id) && m.kind !== "masa");

  return (
    <Modal title={item.name} onClose={onClose}>
      {ownerDescription(item) && (
        <p className="mb-5 text-sm leading-relaxed text-stone-600">
          {ownerDescription(item)}
        </p>
      )}

      {/* 1. Cooking style (Required, no default) */}
      {prepModifiers.length > 0 && (
        <fieldset className="mb-6" data-testid="prep-choice">
          <legend className="eyebrow mb-2 flex w-full items-center justify-between gap-3 text-clay-700">
            <span>{prepStep}. ¿Cómo lo quieres?</span>
            <span className="text-[11px] font-bold text-clay-600 uppercase">
              Obligatorio · 1 opción
            </span>
          </legend>
          <div className="grid grid-cols-2 gap-2.5">
            {prepModifiers.map((m) => {
              const isSelected = selected.includes(m.id);
              return (
                <label
                  key={m.id}
                  className={`relative flex min-h-16 cursor-pointer items-center justify-between gap-2 rounded-xl border-2 p-3.5 transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-clay-600 ${
                    isSelected
                      ? "border-clay-600 bg-clay-50/60 shadow-2xs"
                      : "border-stone-200 bg-white hover:border-stone-300"
                  } ${!m.available ? "cursor-not-allowed bg-stone-100 opacity-40" : ""}`}
                >
                  <input
                    type="radio"
                    name="prep"
                    className="sr-only"
                    checked={isSelected}
                    disabled={!m.available}
                    onChange={() =>
                      setSelected((prev) => [
                        ...prev.filter((id) => kindOf(id) !== "prep"),
                        m.id,
                      ])
                    }
                  />
                  <span className="text-sm font-black leading-tight text-stone-900">
                    {m.name}
                  </span>
                  {!m.available ? (
                    <span className="text-xs font-semibold text-stone-600">
                      Agotado
                    </span>
                  ) : (
                    isSelected && (
                      <Check size={18} className="shrink-0 text-clay-700" />
                    )
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Masa Selection (Required) */}
      {masaModifiers.length > 0 && (
        <fieldset className="mb-6">
          <legend className="eyebrow mb-2 flex w-full items-center justify-between gap-3 text-clay-700">
            <span>{masaStep}. Elige tu masa</span>
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
                          ...prev.filter((id) => kindOf(id) !== "masa"),
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

      {/* 2. House special (Optional): ¡Izquierdo! on huaraches and sopes, ¡Derecho! on the rest */}
      {specialModifiers.length > 0 && (
        <fieldset className="mb-6" data-testid="special-choice">
          <legend className="eyebrow mb-2 flex w-full items-center justify-between gap-3 text-stone-700">
            <span>{specialStep}. Hazlo especial</span>
            <span className="text-[11px] font-medium text-stone-400">Opcional</span>
          </legend>
          <div className="space-y-2.5">
            {specialModifiers.map((m) => {
              const isSelected = selected.includes(m.id);
              return (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-clay-600 ${
                    isSelected
                      ? "border-amber-400 bg-amber-50"
                      : "border-stone-200 bg-white hover:border-stone-300"
                  } ${!m.available ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isSelected}
                    disabled={!m.available}
                    onChange={() => setChosen(m.id, !isSelected)}
                  />
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      isSelected ? "bg-stone-900 text-amber-300" : "bg-stone-100 text-stone-500"
                    }`}
                    aria-hidden="true"
                  >
                    <Star size={18} fill={isSelected ? "currentColor" : "none"} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      translate="no"
                      className="block text-base font-black leading-tight text-stone-900"
                    >
                      {m.name}
                    </span>
                    {m.detail && (
                      <span className="mt-0.5 block text-sm leading-snug text-stone-700">
                        Lleva: {m.detail.charAt(0).toLowerCase() + m.detail.slice(1)}.
                      </span>
                    )}
                    <span className="mt-1 block text-xs text-stone-500">
                      {!m.available
                        ? "Agotado hoy"
                        : m.priceCents
                          ? `+${mxn(m.priceCents)}`
                          : "Sin costo extra. Sin esto, se prepara normal."}
                    </span>
                  </span>
                  <span
                    className={`mt-1 shrink-0 rounded-md px-2.5 py-1 text-xs font-bold ${
                      isSelected ? "bg-stone-900 text-amber-300" : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {isSelected ? "Agregado" : "Agregar"}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* 3. Toppings: every one is an explicit yes or no */}
      {hasToppings && (
        <section className="mb-6" aria-labelledby="toppings-heading" data-testid="toppings">
          <h3
            id="toppings-heading"
            className="eyebrow mb-2 flex items-center justify-between gap-3 text-stone-700"
          >
            <span>{toppingsStep}. Toppings</span>
            <span className="text-[11px] font-medium text-stone-400">Elige Sí o No</span>
          </h3>
          {omitModifiers.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-semibold text-stone-500">
                Ya lleva. Dinos si lo quieres.
              </p>
              <div className="space-y-2">
                {omitModifiers.map((m) => (
                  <TwoWayChoice
                    key={m.id}
                    name={m.id}
                    title={capitalize(toppingName(m))}
                    offLabel="Con"
                    onLabel="Sin"
                    on={selected.includes(m.id)}
                    onChange={(on) => setChosen(m.id, on)}
                    onDisabled={!m.available}
                    hint={m.available ? undefined : "Agotado"}
                    tone="omit"
                  />
                ))}
              </div>
            </div>
          )}
          {extraModifiers.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-stone-500">Agrega a tu gusto.</p>
              <div className="space-y-2">
                {extraModifiers.map((m) => {
                  // ¡Derecho! already includes quesillo, so one more is a double portion.
                  const label = capitalize(
                    m.id.startsWith("quesillo-") && chosenSpecial?.id === "estilo-derecho"
                      ? `Con ${toppingName(m, chosenSpecial)}`
                      : m.name,
                  );
                  return (
                    <TwoWayChoice
                      key={m.id}
                      name={m.id}
                      title={label}
                      offLabel="No"
                      onLabel="Sí"
                      on={selected.includes(m.id)}
                      onChange={(on) => setChosen(m.id, on)}
                      onDisabled={!m.available}
                      hint={
                        !m.available
                          ? "Agotado"
                          : m.priceCents
                            ? `+${mxn(m.priceCents)} extra`
                            : "Gratis"
                      }
                      tone="add"
                    />
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* What the kitchen will read: the same blocks as the ticket */}
      {chosen.length > 0 && (
        <section
          className="mb-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3.5"
          aria-label="Así lo leerá la cocina"
          data-testid="kitchen-preview"
        >
          <p className="eyebrow">Así lo leerá la cocina</p>
          <LineChoices modifiers={chosen as Modifier[]} variant="soft" />
        </section>
      )}

      {/* Quantity & CTA */}
      <div className="mt-6 border-t border-stone-200 pt-5">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-sm font-bold text-stone-800">Cantidad</span>
          <Quantity value={quantity} onChange={setQuantity} />
        </div>

        {missingChoice && (
          <p
            role="status"
            className="mb-3 text-center text-xs font-semibold text-clay-800"
          >
            {prepModifiers.length > 0 &&
            !selected.some((id) => kindOf(id) === "prep")
              ? "Elige cómo lo quieres: al comal o frito."
              : "Elige una opción obligatoria para continuar."}
          </p>
        )}
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
