import { Check, X } from "lucide-react";
import type { Modifier, OrderLine } from "../types/realtime";
import { groupChoices, specialLabel, toppingName } from "./choice-groups.js";

/**
 * «kitchen» is for the cook: big, high-contrast, one colour per meaning. «soft» is the same structure in a
 * quieter voice for the customer's cart and order screen, so both read the same words in the same places.
 */
export type ChoicesVariant = "kitchen" | "soft";

function ToppingRow({
  label,
  tone,
  items,
  kitchen,
}: {
  label: string;
  tone: "red" | "green";
  items: string[];
  kitchen: boolean;
}) {
  if (!items.length) return null;
  const chip =
    tone === "red" ? "bg-red-600 text-white" : "bg-green-600 text-white";
  const word = tone === "red" ? "text-red-700" : "text-green-700";
  return (
    <div
      className="flex items-start gap-2"
      data-choice-row={label.toLowerCase()}
    >
      <span
        className={`mt-0.5 w-9 shrink-0 text-[11px] font-black uppercase tracking-wider ${word}`}
      >
        {label}
      </span>
      <ul className="flex min-w-0 flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            className={`rounded-md px-2 py-0.5 font-bold ${chip} ${kitchen ? "text-sm" : "text-xs"}`}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What one dish was ordered with, grouped the way a cook reads it. */
export function LineChoices({
  modifiers,
  toppingChoices,
  variant = "kitchen",
}: {
  modifiers: Modifier[];
  toppingChoices?: OrderLine["toppingChoices"];
  variant?: ChoicesVariant;
}) {
  const { prep, special, masa, without, extras } = groupChoices(modifiers);
  if (
    !prep &&
    !special &&
    !masa &&
    !without.length &&
    !extras.length &&
    !toppingChoices?.length
  )
    return null;
  const kitchen = variant === "kitchen";
  return (
    <div
      className={`space-y-2 ${kitchen ? "mt-2.5" : "mt-1.5"}`}
      data-line-choices
    >
      {(prep || masa) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {masa && (
            <span className="rounded-md bg-stone-200 px-2 py-0.5 text-xs font-bold text-stone-800">
              {masa.name}
            </span>
          )}
          {prep && (
            <span
              data-modifier-kind="prep"
              className={`inline-flex items-center rounded-md bg-stone-100 px-2.5 py-1 font-bold leading-tight text-stone-800 ${kitchen ? "text-sm" : "text-xs"}`}
            >
              {prep.name}
            </span>
          )}
        </div>
      )}
      {special && (
        <div
          data-modifier-kind="special"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950"
        >
          <p className={`font-bold ${kitchen ? "text-sm" : "text-xs"}`}>
            ESPECIALES DE ZAPATA
          </p>
          <p
            className={`mt-0.5 text-amber-950 ${kitchen ? "text-sm" : "text-xs"}`}
          >
            {special.detail || specialLabel(special)}
          </p>
        </div>
      )}
      {toppingChoices && toppingChoices.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5" aria-label="Ingredientes">
          {toppingChoices.map((choice) => (
            <span
              key={choice.id}
              className={`flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 font-semibold ${kitchen ? "text-xs" : "text-[11px]"} ${choice.included ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}
            >
              {choice.included ? (
                <Check size={13} aria-hidden="true" />
              ) : (
                <X size={13} aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 capitalize">{choice.name}</span>
              <span className="sr-only">{choice.included ? "Sí" : "No"}</span>
            </span>
          ))}
        </div>
      )}
      {!toppingChoices && (
        <ToppingRow
          label="Sin"
          tone="red"
          kitchen={kitchen}
          items={without.map((m) => toppingName(m))}
        />
      )}
      {!toppingChoices && (
        <ToppingRow
          label="Con"
          tone="green"
          kitchen={kitchen}
          items={extras.map((m) => toppingName(m, special))}
        />
      )}
    </div>
  );
}
