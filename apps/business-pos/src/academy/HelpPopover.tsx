import { createPortal } from "react-dom";
import { ShieldCheck, TriangleAlert, X, Zap } from "lucide-react";
import { useAcademy } from "./AcademyProvider";
import { glossaryEntry } from "./glossary.js";

/** Explore mode: the explanation of the control that was just tapped, without pressing it. */
export function HelpPopover() {
  const { exploring, helpId, closeHelp } = useAcademy();
  const entry = helpId ? glossaryEntry(helpId) : undefined;
  if (!exploring || !entry) return null;
  return createPortal(
    <div className="z-layer-academy pointer-events-none fixed inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] flex justify-center px-2">
      <section
        role="status"
        aria-live="polite"
        className="pointer-events-auto max-h-[46dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border-2 border-yellow-400 bg-stone-900 p-4 text-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-yellow-300">
              {entry.group}
            </p>
            <h3 className="text-base font-black">{entry.label}</h3>
          </div>
          <button
            type="button"
            data-tour-allow="help-close"
            onClick={closeHelp}
            aria-label="Cerrar explicación"
            className="btn min-h-11 min-w-11 rounded-xl border-stone-600 bg-stone-800 text-white"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-sm font-semibold leading-snug">
          {entry.purpose}
        </p>
        <div className="mt-2 space-y-2 rounded-2xl border border-stone-700 bg-stone-950/80 p-3 text-xs leading-relaxed">
          <p className="flex items-start gap-2">
            <Zap
              className="mt-0.5 size-4 shrink-0 text-amber-400"
              aria-hidden="true"
            />
            <span>
              <strong className="block text-amber-300">En el sistema</strong>
              {entry.effect}
            </span>
          </p>
          <p className="flex items-start gap-2 border-t border-stone-800 pt-2">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-emerald-400"
              aria-hidden="true"
            />
            <span>
              <strong className="block text-emerald-300">
                Por qué importa
              </strong>
              {entry.why}
            </span>
          </p>
          {entry.watch && (
            <p className="flex items-start gap-2 border-t border-stone-800 pt-2">
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-red-400"
                aria-hidden="true"
              />
              <span>
                <strong className="block text-red-300">Cuidado</strong>
                {entry.watch}
              </span>
            </p>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
