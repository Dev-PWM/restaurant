import { useEffect, useState, useLayoutEffect, useRef } from "react";
import { ShieldCheck, Zap, Lock, Unlock, ArrowDown, ArrowUp, AlertTriangle } from "lucide-react";
import type { AcademyStep } from "./types";

interface CoachmarkSpotlightProps {
  step: AcademyStep;
  explainLockRemaining: number;
  onTargetClickAllowed: boolean;
}

interface RectBox {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export function CoachmarkSpotlight({
  step,
  explainLockRemaining,
  onTargetClickAllowed,
}: CoachmarkSpotlightProps) {
  const [targetRect, setTargetRect] = useState<RectBox | null>(null);
  const [coachStyle, setCoachStyle] = useState<React.CSSProperties>({
    left: 16,
    top: 96,
  });
  const [arrowDirection, setArrowDirection] = useState<"up" | "down" | "none">("none");
  const rafRef = useRef<number | null>(null);

  // Position tracking using requestAnimationFrame + resize & scroll listeners
  useLayoutEffect(() => {
    const updatePosition = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const targetEl = document.querySelector<HTMLElement>(
          `[data-tour-target="${step.target}"]`
        );

        if (!targetEl) {
          setTargetRect(null);
          return;
        }

        const rect = targetEl.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
          right: rect.right,
        });

        // Determine best place for coachmark (above or below target)
        const margin = 14;
        const coachWidth = Math.min(420, window.innerWidth - 32);
        let left = Math.max(16, rect.left + rect.width / 2 - coachWidth / 2);
        if (left + coachWidth > window.innerWidth - 16) {
          left = window.innerWidth - coachWidth - 16;
        }

        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        let top = 96;
        if (spaceBelow >= 260) {
          // Place below target
          top = rect.bottom + margin;
          setArrowDirection("up");
        } else if (spaceAbove >= 260) {
          // Place above target
          top = Math.max(16, rect.top - 280);
          setArrowDirection("down");
        } else {
          // Fallback centered / top corner
          top = Math.max(80, Math.min(window.innerHeight - 300, rect.top));
          setArrowDirection("none");
        }

        setCoachStyle({
          left,
          top,
          width: coachWidth,
        });
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    // Also poll briefly to handle modal entrance animations
    const interval = setInterval(updatePosition, 300);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      clearInterval(interval);
    };
  }, [step.target, step.id]);

  const isLocked = explainLockRemaining > 0;

  return (
    <>
      {/* Dimmed backdrop */}
      <div
        className="pointer-events-none fixed inset-0 z-30 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
        aria-hidden="true"
      />

      {/* Target spotlight glowing cutout / ring */}
      {targetRect && (
        <>
          <div
            className={`pointer-events-none fixed z-[70] rounded-2xl ring-4 transition-all duration-300 ${
              isLocked
                ? "ring-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.6)]"
                : "ring-yellow-400 shadow-[0_0_35px_rgba(250,204,21,0.8)] motion-safe:animate-pulse"
            }`}
            style={{
              top: targetRect.top - 6,
              left: targetRect.left - 6,
              width: targetRect.width + 12,
              height: targetRect.height + 12,
            }}
          />

          {/* Explain-Before-Execute Pointer Blocker overlay over the target element during countdown */}
          {isLocked && (
            <div
              className="fixed z-[70] flex items-center justify-center rounded-xl bg-black/30 backdrop-blur-[1px] cursor-not-allowed select-none"
              style={{
                top: targetRect.top - 4,
                left: targetRect.left - 4,
                width: targetRect.width + 8,
                height: targetRect.height + 8,
              }}
              title="Lee la instrucción antes de presionar"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <span className="flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-black uppercase tracking-wider text-black shadow-lg animate-pulse">
                <Lock className="size-3.5 stroke-[2.5]" />
                Lee {explainLockRemaining}s
              </span>
            </div>
          )}
        </>
      )}

      {/* Bouncing cognitive coachmark card */}
      <aside
        className="fixed z-[70] rounded-3xl border-2 border-yellow-400 bg-stone-900/95 p-5 text-white shadow-2xl backdrop-blur-md transition-all duration-300"
        style={coachStyle}
        role="status"
        aria-live="polite"
      >
        {/* Pointer indicator arrow */}
        {arrowDirection === "up" && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center justify-center text-yellow-400">
            <ArrowUp className="size-6 stroke-[3] animate-bounce" />
          </div>
        )}
        {arrowDirection === "down" && (
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center text-yellow-400">
            <ArrowDown className="size-6 stroke-[3] animate-bounce" />
          </div>
        )}

        {/* Step pill and module indicator */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-400/20 px-3 py-1 text-xs font-black uppercase tracking-wider text-yellow-300 border border-yellow-400/30">
            Módulo {step.moduleNumber}: {step.moduleTitle}
          </span>
          <span className="text-xs font-bold text-stone-400">
            Paso {step.stepNumber} de {step.totalSteps}
          </span>
        </div>

        {/* Instruction Title */}
        <div className="mt-3">
          <h3 className="text-lg font-black tracking-tight text-yellow-400">
            {step.title}
          </h3>
          <p className="mt-1 text-sm font-semibold leading-snug text-stone-100">
            {step.instruction}
          </p>
        </div>

        {/* Backend Consequence & Value */}
        <div className="mt-3 space-y-2 rounded-2xl bg-stone-950/80 p-3 border border-stone-800/80">
          <div className="flex items-start gap-2 text-xs">
            <Zap className="size-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <strong className="text-amber-300 font-bold block">
                Consecuencia en el sistema:
              </strong>
              <span className="text-stone-300 leading-relaxed">
                {step.backendConsequence}
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2 text-xs border-t border-stone-800/60 pt-2">
            <ShieldCheck className="size-4 shrink-0 text-emerald-400 mt-0.5" />
            <div>
              <strong className="text-emerald-300 font-bold block">
                Por qué importa:
              </strong>
              <span className="text-stone-300 leading-relaxed">
                {step.valueWhy}
              </span>
            </div>
          </div>
        </div>

        {/* Explain-Before-Execute Status Footer */}
        <div className="mt-4 flex items-center justify-between pt-1">
          {isLocked ? (
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300 bg-amber-950/50 px-3 py-2 rounded-xl border border-amber-600/40 w-full justify-center">
              <Lock className="size-4 shrink-0 animate-pulse" />
              <span>
                Comprende el paso... botón desbloquea en {explainLockRemaining}s
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 bg-emerald-950/50 px-3 py-2 rounded-xl border border-emerald-600/40 w-full justify-center animate-pulse">
              <Unlock className="size-4 shrink-0" />
              <span>¡Listo! Toca el botón destacado en amarillo</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
