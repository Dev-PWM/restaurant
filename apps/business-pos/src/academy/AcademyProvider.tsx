import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  readStorage,
  writeStorage,
} from "../../../../shared/ui/RealtimeProvider";
import { HESITATION_MS } from "../simulator.js";
import {
  academyReducer,
  createState,
  currentStep,
  gateLocked,
  pendingModules,
  progressPercent,
  readProgress,
  recordSkip,
  requiredDone,
  writeProgress,
} from "./engine.js";
import { getModule } from "./curriculum.js";
import { playMistakeThud, playSuccessChime, triggerHaptic } from "./sound";
import type {
  AcademyAction,
  AcademyEvent,
  AcademyState,
  ModuleDef,
  ResolvedStep,
} from "./types";

const storage = { get: readStorage, set: writeStorage };

/** Anything a finger can press. Taps on these are checked against the current step. */
const INTERACTIVE =
  "button, a[href], input, select, textarea, summary, [role='tab'], [role='switch']";

/** Seconds a trainee must read before the spotlighted control responds. */
const EXPLAIN_SECONDS = 2;

export interface AcademyContextValue {
  /** True while the practice board replaces the live one. */
  active: boolean;
  state: AcademyState;
  module: ModuleDef | null;
  step: ResolvedStep | null;
  progressPercent: number;
  /** Seconds left of the «read first» lock on the spotlighted control (0 = free to tap). */
  explainLockRemaining: number;
  /** The trainee has stared at the control for a while: pulse it. */
  hesitating: boolean;
  exploring: boolean;
  setExploring: (on: boolean) => void;
  /** Control whose explanation is open in explore mode. */
  helpId: string | null;
  closeHelp: () => void;
  warning: string | null;
  /** The live till is locked behind training on this tablet. */
  gateLocked: boolean;
  trainedOrSkipped: boolean;
  requiredDone: boolean;
  pending: { required: string[]; recommended: string[] };
  dispatch: (action: AcademyAction) => AcademyState;
  /** Report something the trainee did on the practice board. */
  emit: (event: AcademyEvent) => void;
  warn: (message: string, element?: Element | null) => void;
  /** Emergency override for a locked tablet: records a skip, never a graduation. */
  skipGate: () => void;
  guardClick: (event: ReactMouseEvent<HTMLElement>) => void;
}

const Context = createContext<AcademyContextValue | null>(null);

export function useAcademy(): AcademyContextValue {
  const value = useContext(Context);
  if (!value) throw new Error("AcademyProvider required");
  return value;
}

