import {
  CheckCircle2,
  AlertTriangle,
  GraduationCap,
  Flame,
  RotateCcw,
  LogOut,
  Lock,
} from "lucide-react";
import type { AcademyModuleId, AcademyStep } from "./types";
import { ACADEMY_MODULES } from "./curriculum";

interface AcademyBannerProps {
  currentModuleId: AcademyModuleId;
  completedModules: AcademyModuleId[];
  currentStep: AcademyStep | null;
  overallProgressPercent: number;
  rushMode: boolean;
  rushRemaining: number;
  rushResolved: number;
  rushTotal: number;
  canExit: boolean;
  onSelectModule: (moduleId: AcademyModuleId) => void;
  onStartRush: () => void;
  onResetModule: () => void;
  onExit: () => void;
}

export function AcademyBanner({
  currentModuleId,
  completedModules,
  currentStep,
  overallProgressPercent,
  rushMode,
  rushRemaining,
  rushResolved,
  rushTotal,
  canExit,
  onSelectModule,
  onStartRush,
  onResetModule,
  onExit,
}: AcademyBannerProps) {
  return (
    <div className="relative z-20 border-b-4 border-yellow-500 bg-stone-900 text-white shadow-xl">
      {/* Hazard stripes accent bar */}
      <div className="h-2 w-full simulator-hazard-stripes bg-yellow-400" />

      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Header Title & Status */}
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-yellow-400 text-stone-950 font-black shadow-lg">
              <GraduationCap className="size-6 stroke-[2.5]" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-yellow-400">
                  Academia Interactiva MasaFlow
                </span>
                <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold text-yellow-300 border border-yellow-500/30">
                  Sandboxed · Aislado de Ventas Reales
                </span>
              </div>
              <h2 className="text-sm font-bold text-stone-100 sm:text-base">
                {rushMode ? (
                  <span className="flex items-center gap-2 text-amber-400">
                    <Flame className="size-4 animate-pulse" />
                    Reto Almuerzo en Curso: {rushResolved}/{rushTotal} comandas resueltas ({rushRemaining}s)
                  </span>
                ) : currentStep ? (
                  <span>
                    {currentStep.moduleTitle} ·{" "}
                    <span className="text-stone-300 font-normal">
                      Paso {currentStep.stepNumber} de {currentStep.totalSteps}: {currentStep.title}
                    </span>
                  </span>
                ) : (
                  "Selecciona un módulo para practicar"
                )}
              </h2>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {!rushMode && (
              <button
                type="button"
                onClick={onStartRush}
                className="btn btn-sm inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-950/60 text-xs font-bold text-amber-300 hover:bg-amber-900/60"
                title="Probar reto rápido de 60 segundos"
              >
                <Flame className="size-3.5 text-amber-400" />
                Reto Almuerzo (60s)
              </button>
            )}

            <button
              type="button"
              onClick={onResetModule}
              className="btn btn-sm inline-flex items-center gap-1.5 rounded-xl border border-stone-700 bg-stone-800 text-xs font-bold text-stone-300 hover:bg-stone-700"
              title="Reiniciar este módulo desde el paso 1"
            >
              <RotateCcw className="size-3.5" />
              Reiniciar
            </button>

            {canExit ? (
              <button
                type="button"
                onClick={onExit}
                className="btn btn-sm inline-flex items-center gap-1.5 rounded-xl border border-red-500/50 bg-red-950/60 text-xs font-bold text-red-200 hover:bg-red-900/80"
                title="Salir del entrenamiento e ir al POS en vivo"
              >
                <LogOut className="size-3.5" />
                Salir a POS en Vivo
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 rounded-xl bg-stone-800 px-3 py-1.5 text-xs font-bold text-stone-400 border border-stone-700"
                title="Debes completar la capacitación obligatoria para acceder a la caja real"
              >
                <Lock className="size-3 text-yellow-500" />
                Caja Real Bloqueada (Capacitación Obligatoria)
              </span>
            )}
          </div>
        </div>

        {/* Modules navigation pill tabs */}
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {ACADEMY_MODULES.map((m) => {
            const isCompleted = completedModules.includes(m.id);
            const isCurrent = currentModuleId === m.id && !rushMode;

            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectModule(m.id)}
                className={`group flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  isCurrent
                    ? "bg-yellow-400 text-stone-950 shadow-md ring-2 ring-yellow-400"
                    : isCompleted
                    ? "bg-emerald-950/70 text-emerald-300 border border-emerald-600/40 hover:bg-emerald-900/60"
                    : "bg-stone-800/80 text-stone-400 border border-stone-700 hover:bg-stone-800"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                ) : (
                  <span
                    className={`flex size-4 items-center justify-center rounded-full text-[10px] font-black ${
                      isCurrent
                        ? "bg-stone-950 text-yellow-400"
                        : "bg-stone-700 text-stone-300"
                    }`}
                  >
                    {m.number}
                  </span>
                )}
                <span>
                  M{m.number}: {m.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Global Progress Bar */}
        <div className="mt-2.5 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-800">
            <div
              className="h-full bg-linear-to-r from-yellow-500 to-amber-400 transition-all duration-500 rounded-full"
              style={{ width: `${overallProgressPercent}%` }}
            />
          </div>
          <span className="text-[11px] font-extrabold text-yellow-400 tabular-nums">
            {overallProgressPercent}% Completado
          </span>
        </div>
      </div>
    </div>
  );
}
