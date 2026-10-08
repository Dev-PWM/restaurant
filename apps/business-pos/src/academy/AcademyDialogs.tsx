import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  CheckCircle2,
  Flame,
  Lock,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { useAcademy } from "./AcademyProvider";
import { MODULES, getModule, RUSH_TIPS } from "./curriculum.js";
import { isAvailable, nextModuleId, rushOffered } from "./engine.js";

/** Training dialogs are not native <dialog>s: they stack at z-layer-academy-top like everything else. */
export function AcademyDialog({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => panel.current?.focus(), []);
  return createPortal(
    <div className="z-layer-academy-top fixed inset-0 flex items-end justify-center bg-black/65 sm:items-center sm:p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-3xl border-2 border-yellow-400 bg-stone-900 pb-[env(safe-area-inset-bottom)] text-white shadow-2xl outline-none sm:rounded-3xl"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Needs a deliberate 5-second hold, so it can't be tapped by accident but is there in an emergency. */
function HoldButton({
  seconds,
  onComplete,
  children,
}: {
  seconds: number;
  onComplete: () => void;
  children: ReactNode;
}) {
  const [progress, setProgress] = useState(0);
  const frame = useRef(0);
  const startedAt = useRef(0);
  const stop = () => {
    cancelAnimationFrame(frame.current);
    startedAt.current = 0;
    setProgress(0);
  };
  const tick = (now: number) => {
    if (!startedAt.current) return;
    const next = Math.min(1, (now - startedAt.current) / (seconds * 1000));
    setProgress(next);
    if (next >= 1) {
      startedAt.current = 0;
      onComplete();
    } else frame.current = requestAnimationFrame(tick);
  };
  const start = (event?: ReactPointerEvent) => {
    event?.preventDefault();
    if (startedAt.current) return;
    startedAt.current = performance.now();
    frame.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return (
    <button
      type="button"
      data-tour-allow="skip"
      className="btn relative min-h-12 w-full select-none touch-manipulation overflow-hidden rounded-2xl border-red-500/60 bg-red-950/60 text-sm font-bold text-red-100"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat)
          start();
      }}
      onKeyUp={stop}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-red-400/50"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative">{children}</span>
    </button>
  );
}

