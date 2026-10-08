import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Award, CheckCircle2, Sparkles } from "lucide-react";
import { burstConfetti } from "../confetti";
import { useAcademy } from "./AcademyProvider";
import { MODULES } from "./curriculum.js";

/** Shown after the timed challenge is passed: celebrates, lists what was earned, hands over the live till. */
export function GraduationModal({ onEnterLive }: { onEnterLive: () => void }) {
  const academy = useAcademy();
  const open = academy.state.phase === "graduation";
  useEffect(() => {
    if (!open) return;
    const stops = [burstConfetti()];
    const timers = [450, 900].map((delay) =>
      setTimeout(() => stops.push(burstConfetti()), delay),
    );
    return () => {
      timers.forEach(clearTimeout);
      stops.forEach((stop) => stop());
    };
  }, [open]);
  if (!open) return null;
  const left = MODULES.filter(
    (module) => !academy.state.completed.includes(module.id),
  );
  return createPortal(
    <div
      className="z-layer-system fixed inset-0 flex items-end justify-center bg-black/80 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Graduación"
    >
      <div className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-3xl border-4 border-yellow-400 bg-stone-900 pb-[env(safe-area-inset-bottom)] text-white shadow-[0_0_60px_rgba(250,204,21,0.35)] sm:rounded-3xl">
        <div className="bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 p-6 text-center text-stone-950">
          <span className="mx-auto mb-3 flex size-20 items-center justify-center rounded-3xl bg-stone-950 text-yellow-400 shadow-2xl motion-safe:animate-bounce">
            <Award className="size-12" aria-hidden="true" />
          </span>
          <p className="text-xs font-black uppercase tracking-wide">
            Certificación MasaFlow
          </p>
          <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
            ¡Taquero Experto!
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm font-bold">
            Aprobaste el Reto Almuerzo. Ya puedes trabajar en la caja real.
          </p>
        </div>
        <div className="space-y-4 p-5">
          <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-yellow-300">
            <Sparkles className="size-4" aria-hidden="true" />
            Lo que ya dominas
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {MODULES.filter((module) =>
              academy.state.completed.includes(module.id),
            ).map((module) => (
              <li
                key={module.id}
                className="flex items-start gap-2 rounded-2xl border border-stone-700 bg-stone-950/70 p-3"
              >
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                <span>
                  <strong className="block text-sm">{module.title}</strong>
                  <span className="text-xs text-stone-300">
                    {module.subtitle}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {left.length > 0 && (
            <p className="rounded-2xl border border-amber-500/40 bg-amber-950/40 p-3 text-sm text-amber-100">
              Todavía te quedan {left.length} módulo
              {left.length === 1 ? "" : "s"} recomendado
              {left.length === 1 ? "" : "s"}:{" "}
              {left.map((module) => module.title).join(", ")}. Puedes hacerlos
              cuando quieras desde el botón «Entrenamiento».
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              data-tour-allow="graduate"
              onClick={() => {
                academy.dispatch({ type: "GRADUATE" });
                onEnterLive();
              }}
              className="btn btn-primary min-h-14 flex-1 gap-2 text-base font-black"
            >
              Entrar a la caja real
              <ArrowRight className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-tour-allow="keep-training"
              onClick={() => {
                academy.dispatch({ type: "GRADUATE" });
                academy.dispatch({ type: "OPEN_MENU" });
              }}
              className="btn min-h-14 rounded-2xl border-stone-600 bg-stone-800 text-sm font-bold text-white"
            >
              Seguir practicando
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
