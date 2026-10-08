import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Lock,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useAcademy } from "./AcademyProvider";
import type { ResolvedStep } from "./types";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

/** Where the coach card lives: pinned to one screen edge, or inside the dialog it explains. */
type Dock = "top" | "bottom" | "slot";

const EDGE_GAP = 8;
const SETTLE_MS = 180;

/** First element for the target that is actually on screen (hidden phone lanes have no layout). */
function firstVisible(target: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(
    `[data-tour-target="${target}"]`,
  ))
    if (element.getClientRects().length > 0) return element;
  return null;
}

/**
 * Height of sticky UI pinned under the Academy bar (the phone lane tabs). Content scrolls
 * beneath it, so a target must be brought below it, not just below the bar.
 */
function stickyInset(target: HTMLElement): number {
  const strip = document.querySelector<HTMLElement>("[data-sticky-inset]");
  if (!strip || strip.contains(target) || strip.getClientRects().length === 0)
    return 0;
  return Math.round(strip.getBoundingClientRect().height);
}

/** Inside a dialog the coach card is part of its sticky header (title + card). */
function coachHeader(target: HTMLElement): HTMLElement | null {
  return (
    target
      .closest<HTMLElement>("[data-academy-modal]")
      ?.querySelector<HTMLElement>("[data-academy-coach-slot]")
      ?.parentElement ?? null
  );
}

/** How far the target must stay from the top and bottom of its scroll container. */
function scrollMargins(
  target: HTMLElement,
  side: Dock,
  bar: number,
  card: number,
) {
  const header = side === "slot" ? coachHeader(target) : null;
  const headerHeight = header?.getBoundingClientRect().height ?? 0;
  const top =
    side === "top"
      ? bar + card + 20
      : side === "slot"
        ? (headerHeight || 96) + 12
        : bar + stickyInset(target) + 16;
  return { top, bottom: side === "bottom" ? card + 24 : 24, headerHeight };
}

/**
 * Where the element sits in the page layout, ignoring scrolling and transforms
 * (`offsetTop` is a layout position). It only changes when the layout really shifts, so
 * it tells a shift apart from the person scrolling (momentum flings and scrollbar drags
 * included) and from a card still sliding between lanes with a transform.
 */
function layoutTop(element: HTMLElement): number {
  let top = 0;
  for (
    let node: Element | null = element;
    node instanceof HTMLElement;
    node = node.offsetParent
  )
    top += node.offsetTop;
  return top;
}

function toBox(rect: DOMRect): Box {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  };
}

/**
 * The spotlight for the current step. It is keyed by step, so every step starts fresh:
 * it finds the control, scrolls it into the band the coach card leaves free, draws a
 * cutout exactly over it, and keeps the card from ever covering it.
 */
export function CoachmarkSpotlight() {
  const academy = useAcademy();
  const { active, step } = academy;
  if (!active || !step) return null;
  return (
    <Spotlight
      key={`${step.id}:${academy.state.runId}`}
      step={step}
      lock={academy.explainLockRemaining}
      hesitating={academy.hesitating}
      onContinue={() => academy.dispatch({ type: "CONTINUE" })}
    />
  );
}

