import { Flame, Star } from "lucide-react";
import type { Modifier } from "../types/realtime";
import { groupChoices, toppingName } from "./choice-groups.js";

/**
 * «kitchen» is for the cook: big, high-contrast, one colour per meaning. «soft» is the same structure in a
 * quieter voice for the customer's cart and order screen, so both read the same words in the same places.
 */
export type ChoicesVariant = "kitchen" | "soft";

/** Red = leave it off, green = add it, purple/amber = how it is cooked, dark gold = the house special. */
const PREP_STYLE: Record<string, string> = {
  "prep-comal": "bg-purple-700 text-white",
  "prep-frito": "bg-amber-500 text-stone-950",
};

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
  const chip = tone === "red" ? "bg-red-600 text-white" : "bg-green-600 text-white";
  const word = tone === "red" ? "text-red-700" : "text-green-700";
  return (
    <div className="flex items-start gap-2" data-choice-row={label.toLowerCase()}>
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

/** What one dish was ordered with, grouped the way a cook reads it: cooking, special, SIN, CON. */
export function LineChoices({
  modifiers,
  variant = "kitchen",
}: {
  modifiers: Modifier[];
  variant?: ChoicesVariant;
}) {
  const { prep, special, masa, without, extras } = groupChoices(modifiers);
  if (!prep && !special && !masa && !without.length && !extras.length) return null;
  const kitchen = variant === "kitchen";
  return (
    <div className={`space-y-1.5 ${kitchen ? "mt-2.5" : "mt-1.5"}`} data-line-choices>
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
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-black uppercase leading-tight ${
                PREP_STYLE[prep.id] ?? "bg-stone-700 text-white"
              } ${kitchen ? "text-[13px]" : "text-xs"}`}
            >
              {prep.id === "prep-comal" && <Flame size={kitchen ? 14 : 12} aria-hidden="true" />}
              {prep.name}
            </span>
          )}
        </div>
      )}
      {special && (
        <div
          data-modifier-kind="special"
          className="rounded-lg border-2 border-amber-400 bg-stone-900 px-3 py-2 text-amber-300"
        >
          <p
            className={`flex items-center gap-1.5 font-black uppercase tracking-wide ${kitchen ? "text-sm" : "text-xs"}`}
          >
            <Star size={kitchen ? 15 : 13} fill="currentColor" aria-hidden="true" />
            Especial <span translate="no">{special.name}</span>
          </p>
          {special.detail && (
            <p className={`mt-0.5 font-medium text-stone-100 ${kitchen ? "text-sm" : "text-xs"}`}>
              {special.detail}
            </p>
          )}
        </div>
      )}
      <ToppingRow
        label="Sin"
        tone="red"
        kitchen={kitchen}
        items={without.map((m) => toppingName(m))}
      />
      <ToppingRow
        label="Con"
        tone="green"
        kitchen={kitchen}
        items={extras.map((m) => toppingName(m, special))}
      />
    </div>
  );
}
