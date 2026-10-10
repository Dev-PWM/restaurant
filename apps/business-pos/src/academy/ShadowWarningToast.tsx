import { createPortal } from "react-dom";
import { Lightbulb } from "lucide-react";
import { useAcademy } from "./AcademyProvider";

/**
 * «Aún no» warning. It sits under the training bar (never at the bottom, where the coach
 * card docks), ignores the pointer, and uses the system layer so nothing can hide it.
 */
export function ShadowWarningToast() {
  const { warning } = useAcademy();
  if (!warning) return null;
  return createPortal(
    <div className="z-layer-system pointer-events-none fixed inset-x-0 top-[calc(var(--academy-bar-h,0px)_+_0.5rem)] flex justify-center px-3">
      <div
        role="alert"
        aria-live="assertive"
        className="animate-shake flex max-w-md items-center gap-3 rounded-2xl border-2 border-amber-500 bg-stone-900/95 px-5 py-3 text-stone-50 shadow-2xl backdrop-blur-md"
      >
        <Lightbulb
          className="size-5 shrink-0 text-amber-400"
          aria-hidden="true"
        />
        <span className="text-sm font-bold leading-snug">{warning}</span>
      </div>
    </div>,
    document.body,
  );
}