function Spotlight({
  step,
  lock,
  hesitating,
  onContinue,
}: {
  step: ResolvedStep;
  lock: number;
  hesitating: boolean;
  onContinue: () => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [dock, setDock] = useState<Dock>("bottom");
  const [barBottom, setBarBottom] = useState(0);
  const [compact, setCompact] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [cardHeight, setCardHeight] = useState(220);
  const [settled, setSettled] = useState(0);

  const cardRef = useRef<HTMLElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const dockChosen = useRef(false);
  const flips = useRef(0);
  const cardHeightRef = useRef(cardHeight);
  const barBottomRef = useRef(0);
  const topInsetRef = useRef(0);
  const scrolledWith = useRef(0);
  const scrolledHeader = useRef(0);
  const dockRef = useRef<Dock>("bottom");
  const autoScrolls = useRef(0);
  const lastInput = useRef(0);
  const lastLayoutTop = useRef<number | null>(null);
  const recheck = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  cardHeightRef.current = cardHeight;
  dockRef.current = dock;

  /** Scrolls the target into the band the card leaves free (scroll-margin makes every scroll container honor it). */
  const bringIntoView = useCallback((element: HTMLElement, side: Dock) => {
    const card = cardHeightRef.current;
    const margins = scrollMargins(element, side, barBottomRef.current, card);
    element.style.scrollMarginTop = `${margins.top}px`;
    element.style.scrollMarginBottom = `${margins.bottom}px`;
    scrolledWith.current = card;
    scrolledHeader.current = margins.headerHeight;
    // Instant on purpose: the card and cutout must land on a stable layout, and a smooth
    // scroll is silently skipped in a background tab.
    element.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
    clearTimeout(scrollTimer.current);
    // The scroll above is instant, so the layout is stable almost at once; the short wait
    // only lets the card finish rendering before it is checked against the target.
    scrollTimer.current = setTimeout(() => setSettled((tick) => tick + 1), 200);
  }, []);

  /**
   * The layout can shift after the first scroll (a summary card appears above the target,
   * a lane re-renders). Bring the target back into its band, a few times at most and never
   * while the person is scrolling themselves.
   */
  const keepInView = useCallback(
    (element: HTMLElement, rect: DOMRect) => {
      if (autoScrolls.current >= 6 || Date.now() - lastInput.current < 800)
        return;
      const side = dockRef.current;
      const margins = scrollMargins(
        element,
        side,
        barBottomRef.current,
        cardHeightRef.current,
      );
      const header = side === "slot" ? coachHeader(element) : null;
      const top = header
        ? header.getBoundingClientRect().bottom + 12
        : margins.top;
      const bottom = window.innerHeight - margins.bottom;
      // A target taller than the free band can never fit; scrolling would only chase it.
      if (rect.height > bottom - top) return;
      if (rect.top >= top - 2 && rect.bottom <= bottom + 2) return;
      autoScrolls.current += 1;
      bringIntoView(element, side);
    },
    [bringIntoView],
  );

  const measure = useCallback(() => {
    const element = firstVisible(step.target);
    const bar = document.querySelector<HTMLElement>("[data-academy-bar]");
    barBottomRef.current = bar
      ? Math.round(bar.getBoundingClientRect().bottom)
      : 0;
    setBarBottom(barBottomRef.current);
    if (targetRef.current && targetRef.current !== element) {
      targetRef.current.style.removeProperty("scroll-margin-top");
      targetRef.current.style.removeProperty("scroll-margin-bottom");
    }
    targetRef.current = element;
    topInsetRef.current =
      barBottomRef.current + (element ? stickyInset(element) : 0);
    if (!element) {
      setBox(null);
      setSlot(null);
      return;
    }
    const slotElement =
      element
        .closest<HTMLElement>("[data-academy-modal]")
        ?.querySelector<HTMLElement>("[data-academy-coach-slot]") ?? null;
    setSlot(slotElement);
    if (!dockChosen.current) {
      dockChosen.current = true;
      const rect = element.getBoundingClientRect();
      // The card goes to the edge farthest from the control.
      const side: Dock = slotElement
        ? "slot"
        : rect.top + rect.height / 2 > window.innerHeight / 2
          ? "top"
          : "bottom";
      setDock(side);
      bringIntoView(element, side);
    } else {
      const top = layoutTop(element);
      // A layout shift is worth correcting; the person scrolling is not. An animation that
      // has just landed is checked too, because a transform in flight hides where the
      // control really ends up.
      const shifted =
        lastLayoutTop.current !== null &&
        Math.abs(top - lastLayoutTop.current) > 2;
      if (shifted || recheck.current)
        keepInView(element, element.getBoundingClientRect());
      recheck.current = false;
    }
    lastLayoutTop.current = layoutTop(element);
    setBox(toBox(element.getBoundingClientRect()));
  }, [step.target, bringIntoView, keepInView]);

  // Track the target. Layout changes (resize, scroll, a dialog opening, a card sliding
  // to another lane) all funnel into one frame-coalesced measurement.
  useLayoutEffect(() => {
    let frame = 0;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    let queued = false;
    let alive = true;
    // Cards slide between lanes and new tickets fade in with Web Animations, which fire no
    // animationend. Watch every running animation and measure again when it lands.
    const tracked = new WeakSet<Animation>();
    const trackAnimations = () => {
      if (typeof document.getAnimations !== "function") return;
      for (const animation of document.getAnimations()) {
        if (tracked.has(animation) || animation.playState === "finished")
          continue;
        tracked.add(animation);
        animation.finished.then(
          () => {
            if (!alive) return;
            recheck.current = true;
            schedule();
          },
          () => {},
        );
      }
    };
    // One measurement per burst of layout changes. A frame callback is the best moment, but
    // it never fires while the page is hidden, so a short timer backs it up.
    const schedule = () => {
      if (queued) return;
      queued = true;
      const run = () => {
        if (!queued) return;
        queued = false;
        cancelAnimationFrame(frame);
        clearTimeout(fallback);
        measure();
        trackAnimations();
      };
      frame = requestAnimationFrame(run);
      fallback = setTimeout(run, 120);
    };
    const onScroll = () => {
      schedule();
      clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(
        () => setSettled((tick) => tick + 1),
        SETTLE_MS,
      );
    };
    measure();
    trackAnimations();
    // The board's lane-slide animation is created by a parent effect that runs after this
    // one in the same commit, so look again as soon as the commit is done.
    queueMicrotask(trackAnimations);
    const settle = [260, 650].map((delay) => setTimeout(schedule, delay));
    const onInput = () => {
      lastInput.current = Date.now();
    };
    const inputEvents = [
      "wheel",
      "touchmove",
      "keydown",
      "pointerdown",
    ] as const;
    for (const name of inputEvents)
      window.addEventListener(name, onInput, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("transitionend", schedule, true);
    document.addEventListener("animationend", schedule, true);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    return () => {
      alive = false;
      queued = false;
      settle.forEach(clearTimeout);
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
      clearTimeout(scrollTimer.current);
      observer.disconnect();
      for (const name of inputEvents)
        window.removeEventListener(name, onInput, { capture: true });
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("transitionend", schedule, true);
      document.removeEventListener("animationend", schedule, true);
      targetRef.current?.style.removeProperty("scroll-margin-top");
      targetRef.current?.style.removeProperty("scroll-margin-bottom");
    };
  }, [measure]);

  // The card's real height is only known after it renders: redo the scroll once if the estimate was off.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new ResizeObserver(() =>
      setCardHeight(Math.round(card.getBoundingClientRect().height)),
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [dock, slot]);
  useEffect(() => {
    const element = targetRef.current;
    if (element && Math.abs(cardHeight - scrolledWith.current) > 24)
      bringIntoView(element, dock);
  }, [cardHeight, dock, bringIntoView]);
  // Inside a dialog the card is part of the sticky header, so the content slides down the
  // moment the card mounts there. Scroll again whenever that header changes height.
  useEffect(() => {
    const header = dock === "slot" ? slot?.parentElement : null;
    if (!header) return;
    const sync = () => {
      const element = targetRef.current;
      if (
        element &&
        Math.abs(
          header.getBoundingClientRect().height - scrolledHeader.current,
        ) > 2
      )
        bringIntoView(element, "slot");
    };
    // Compared with the height the last scroll was computed for, not the height now: the
    // card is usually already in the header by the time this effect runs.
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(header);
    return () => observer.disconnect();
  }, [dock, slot, bringIntoView]);

  // Never cover the control. Evaluated only once scrolling has stopped, so a card in
  // motion cannot trigger a false collision.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !box || dock === "slot" || settled === 0) return;
    const rect = card.getBoundingClientRect();
    const overlaps =
      box.top < rect.bottom + 6 &&
      box.bottom > rect.top - 6 &&
      box.left < rect.right &&
      box.right > rect.left;
    // A tall control (a whole ticket) can sit partly off screen even without touching the card.
    const clipped =
      box.top < topInsetRef.current - 1 || box.bottom > window.innerHeight + 1;
    if (!overlaps && !clipped) return;
    if (!compact) setCompact(true);
    else if (overlaps && flips.current < 1) {
      flips.current += 1;
      setDock((side) => (side === "top" ? "bottom" : "top"));
      dockChosen.current = true;
    }
  }, [box, dock, cardHeight, compact, settled]);

  const locked = lock > 0 && step.kind === "act";
  const ringOnly = dock === "slot";
  const card = (
    <CoachCard
      ref={cardRef}
      step={step}
      locked={locked}
      lock={lock}
      compact={compact}
      expanded={expanded}
      onToggleExpanded={() => setExpanded((open) => !open)}
      onContinue={onContinue}
      inSlot={dock === "slot"}
    />
  );

  return (
    <>
      {createPortal(
        <>
          {box && (
            <div
              aria-hidden="true"
              className="academy-cutout z-layer-academy"
              data-locked={locked}
              data-pulse={hesitating && !locked}
              style={{
                top: box.top - 6,
                left: box.left - 6,
                width: box.width + 12,
                height: box.height + 12,
                ...(ringOnly ? { boxShadow: "0 0 0 4px #facc15" } : null),
              }}
            >
              {locked && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-black uppercase tracking-wide text-black shadow-lg">
                    <Lock className="size-3.5" aria-hidden="true" />
                    Lee {lock}s
                  </span>
                </span>
              )}
            </div>
          )}
          {dock !== "slot" && (
            <div
              className="z-layer-academy pointer-events-none fixed inset-x-0 flex justify-center px-2"
              style={
                dock === "top"
                  ? { top: barBottom + EDGE_GAP }
                  : {
                      bottom: `max(${EDGE_GAP}px, env(safe-area-inset-bottom))`,
                    }
              }
            >
              {card}
            </div>
          )}
        </>,
        document.body,
      )}
      {dock === "slot" && slot && createPortal(card, slot)}
    </>
  );
}

