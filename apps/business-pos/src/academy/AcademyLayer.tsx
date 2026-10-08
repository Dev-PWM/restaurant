import { createPortal } from "react-dom";
import { Trophy } from "lucide-react";
import { useAcademy } from "./AcademyProvider";
import {
  AcademyDialog,
  ModuleMenu,
  QuizCard,
  RecapCard,
} from "./AcademyDialogs";
import { CoachmarkSpotlight } from "./CoachmarkSpotlight";
import { GlossarySheet } from "./GlossarySheet";
import { GraduationModal } from "./GraduationModal";
import { HelpPopover } from "./HelpPopover";
import { PracticeAnalytics } from "./PracticeAnalytics";
import { PracticeInventory } from "./PracticeInventory";
import { ShadowWarningToast } from "./ShadowWarningToast";
import type { usePracticeBoard } from "./usePracticeBoard";

type Practice = ReturnType<typeof usePracticeBoard>;

/**
 * Everything the training draws on top of the board, in one place and at the layers
 * defined in styles.css (spotlight 70, training dialogs 75, toasts and alarms 100).
 * Outside training it only offers the cheat sheet.
 */
export function AcademyLayer({
  practice,
  glossaryOpen,
  onCloseGlossary,
  onEnterLive,
}: {
  practice: Practice;
  glossaryOpen: boolean;
  onCloseGlossary: () => void;
  onEnterLive: () => void;
}) {
  const academy = useAcademy();
  const { rush } = practice;
  const failedRush =
    academy.state.phase === "rush" && rush.finished && !rush.passed;
  return (
    <>
      <GlossarySheet open={glossaryOpen} onClose={onCloseGlossary} />
      {academy.active && (
        <>
          <div className="academy-hazard-frame" aria-hidden="true" />
          {practice.alarmFlash &&
            createPortal(
              <div
                className="animate-alarm-flash z-layer-system pointer-events-none fixed inset-0 bg-red-600/60 motion-reduce:animate-none"
                aria-hidden="true"
              />,
              document.body,
            )}
          {practice.inventoryOpen && (
            <PracticeInventory
              items={practice.inventoryItems}
              practiceItemId={practice.practiceItemId}
              onToggle={practice.toggleItem}
              onClose={practice.closeInventory}
            />
          )}
          {practice.analyticsOpen && (
            <PracticeAnalytics
              metrics={practice.metrics}
              queueSize={practice.orders.length}
              onBack={practice.closeAnalytics}
              onOpenClose={practice.openCloseShift}
              onConfirmClose={practice.confirmCloseShift}
            />
          )}
          <CoachmarkSpotlight />
          <HelpPopover />
          <ModuleMenu />
          <QuizCard />
          <RecapCard />
          <ShadowWarningToast />
          {failedRush && (
            <AcademyDialog label="Resultado del Reto Almuerzo">
              <div className="space-y-4 p-6 text-center">
                <Trophy
                  className="mx-auto size-12 text-amber-400"
                  aria-hidden="true"
                />
                <h2 className="text-3xl font-black">Casi lo logras</h2>
                <p className="text-sm font-semibold text-stone-200">
                  {rush.completed} de {rush.total} comandas cobradas en{" "}
                  {rush.elapsed} segundos. Inténtalo otra vez: cada ronda te
                  sale más rápido.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    data-tour-allow="rush"
                    onClick={() => academy.dispatch({ type: "START_RUSH" })}
                    className="btn btn-primary min-h-12 flex-1 text-base font-black"
                  >
                    Intentar de nuevo
                  </button>
                  <button
                    type="button"
                    data-tour-allow="menu"
                    onClick={() => academy.dispatch({ type: "OPEN_MENU" })}
                    className="btn min-h-12 flex-1 rounded-2xl border-stone-600 bg-stone-800 text-sm font-bold text-white"
                  >
                    Ver módulos
                  </button>
                </div>
              </div>
            </AcademyDialog>
          )}
          <GraduationModal onEnterLive={onEnterLive} />
        </>
      )}
    </>
  );
}
