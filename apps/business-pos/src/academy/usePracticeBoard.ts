import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Order, Snapshot } from "../../../../shared/types/realtime";
import { chime, enableAudio } from "../../../../shared/ui/components";
import {
  RUSH_LIMIT_SECONDS,
  RUSH_TICKET_COUNT,
  UNDO_WINDOW_SECONDS,
  advanceDemoOrder,
  calculatePracticeMetrics,
  createCashDemoOrder,
  createDemoOrder,
  createHistoryOrders,
  createKitchenOrders,
  createNoShowDemoOrder,
  createPickyEaterDemoOrder,
  createRushOrders,
  createTourOrders,
  evaluateRush,
  markDemoNoShow,
  needsAcknowledgement,
  payDemoOrder,
} from "../simulator.js";
import { useAcademy } from "./AcademyProvider";
import { playMistakeThud, triggerHaptic } from "./sound";
import type {
  GhostSalesMetrics,
  ModuleId,
  PracticeInventoryItem,
} from "./types";

export interface RushView {
  active: boolean;
  finished: boolean;
  passed: boolean;
  remaining: number;
  /** Tickets paid. */
  completed: number;
  /** Tickets paid or voided. */
  resolved: number;
  noShows: number;
  elapsed: number;
  total: number;
}

/** The real dish the «Pánico y Agotados» module asks the trainee to switch off. */
export function practiceDish(snapshot: Snapshot | null) {
  const item = snapshot?.menuItems[0];
  return item ? { id: item.id, name: item.name } : undefined;
}

/**
 * Everything the training simulator needs, kept apart from the live board: practice
 * tickets, the undo trap, the timed challenge and the practice Inventory / «Caja y ventas»
 * screens. None of it can emit a socket command. While practising, the live connection
 * is suspended and the real data stays untouched behind a saved snapshot.
 */