const CoachCard = forwardRef<
  HTMLElement,
  {
    step: ResolvedStep;
    locked: boolean;
    lock: number;
    compact: boolean;
    expanded: boolean;
    onToggleExpanded: () => void;
    onContinue: () => void;
    inSlot: boolean;
  }
>(function CoachCard(
  {
    step,
    locked,
    lock,
    compact,
    expanded,
    onToggleExpanded,
    onContinue,
    inSlot,
  },
  ref,
) {
  const showDetails = !compact || expanded;
  return (
    <section
      ref={ref}
      role="status"
      aria-live="polite"
      className={`pointer-events-auto w-full overflow-y-auto overscroll-contain border-yellow-400 bg-stone-900 text-white shadow-2xl ${
        inSlot
          ? "max-h-[38dvh] border-b-4"
          : "max-h-[46dvh] max-w-3xl rounded-3xl border-2"
      }`}
    >
      {/* Phones: header, details, button. Tablets: instruction and button on the left, what-happens on the right. */}
      <div
        className={`grid gap-x-4 gap-y-2 p-3 sm:p-4 ${showDetails ? "md:grid-cols-2" : ""}`}
      >
        <div className="min-w-0 space-y-1.5 md:col-start-1">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate rounded-full border border-yellow-400/40 bg-yellow-400/15 px-3 py-1 text-xs font-black uppercase tracking-wide text-yellow-200">
              Módulo {step.moduleNumber}: {step.moduleTitle}
            </span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-stone-300">
              Paso {step.stepNumber} de {step.totalSteps}
            </span>
          </div>
          <h3 className="text-base font-black leading-tight text-yellow-300">
            {step.title}
          </h3>
          <p className="text-sm font-semibold leading-snug text-stone-50">
            {step.instruction}
          </p>
        </div>
        {showDetails && (
          <div className="space-y-2 rounded-2xl border border-stone-700 bg-stone-950/80 p-3 text-xs leading-relaxed md:col-start-2 md:row-span-2 md:row-start-1">
            <p className="flex items-start gap-2">
              <Zap
                className="mt-0.5 size-4 shrink-0 text-amber-400"
                aria-hidden="true"
              />
              <span>
                <strong className="block text-amber-300">En el sistema</strong>
                <span className="text-stone-200">{step.consequence}</span>
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
                <span className="text-stone-200">{step.why}</span>
              </span>
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 md:col-start-1 md:self-end">
          {compact ? (
            <button
              type="button"
              data-tour-allow="coach-more"
              onClick={onToggleExpanded}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-xs font-bold text-amber-300 underline"
            >
              {expanded ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
              {expanded ? "Ocultar detalles" : "Ver qué pasa en el sistema"}
            </button>
          ) : (
            <span />
          )}
          {step.kind === "info" ? (
            <button
              type="button"
              data-tour-allow="coach-continue"
              onClick={onContinue}
              className="btn btn-primary min-h-12 flex-1 gap-2 text-base font-black sm:flex-none sm:px-8"
            >
              Entendido
              <ArrowRight className="size-5" aria-hidden="true" />
            </button>
          ) : locked ? (
            <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-600/40 bg-amber-950/50 px-3 text-xs font-bold text-amber-200">
              <Lock className="size-4" aria-hidden="true" />
              Lee con calma: se desbloquea en {lock}s
            </span>
          ) : (
            <span className="inline-flex min-h-11 items-center rounded-xl border border-emerald-600/40 bg-emerald-950/50 px-3 text-xs font-bold text-emerald-200">
              ¡Listo! Toca el botón resaltado en amarillo
            </span>
          )}
        </div>
      </div>
    </section>
  );
});
