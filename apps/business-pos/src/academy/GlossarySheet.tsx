import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { GLOSSARY } from "./glossary.js";

/**
 * The cheat sheet: every control, what it is for, what it does in the system and why it
 * matters. It reads the same glossary as the walkthrough and explore mode, so the three
 * can never disagree. It works on the live board too (the «Ayuda» button).
 */
export function GlossarySheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = GLOSSARY.filter(
      (entry) =>
        !needle ||
        [entry.label, entry.purpose, entry.effect, entry.why, entry.group]
          .join(" ")
          .toLowerCase()
          .includes(needle),
    );
    const byGroup = new Map<string, typeof matches>();
    for (const entry of matches)
      byGroup.set(entry.group, [...(byGroup.get(entry.group) ?? []), entry]);
    return [...byGroup.entries()];
  }, [query]);
  if (!open) return null;
  return createPortal(
    <div className="z-layer-academy-top fixed inset-0 flex items-end justify-center bg-black/65 sm:items-center sm:p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Glosario de botones"
        tabIndex={-1}
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border-2 border-yellow-400 bg-stone-900 pb-[env(safe-area-inset-bottom)] text-white shadow-2xl outline-none sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-stone-700 p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-yellow-300">
              Glosario
            </p>
            <h2 className="text-xl font-black">Qué hace cada botón</h2>
          </div>
          <button
            type="button"
            data-tour-allow="glossary-close"
            onClick={onClose}
            aria-label="Cerrar glosario"
            className="btn min-h-11 min-w-11 rounded-xl border-stone-600 bg-stone-800 text-white"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>
        <label className="relative block border-b border-stone-700 p-3">
          <span className="sr-only">Buscar un botón</span>
          <Search
            className="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-stone-400"
            aria-hidden="true"
          />
          <input
            type="search"
            data-tour-allow="glossary-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar: cobrar, inventario, deshacer…"
            className="field min-h-11 border-stone-600 bg-stone-800 pl-9 text-sm text-white placeholder:text-stone-400"
          />
        </label>
        <div className="space-y-5 overflow-y-auto overscroll-contain p-4">
          {groups.length === 0 && (
            <p className="py-8 text-center text-sm text-stone-300">
              No encontré ese botón. Prueba con otra palabra.
            </p>
          )}
          {groups.map(([group, entries]) => (
            <section key={group}>
              <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-yellow-300">
                {group}
              </h3>
              <ul className="space-y-2">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-2xl border border-stone-700 bg-stone-800/70 p-3 text-sm"
                  >
                    <p className="font-black text-white">{entry.label}</p>
                    <dl className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-stone-200">
                      <div>
                        <dt className="font-bold text-yellow-200">
                          ¿Para qué sirve?
                        </dt>
                        <dd>{entry.purpose}</dd>
                      </div>
                      <div>
                        <dt className="font-bold text-amber-300">
                          ¿Qué pasa en el sistema?
                        </dt>
                        <dd>{entry.effect}</dd>
                      </div>
                      <div>
                        <dt className="font-bold text-emerald-300">
                          ¿Por qué importa?
                        </dt>
                        <dd>{entry.why}</dd>
                      </div>
                      {entry.watch && (
                        <div>
                          <dt className="font-bold text-red-300">Cuidado</dt>
                          <dd>{entry.watch}</dd>
                        </div>
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
