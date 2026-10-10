import { useLayoutEffect, useRef } from "react";
import {
  BookOpen,
  Compass,
  Flame,
  GraduationCap,
  LayoutList,
  LogOut,
  RotateCcw,
} from "lucide-react";
import { useAcademy } from "./AcademyProvider";

export interface RushStatus {
  active: boolean;
  resolved: number;
  total: number;
  remaining: number;
  calmMode?: boolean;
  setCalmMode?: (calm: boolean) => void;
}

/**
 * One slim sticky row: where you are, what's left, and the few Academy controls.
 * Module pills and descriptions live in the module menu so this never eats the board.
 */
export function AcademyBar({
  rush,
  onOpenGlossary,
  onExit,
}: {
  rush: RushStatus;
  onOpenGlossary: () => void;
  onExit: () => void;
}) {
  const academy = useAcademy();
  const { state, module, step, exploring } = academy;
  const bar = useRef<HTMLDivElement>(null);

  // Other sticky elements (the phone lane tabs) sit just under this bar. The height is
  // published after every render (the Explore banner and the buttons change it) and again
  // by a ResizeObserver for changes that do not come from a render (font load, rotation).
  const publishHeight = () => {
    const element = bar.current;
    if (element)
      document.documentElement.style.setProperty(
        "--academy-bar-h",
        `${Math.round(element.getBoundingClientRect().height)}px`,
      );
  };
  useLayoutEffect(publishHeight);
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element) return;
    const observer = new ResizeObserver(publishHeight);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--academy-bar-h");
    };
  }, []);

  const where = rush.active
    ? rush.calmMode
      ? `Reto Almuerzo (Modo Tranquilo) · ${rush.resolved}/${rush.total} resueltas`
      : `Reto Almuerzo · ${rush.resolved}/${rush.total} resueltas · ${rush.remaining}s`
    : state.phase === "learning" && module && step
      ? `Módulo ${module.number}: ${module.title} · Paso ${step.stepNumber} de ${step.totalSteps}`
      : state.phase === "quiz" || state.phase === "recap"
        ? module
          ? `Módulo ${module.number}: ${module.title}`
          : "Academia"
        : state.phase === "rush"
          ? "Reto Almuerzo · Resultado"
          : "Elige qué practicar";

  const iconButton =
    "btn min-h-11 min-w-11 gap-1.5 rounded-xl border-stone-600 bg-stone-800 px-2.5 py-2 text-xs font-bold text-stone-100 hover:bg-stone-700 sm:px-3";

  return (
    <div
      ref={bar}
      data-academy-bar
      className="z-layer-academy sticky top-0 border-b-4 border-yellow-400 bg-stone-900 pt-[env(safe-area-inset-top)] text-white shadow-lg"
    >
      <div
        className="simulator-hazard-stripes h-1.5 w-full"
        aria-hidden="true"
      />
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-1.5 sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-yellow-400 text-stone-950">
          {rush.active ? (
            <Flame className="size-5 animate-pulse" aria-hidden="true" />
          ) : (
            <GraduationCap className="size-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-black uppercase tracking-wide text-yellow-300">
            Modo de prueba · Las ventas no se registran
          </p>
          <p className="truncate text-sm font-bold">{where}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            data-tour-allow="menu"
            className={iconButton}
            onClick={() => academy.dispatch({ type: "OPEN_MENU" })}
            aria-label="Módulos"
            title="Módulos del entrenamiento"
          >
            <LayoutList className="size-4" aria-hidden="true" />
            <span className="hidden md:inline">Módulos</span>
          </button>
          <button
            type="button"
            data-tour-allow="explore"
            aria-pressed={exploring}
            className={`${iconButton} ${exploring ? "!border-yellow-300 !bg-yellow-400 !text-stone-950" : ""}`}
            onClick={() => academy.setExploring(!exploring)}
            aria-label="Explorar: qué hace cada botón"
            title="Toca cualquier botón para ver qué hace, sin ejecutarlo"
          >
            <Compass className="size-4" aria-hidden="true" />
            <span className="hidden md:inline">Explorar</span>
          </button>
          <button
            type="button"
            data-tour-allow="glossary"
            className={iconButton}
            onClick={onOpenGlossary}
            aria-label="Glosario de botones"
            title="Glosario: todos los botones explicados"
          >
            <BookOpen className="size-4" aria-hidden="true" />
            <span className="hidden lg:inline">Glosario</span>
          </button>
          {state.phase === "learning" && (
            <button
              type="button"
              data-tour-allow="reset"
              className={iconButton}
              onClick={() => academy.dispatch({ type: "RESET_MODULE" })}
              aria-label="Reiniciar este módulo"
              title="Reiniciar este módulo desde el paso 1"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              <span className="hidden lg:inline">Reiniciar</span>
            </button>
          )}
          {rush.active && rush.setCalmMode && (
            <button
              type="button"
              data-tour-allow="rush-calm"
              aria-label="Modo Tranquilo: practicar sin límite de tiempo"
              aria-pressed={rush.calmMode}
              className={`btn min-h-11 min-w-11 gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-bold sm:px-3 ${
                rush.calmMode
                  ? "border-emerald-400 bg-emerald-950 text-emerald-200"
                  : "border-stone-600 bg-stone-800 text-stone-200 hover:bg-stone-700"
              }`}
              onClick={() => rush.setCalmMode?.(!rush.calmMode)}
              title="Practicar sin límite de tiempo"
            >
              <span>🌿</span>
              <span className="hidden sm:inline">Modo Tranquilo</span>
            </button>
          )}
          <button
            type="button"
            data-tour-allow="exit"
            className="btn min-h-11 min-w-11 gap-1.5 rounded-xl border-red-500 bg-red-950 px-2.5 py-2 text-xs font-bold text-red-100 hover:bg-red-900 sm:px-3 z-[100] shadow-md"
            onClick={onExit}
            aria-label="Salir del entrenamiento"
            title="Salir del entrenamiento e ir a la caja"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Salir del Simulador</span>
          </button>
        </div>
      </div>
      <div
        className="h-1 w-full bg-stone-800"
        role="progressbar"
        aria-label="Avance del entrenamiento"
        aria-valuenow={academy.progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-gradient-to-r from-yellow-500 to-amber-400 transition-[width] duration-500"
          style={{ width: `${academy.progressPercent}%` }}
        />
      </div>
      {exploring && (
        <p className="bg-yellow-400 px-4 py-2 text-center text-xs font-black text-stone-950">
          Modo Explorar: toca cualquier botón para ver qué hace. No se ejecuta
          nada.
        </p>
      )}
    </div>
  );
}