export function usePracticeBoard({
  active,
  setActive,
  liveSnapshot,
  suspendRealtime,
  resumeRealtime,
  hasPendingPayment,
  setPayId,
}: {
  active: boolean;
  setActive: (on: boolean) => void;
  liveSnapshot: Snapshot | null;
  suspendRealtime: () => void;
  resumeRealtime: () => void;
  hasPendingPayment: boolean;
  setPayId: (id: string | null) => void;
}) {
  const academy = useAcademy();
  // Timers must not restart whenever the Academy context changes (it ticks during every read-lock).
  const academyRef = useRef(academy);
  academyRef.current = academy;
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [completed, setCompleted] = useState<Order[]>([]);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(
    () => new Set(),
  );
  const [mistakeCountdown, setMistakeCountdown] = useState(0);
  const [mistakeOrderId, setMistakeOrderId] = useState<string | null>(null);
  const [alarmFlash, setAlarmFlash] = useState(false);
  const [unavailable, setUnavailable] = useState<Set<string>>(() => new Set());
  const [paused, setPaused] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [rushActive, setRushActive] = useState(false);
  const [rushFinished, setRushFinished] = useState(false);
  const [rushPassed, setRushPassed] = useState(false);
  const [rushRemaining, setRushRemaining] = useState(RUSH_LIMIT_SECONDS);
  const [rushPaid, setRushPaid] = useState(0);
  const [rushResolved, setRushResolved] = useState(0);
  const [rushNoShows, setRushNoShows] = useState(0);

  const { state } = academy;
  const phase = state.phase;
  const rush = phase === "rush";

  const source = saved ?? liveSnapshot;
  const snapshot = useMemo<Snapshot | null>(
    () =>
      active && source
        ? { ...source, activeOrders: orders, completedOrders: completed }
        : liveSnapshot,
    [active, source, orders, completed, liveSnapshot],
  );
  const dish = practiceDish(source);
  const inventoryItems = useMemo<PracticeInventoryItem[]>(
    () =>
      (source?.menuItems ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        available: !unavailable.has(item.id),
      })),
    [source, unavailable],
  );
  const metrics: GhostSalesMetrics = useMemo(
    () => calculatePracticeMetrics(completed),
    [completed],
  );

  const resetTransient = useCallback(() => {
    setPayId(null);
    setMistakeCountdown(0);
    setMistakeOrderId(null);
    setAlarmFlash(false);
    setUnavailable(new Set());
    setPaused(false);
    setInventoryOpen(false);
    setAnalyticsOpen(false);
  }, [setPayId]);

  /** Lays out the practice tickets a module starts with. */
  const seed = useCallback(
    (moduleId: ModuleId) => {
      resetTransient();
      setRushActive(false);
      setRushFinished(false);
      setAcknowledged(new Set());
      setCompleted([]);
      switch (moduleId) {
        case "tablero":
          setOrders(createTourOrders());
          break;
        case "flujo": {
          const order = createDemoOrder();
          setOrders([order]);
          // The golden path is about the flow; reading badges is the next module.
          setAcknowledged(new Set([order.id]));
          break;
        }
        case "exigente":
          setOrders([createPickyEaterDemoOrder()]);
          break;
        case "cobros":
          setOrders([createCashDemoOrder()]);
          break;
        case "errores": {
          const mistake = { ...createDemoOrder(), status: "ready" as const };
          setOrders([mistake, createNoShowDemoOrder()]);
          break;
        }
        case "cocina":
          setOrders(createKitchenOrders());
          break;
        case "historial":
        case "cierre":
          setOrders([]);
          setCompleted(createHistoryOrders());
          break;
        default:
          setOrders([]);
      }
    },
    [resetTransient],
  );

  // A module (re)starting reseeds the board. Keyed by runId so «Reiniciar» works too.
  useEffect(() => {
    if (!active || phase !== "learning" || !state.moduleId) return;
    seed(state.moduleId);
  }, [active, state.runId, state.moduleId, phase === "learning", seed]);

  // Overlays belong to a step; they close when the module ends.
  useEffect(() => {
    if (phase === "learning") return;
    setInventoryOpen(false);
    setAnalyticsOpen(false);
    setPayId(null);
  }, [phase, setPayId]);

  const startRushBoard = useCallback(() => {
    resetTransient();
    setOrders(createRushOrders());
    setCompleted([]);
    setAcknowledged(new Set());
    setRushPaid(0);
    setRushResolved(0);
    setRushNoShows(0);
    setRushRemaining(RUSH_LIMIT_SECONDS);
    setRushFinished(false);
    setRushPassed(false);
    setRushActive(true);
  }, [resetTransient]);

  useEffect(() => {
    if (active && rush) startRushBoard();
  }, [active, rush, state.runId, startRushBoard]);

  useEffect(() => {
    if (!rushActive || rushRemaining <= 0) return;
    const timer = setTimeout(
      () => setRushRemaining((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [rushActive, rushRemaining]);

  useEffect(() => {
    if (!rushActive || (rushRemaining > 0 && rushResolved < RUSH_TICKET_COUNT))
      return;
    setRushActive(false);
    setRushFinished(true);
    const passed = evaluateRush({
      paid: rushPaid,
      noShows: rushNoShows,
      elapsedSeconds: RUSH_LIMIT_SECONDS - rushRemaining,
    });
    setRushPassed(passed);
    if (passed) chime("ready");
    academyRef.current.dispatch({ type: "RUSH_RESULT", passed });
  }, [rushActive, rushRemaining, rushResolved, rushPaid, rushNoShows]);

  // The undo trap (module «Errores y Fantasmas»): if «Deshacer» is not tapped in time,
  // a real till would have recorded the wrong payment, so the module starts over.
  useEffect(() => {
    if (!active || mistakeCountdown <= 0) return;
    const timer = setTimeout(() => {
      if (mistakeCountdown > 1) {
        setMistakeCountdown(mistakeCountdown - 1);
        return;
      }
      setMistakeCountdown(0);
      setMistakeOrderId(null);
      setAlarmFlash(true);
      chime("alarm");
      academyRef.current.warn(
        "¡Tiempo agotado! En la caja real ese cobro ya se habría registrado. Inténtalo otra vez.",
      );
      academyRef.current.dispatch({ type: "RESET_MODULE" });
    }, 1000);
    return () => clearTimeout(timer);
  }, [active, mistakeCountdown]);

  useEffect(() => {
    if (!alarmFlash) return;
    const timer = setTimeout(() => setAlarmFlash(false), 700);
    return () => clearTimeout(timer);
  }, [alarmFlash]);

  const start = useCallback(() => {
    if (!liveSnapshot || hasPendingPayment) return false;
    // Starting from a tap is the user gesture that lets the sounds play.
    void enableAudio();
    setSaved(liveSnapshot);
    suspendRealtime();
    setActive(true);
    // With the required modules done there is no «next lesson» to push: land on the menu,
    // where the Reto Almuerzo (or any module to repeat) is waiting.
    academy.dispatch(
      academy.requiredDone ? { type: "OPEN_MENU" } : { type: "BEGIN" },
    );
    return true;
  }, [liveSnapshot, hasPendingPayment, suspendRealtime, setActive, academy]);

  const exit = useCallback(() => {
    academy.dispatch({ type: "CLOSE" });
    setActive(false);
    setSaved(null);
    setOrders([]);
    setCompleted([]);
    setAcknowledged(new Set());
    resetTransient();
    setRushActive(false);
    setRushFinished(false);
    // Drop the practice data first, then reconnect: init_data brings the live queue back.
    resumeRealtime();
  }, [academy, setActive, resetTransient, resumeRealtime]);

  const advanceOrder = useCallback(
    (order: Order) => {
      if (
        order.status === "cooking" &&
        needsAcknowledgement(order) &&
        !acknowledged.has(order.id)
      )
        return;
      const next = advanceDemoOrder(order);
      setOrders((current) =>
        current.map((candidate) =>
          candidate.id === order.id ? next : candidate,
        ),
      );
      if (!rush)
        academy.emit({ type: order.status === "review" ? "accept" : "ready" });
    },
    [acknowledged, rush, academy],
  );

  const acknowledge = useCallback(
    (orderId: string) => {
      setAcknowledged((current) => new Set(current).add(orderId));
      if (!rush) academy.emit({ type: "ack-restriction" });
    },
    [rush, academy],
  );

  const noShowOpened = useCallback(() => {
    if (!rush) academy.emit({ type: "noshow-open" });
  }, [rush, academy]);

  const noShow = useCallback(
    (orderId: string) => {
      const order = orders.find((candidate) => candidate.id === orderId);
      if (!order) return;
      const voided = markDemoNoShow(order);
      setOrders((current) =>
        current.filter((candidate) => candidate.id !== orderId),
      );
      setCompleted((current) => [...current, voided]);
      if (rush) {
        setRushResolved((count) => count + 1);
        setRushNoShows((count) => count + 1);
      } else academy.emit({ type: "noshow-confirm" });
    },
    [orders, rush, academy],
  );

  const pay = useCallback(
    (orderId: string, cents: number, via?: "exact" | "spei") => {
      const order = orders.find((candidate) => candidate.id === orderId);
      if (!order) return;
      if (!rush && academy.step?.id === "errores-3" && cents === 20000) {
        // The planned mistake: the customer really handed over $500.
        setPayId(null);
        setMistakeOrderId(orderId);
        setMistakeCountdown(UNDO_WINDOW_SECONDS);
        setAlarmFlash(true);
        chime("alarm");
        playMistakeThud();
        triggerHaptic("mistake");
        academy.emit({ type: "confirm-payment", cents });
        return;
      }
      let paid: Order;
      try {
        paid = payDemoOrder(order, cents);
      } catch {
        return;
      }
      setOrders((current) =>
        current.filter((candidate) => candidate.id !== orderId),
      );
      setCompleted((current) => [...current, paid]);
      setPayId(null);
      setMistakeCountdown(0);
      if (rush) {
        setRushPaid((count) => count + 1);
        setRushResolved((count) => count + 1);
      } else
        academy.emit(
          via === "exact"
            ? { type: "exact-pay" }
            : { type: "confirm-payment", cents },
        );
    },
    [orders, rush, academy, setPayId],
  );

  const undo = useCallback(() => {
    setMistakeCountdown(0);
    setMistakeOrderId(null);
    academy.emit({ type: "undo" });
  }, [academy]);

  const pendingPayment = useCallback(
    (orderId: string) =>
      mistakeCountdown > 0 && mistakeOrderId === orderId
        ? { seconds: mistakeCountdown, cents: 20000 }
        : null,
    [mistakeCountdown, mistakeOrderId],
  );

  const rushView: RushView = {
    active: rushActive,
    finished: rushFinished,
    passed: rushPassed,
    remaining: rushRemaining,
    completed: rushPaid,
    resolved: rushResolved,
    noShows: rushNoShows,
    elapsed: RUSH_LIMIT_SECONDS - rushRemaining,
    total: RUSH_TICKET_COUNT,
  };

  return {
    active,
    snapshot,
    orders,
    metrics,
    acknowledged,
    alarmFlash,
    rush: rushView,
    // controls
    start,
    exit,
    // tickets
    advanceOrder,
    acknowledge,
    noShowOpened,
    noShow,
    pay,
    undo,
    pendingPayment,
    // practice screens
    paused,
    togglePause: () => {
      const next = !paused;
      setPaused(next);
      academy.emit({ type: "pause", paused: next });
    },
    inventoryOpen,
    inventoryItems,
    practiceItemId: dish?.id,
    openInventory: () => {
      setInventoryOpen(true);
      academy.emit({ type: "inventory-open" });
    },
    closeInventory: () => {
      setInventoryOpen(false);
      academy.emit({ type: "inventory-close" });
    },
    toggleItem: (id: string, available: boolean) => {
      setUnavailable((current) => {
        const next = new Set(current);
        if (available) next.delete(id);
        else next.add(id);
        return next;
      });
      academy.emit({ type: "inventory-toggle", id, available });
    },
    analyticsOpen,
    openAnalytics: () => {
      setAnalyticsOpen(true);
      academy.emit({ type: "nav-analytics" });
    },
    closeAnalytics: () => setAnalyticsOpen(false),
    openCloseShift: () => academy.emit({ type: "close-shift-open" }),
    confirmCloseShift: () => academy.emit({ type: "close-shift-confirm" }),
  };
}