export function AcademyProvider({
  active,
  practiceItem,
  children,
}: {
  active: boolean;
  /** Real menu dish used by the «Pánico y Agotados» module. */
  practiceItem?: string;
  children: ReactNode;
}) {
  const [initial] = useState(() => readProgress(storage));
  const [state, setState] = useState<AcademyState>(() => createState(initial));
  const [skipped, setSkipped] = useState(initial.skipped);
  const [explainLockRemaining, setLock] = useState(0);
  const [hesitating, setHesitating] = useState(false);
  const [exploring, setExploringState] = useState(false);
  const [helpId, setHelpId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const stateRef = useRef(state);
  const activeRef = useRef(active);
  const lockRef = useRef(0);
  const exploringRef = useRef(false);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  activeRef.current = active;
  lockRef.current = explainLockRemaining;
  exploringRef.current = exploring;

  const step = useMemo(
    () => (active ? currentStep(state, { item: practiceItem }) : null),
    [active, state, practiceItem],
  );
  const stepRef = useRef(step);
  stepRef.current = step;
  const module = state.moduleId ? (getModule(state.moduleId) ?? null) : null;

  const dispatch = useCallback((action: AcademyAction) => {
    const before = stateRef.current;
    const after = academyReducer(before, action);
    if (after === before) return before;
    stateRef.current = after;
    setState(after);
    // Sound and vibration fire in the same tick as the state change, so what the
    // trainee feels and what they see never drift apart.
    if (action.type === "EVENT") {
      playSuccessChime();
      triggerHaptic("success");
    } else if (action.type === "ANSWER") {
      if (after.phase === "recap") {
        playSuccessChime();
        triggerHaptic("success");
      } else {
        playMistakeThud();
        triggerHaptic("mistake");
      }
    }
    return after;
  }, []);

  const emit = useCallback(
    (event: AcademyEvent) => {
      if (activeRef.current) dispatch({ type: "EVENT", event });
    },
    [dispatch],
  );

  const warn = useCallback((message: string, element?: Element | null) => {
    playMistakeThud();
    triggerHaptic("mistake");
    setWarning(message);
    clearTimeout(warnTimer.current);
    warnTimer.current = setTimeout(() => setWarning(null), 1800);
    if (element) {
      element.classList.remove("animate-shake");
      // Force a reflow so the shake restarts when the same control is tapped twice.
      void (element as HTMLElement).offsetWidth;
      element.classList.add("animate-shake");
      clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(
        () => element.classList.remove("animate-shake"),
        320,
      );
    }
  }, []);

  const setExploring = useCallback((on: boolean) => {
    setExploringState(on);
    if (!on) setHelpId(null);
  }, []);
  const closeHelp = useCallback(() => setHelpId(null), []);

  const skipGate = useCallback(() => {
    recordSkip(storage);
    setSkipped(true);
  }, []);

  // Progress must survive a reload mid-training.
  useEffect(() => {
    writeProgress(storage, state);
  }, [state.completed, state.rushPassed, state.trained]);

  // «Read first»: action steps lock their control for two seconds. Information steps
  // already wait for the trainee to tap «Entendido», so they need no lock.
  useEffect(() => {
    if (!active || !step || step.kind !== "act") {
      setLock(0);
      return;
    }
    setLock(EXPLAIN_SECONDS);
    const timers = Array.from({ length: EXPLAIN_SECONDS }, (_, index) =>
      setTimeout(
        () => setLock(EXPLAIN_SECONDS - index - 1),
        (index + 1) * 1000,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [active, step?.id, state.runId]);

  // Hesitation: still on the same control after a few free seconds, so pulse it.
  useEffect(() => {
    setHesitating(false);
    if (!active || !step || step.kind !== "act" || explainLockRemaining > 0)
      return;
    const timer = setTimeout(() => setHesitating(true), HESITATION_MS);
    return () => clearTimeout(timer);
  }, [active, step?.id, state.runId, explainLockRemaining > 0]);

  useEffect(() => {
    if (!active) {
      setExploringState(false);
      setHelpId(null);
      setWarning(null);
    }
  }, [active]);

  useEffect(
    () => () => {
      clearTimeout(warnTimer.current);
      clearTimeout(shakeTimer.current);
    },
    [],
  );

  /**
   * Capture-phase lockout for the practice board. Only the spotlighted control (after
   * its read-first lock), the Academy's own buttons (data-tour-allow) and, during the
   * timed challenge, everything else respond. A wrong tap shakes the control it hit.
   */
  const guardClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!activeRef.current) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const interactive = target.closest<HTMLElement>(INTERACTIVE);
      if (!interactive || interactive.closest("[data-tour-allow]")) return;

      if (exploringRef.current) {
        // Explore mode explains a control instead of pressing it.
        event.preventDefault();
        event.stopPropagation();
        const holder = interactive.closest<HTMLElement>("[data-help]");
        setHelpId(holder?.dataset.help ?? null);
        return;
      }

      const phase = stateRef.current.phase;
      if (phase === "rush" || phase === "idle") return;
      const current = stepRef.current;
      if (phase === "learning" && current?.kind === "act") {
        const targetElement = document.querySelector<HTMLElement>(
          `[data-tour-target="${current.target}"]`,
        );
        const onTarget =
          !!targetElement &&
          (targetElement === interactive ||
            targetElement.contains(interactive) ||
            interactive.contains(targetElement));
        if (onTarget && lockRef.current === 0) return;
        event.preventDefault();
        event.stopPropagation();
        warn(
          onTarget
            ? "Lee la explicación antes de continuar."
            : "Aún no. Toca el botón iluminado para continuar.",
          targetElement ?? interactive,
        );
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (phase === "learning")
        warn("Aún no. Lee el mensaje y toca «Entendido».", interactive);
    },
    [warn],
  );

  const value = useMemo<AcademyContextValue>(
    () => ({
      active,
      state,
      module,
      step,
      progressPercent: progressPercent(state),
      explainLockRemaining,
      hesitating,
      exploring,
      setExploring,
      helpId,
      closeHelp,
      warning,
      gateLocked: gateLocked({ trained: state.trained, skipped }),
      trainedOrSkipped: state.trained || skipped,
      requiredDone: requiredDone(state),
      pending: pendingModules(state),
      dispatch,
      emit,
      warn,
      skipGate,
      guardClick,
    }),
    [
      active,
      state,
      module,
      step,
      explainLockRemaining,
      hesitating,
      exploring,
      setExploring,
      helpId,
      closeHelp,
      warning,
      skipped,
      dispatch,
      emit,
      warn,
      skipGate,
      guardClick,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