export function ModuleMenu() {
  const academy = useAcademy();
  const { state, pending } = academy;
  if (state.phase !== "menu") return null;
  // Closing the menu resumes the lesson, starts the first one, or (when the required
  // modules are done) just leaves the board free to practise on.
  const close = () =>
    academy.dispatch({
      type: state.moduleId
        ? "RESUME"
        : academy.requiredDone
          ? "CLOSE"
          : "BEGIN",
    });
  const leftToUnlock = pending.required.length;
  return (
    <AcademyDialog label="Módulos del entrenamiento">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-stone-700 bg-stone-900 p-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-yellow-300">
            Academia MasaFlow
          </p>
          <h2 className="text-xl font-black">Qué quieres practicar</h2>
          <p className="mt-1 text-xs text-stone-300">
            {academy.trainedOrSkipped
              ? "Puedes repetir cualquier módulo cuando quieras."
              : "Para abrir la caja real, completa los módulos obligatorios y el Reto Almuerzo."}
          </p>
        </div>
        <button
          type="button"
          data-tour-allow="menu-close"
          onClick={close}
          aria-label="Cerrar"
          className="btn min-h-11 min-w-11 rounded-xl border-stone-600 bg-stone-800 text-white"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>
      <ol className="space-y-2 p-4">
        {MODULES.map((module) => {
          const done = state.completed.includes(module.id);
          const open = isAvailable(state, module.id);
          const current = state.moduleId === module.id;
          const previous = MODULES[module.number - 2];
          return (
            <li
              key={module.id}
              className={`flex items-center gap-3 rounded-2xl border p-3 ${
                done
                  ? "border-emerald-700/50 bg-emerald-950/40"
                  : open
                    ? "border-stone-600 bg-stone-800"
                    : "border-stone-800 bg-stone-950/60 opacity-70"
              }`}
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                  done
                    ? "bg-emerald-600 text-white"
                    : open
                      ? "bg-yellow-400 text-stone-950"
                      : "bg-stone-700 text-stone-400"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                ) : open ? (
                  module.number
                ) : (
                  <Lock className="size-4" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-sm font-black">
                  {module.title}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      module.required
                        ? "bg-yellow-400/20 text-yellow-200"
                        : "bg-stone-700 text-stone-300"
                    }`}
                  >
                    {module.required ? "Obligatorio" : "Recomendado"}
                  </span>
                </p>
                <p className="text-xs text-stone-300">{module.subtitle}</p>
                <p className="text-[11px] text-stone-400">
                  {open
                    ? `${module.steps.length} pasos · ${module.minutes} min`
                    : `Termina primero «${previous?.title}»`}
                </p>
              </div>
              <button
                type="button"
                data-tour-allow="module"
                disabled={!open}
                onClick={() =>
                  academy.dispatch({
                    type: "START_MODULE",
                    moduleId: module.id,
                  })
                }
                className="btn min-h-11 shrink-0 rounded-xl border-yellow-400 bg-yellow-400 px-3 text-sm font-black text-stone-950 hover:bg-yellow-300 disabled:border-stone-700 disabled:bg-stone-800 disabled:text-stone-500"
              >
                {done ? "Repetir" : current ? "Continuar" : "Practicar"}
              </button>
            </li>
          );
        })}
        <li
          className={`flex items-center gap-3 rounded-2xl border p-3 ${
            academy.requiredDone
              ? "border-amber-500/60 bg-amber-950/40"
              : "border-stone-800 bg-stone-950/60 opacity-70"
          }`}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-stone-950">
            {academy.requiredDone ? (
              <Flame className="size-5" aria-hidden="true" />
            ) : (
              <Lock className="size-4" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black">
              Reto Almuerzo{" "}
              <span className="rounded-full bg-yellow-400/20 px-2 py-0.5 text-[10px] font-bold uppercase text-yellow-200">
                Examen final
              </span>
            </p>
            <p className="text-xs text-stone-300">
              5 pedidos al mismo tiempo en 60 segundos, sin ayudas.
            </p>
            <p className="text-[11px] text-stone-400">
              {academy.requiredDone
                ? state.rushPassed
                  ? "Ya lo aprobaste. Puedes repetirlo."
                  : "Listo para intentarlo."
                : `Faltan ${leftToUnlock} módulo${leftToUnlock === 1 ? "" : "s"} obligatorio${leftToUnlock === 1 ? "" : "s"}.`}
            </p>
          </div>
          <button
            type="button"
            data-tour-allow="rush"
            disabled={!academy.requiredDone}
            onClick={() => academy.dispatch({ type: "START_RUSH" })}
            className="btn min-h-11 shrink-0 rounded-xl border-amber-400 bg-amber-400 px-3 text-sm font-black text-stone-950 hover:bg-amber-300 disabled:border-stone-700 disabled:bg-stone-800 disabled:text-stone-500"
          >
            {state.rushPassed ? "Repetir" : "Intentar"}
          </button>
        </li>
      </ol>
      {!academy.trainedOrSkipped && (
        <footer className="space-y-2 border-t border-stone-700 p-4">
          <p className="text-xs text-stone-300">
            ¿Es una emergencia y necesitas la caja ya? Mantén presionado 5
            segundos. Se recordará que falta entrenamiento y no cuenta como
            graduación.
          </p>
          <HoldButton seconds={5} onComplete={academy.skipGate}>
            Mantén presionado 5 s: omitir por emergencia
          </HoldButton>
        </footer>
      )}
    </AcademyDialog>
  );
}

export function QuizCard() {
  const academy = useAcademy();
  const { state, module } = academy;
  if (state.phase !== "quiz" || !module) return null;
  const { quiz } = module;
  const picked = state.quizPick !== null ? quiz.options[state.quizPick] : null;
  return (
    <AcademyDialog label="Pregunta rápida">
      <div className="space-y-4 p-5">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-yellow-400/20 px-3 py-1 text-xs font-black uppercase tracking-wide text-yellow-200">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Pregunta rápida · {module.title}
        </p>
        <h2 className="text-lg font-black leading-snug">{quiz.question}</h2>
        <div className="space-y-2">
          {quiz.options.map((option, index) => (
            <button
              key={option.text}
              type="button"
              data-tour-allow="answer"
              onClick={() => academy.dispatch({ type: "ANSWER", index })}
              className={`btn min-h-14 w-full justify-start rounded-2xl border-2 px-4 py-3 text-left text-sm font-bold leading-snug ${
                state.quizPick === index
                  ? "border-red-500 bg-red-950/60 text-red-100"
                  : "border-stone-600 bg-stone-800 text-white hover:border-yellow-400"
              }`}
            >
              {option.text}
            </button>
          ))}
        </div>
        {picked && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-red-600/50 bg-red-950/50 p-3 text-sm text-red-100"
          >
            <XCircle
              className="mt-0.5 size-5 shrink-0 text-red-400"
              aria-hidden="true"
            />
            <span>
              {picked.explain} <strong>Inténtalo de nuevo.</strong>
            </span>
          </p>
        )}
      </div>
    </AcademyDialog>
  );
}

export function RecapCard() {
  const academy = useAcademy();
  const { state, module } = academy;
  if (state.phase !== "recap" || !module) return null;
  const right = module.quiz.options.find((option) => option.correct);
  const next = nextModuleId(state);
  const nextModule = next ? getModule(next) : undefined;
  const readyForRush = rushOffered(state);
  return (
    <AcademyDialog label="Módulo completado">
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600">
            <CheckCircle2 className="size-7" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-emerald-300">
              Módulo {module.number} completado
            </p>
            <h2 className="text-xl font-black">{module.title}</h2>
          </div>
        </div>
        {right && (
          <p className="rounded-2xl border border-emerald-700/50 bg-emerald-950/40 p-3 text-sm text-emerald-100">
            {right.explain}
          </p>
        )}
        <div>
          <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-yellow-300">
            Lo que aprendiste
          </h3>
          <ul className="space-y-2">
            {module.takeaways.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm leading-snug"
              >
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
        {readyForRush && (
          <div className="rounded-2xl border border-amber-500/50 bg-amber-950/40 p-3 text-sm">
            <p className="font-black text-amber-200">
              Ya puedes presentar el Reto Almuerzo
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-100">
              {RUSH_TIPS.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          {readyForRush && (
            <button
              type="button"
              data-tour-allow="rush"
              onClick={() => academy.dispatch({ type: "START_RUSH" })}
              className="btn min-h-12 flex-1 gap-2 rounded-2xl border-amber-400 bg-amber-400 text-base font-black text-stone-950 hover:bg-amber-300"
            >
              <Flame className="size-5" aria-hidden="true" />
              Empezar el Reto Almuerzo
            </button>
          )}
          {nextModule && (
            <button
              type="button"
              data-tour-allow="next"
              onClick={() => academy.dispatch({ type: "CONTINUE" })}
              className={`btn min-h-12 flex-1 gap-2 ${
                readyForRush
                  ? "rounded-2xl border-stone-600 bg-stone-800 text-sm font-bold text-white"
                  : "btn-primary text-base font-black"
              }`}
            >
              Siguiente: {nextModule.title}
              <ArrowRight className="size-5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            data-tour-allow="menu"
            onClick={() => academy.dispatch({ type: "OPEN_MENU" })}
            className="btn min-h-12 rounded-2xl border-stone-600 bg-stone-800 text-sm font-bold text-white"
          >
            Ver módulos
          </button>
        </div>
      </div>
    </AcademyDialog>
  );
}
