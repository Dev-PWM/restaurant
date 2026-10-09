import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Building2,
  Check,
  Clock3,
  Copy,
  Flame,
  Volume2,
} from "lucide-react";
import type { Order } from "../../../../shared/types/realtime";
import { BBVA_BANK_INFO } from "../../../../shared/types/zapata";
import {
  Brand,
  chime,
  enableAudio,
  mxn,
  OrderLines,
  orderLabel,
  PWAInstallButton,
  SoundButton,
  time,
} from "../../../../shared/ui/components";
import { useRealtime } from "../../../../shared/ui/RealtimeProvider";

/** Bank details for a customer who chose SPEI. The reference carries the real order number so the cashier can match it. */
function SpeiInstructions({ order }: { order: Order }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const reference = `${BBVA_BANK_INFO.conceptPrefix}${String(order.number).padStart(3, "0")}`;
  async function copyClabe() {
    try {
      await navigator.clipboard.writeText(BBVA_BANK_INFO.clabe);
    } catch {
      return; // Clipboard blocked: the CLABE stays on screen to type or long-press.
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2500);
  }
  return (
    <div
      className="rounded-xl border-2 border-blue-300 bg-blue-50/70 p-4 text-left text-blue-950"
      data-testid="spei-instructions"
    >
      <div className="flex items-center gap-2 text-sm font-black">
        <Building2 size={16} />
        Paga por transferencia
      </div>
      <dl className="mt-3 space-y-2.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-xs font-bold uppercase tracking-wide text-blue-900/70">
            Monto exacto
          </dt>
          <dd className="text-xl font-black tabular-nums">
            {mxn(order.totalCents)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-blue-900/70">
            Banco · Titular
          </dt>
          <dd className="font-bold">
            {BBVA_BANK_INFO.bank} · {BBVA_BANK_INFO.beneficiary}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-blue-900/70">
            CLABE (18 dígitos)
          </dt>
          <dd className="mt-1 flex items-center justify-between gap-2 rounded-lg border-2 border-blue-200 bg-white p-2">
            <code className="font-mono text-sm font-black tracking-wider select-all">
              {BBVA_BANK_INFO.clabe}
            </code>
            <button
              type="button"
              className="flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-900 px-3 text-xs font-bold text-white"
              onClick={() => void copyClabe()}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "¡Copiada!" : "Copiar"}
            </button>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-blue-900/70">
            Referencia / concepto
          </dt>
          <dd className="font-mono font-black">{reference}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-blue-900">
        Haz la transferencia desde tu app del banco con el monto exacto y esta
        referencia. Muestra el comprobante en el mostrador: el cajero verifica
        que llegó antes de entregarte tu pedido.
      </p>
    </div>
  );
}

/**
 * "Your order is ready" outside the page. Android Chrome refuses `new Notification()` ("Illegal constructor") and
 * wants the service worker to show it, so that goes first; a failure here must never break the screen.
 */
async function showReadyNotification(order: Order) {
  const title = `Pedido ${orderLabel(order)} listo`;
  const options = {
    body: "Pasa al mostrador para recoger tu pedido.",
    tag: order.id,
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
  } catch {
    // Fall back to the page notification below.
  }
  try {
    new Notification(title, options);
  } catch {
    // This browser cannot show notifications from the page either.
  }
}

/** How long the full-screen "ready" moment stays up; a tap dismisses it sooner. */
const READY_REVEAL_MS = 3000;

export function OrderStatus({
  order,
  onNewOrder,
}: {
  order: Order;
  onNewOrder: () => void;
}) {
  const { snapshot, connected } = useRealtime();
  const previous = useRef(order.status);
  const [testedSound, setTestedSound] = useState(false);
  const [readyReveal, setReadyReveal] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    () =>
      !window.isSecureContext || typeof Notification === "undefined"
        ? "unsupported"
        : Notification.permission,
  );

  useEffect(() => {
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    if (order.status === "ready" && previous.current !== "ready") {
      chime(true);
      setReadyReveal(true);
      revealTimer = setTimeout(() => setReadyReveal(false), READY_REVEAL_MS);
      try {
        if ("vibrate" in navigator) {
          navigator.vibrate([250, 100, 250, 100, 400]);
        }
      } catch {
        // Ignore vibration restrictions
      }
      if (notificationPermission === "granted") void showReadyNotification(order);
    } else if (order.status !== "ready") {
      setReadyReveal(false);
    }
    previous.current = order.status;
    return () => clearTimeout(revealTimer);
    // The order object is rebuilt on every update; only its status decides whether to announce.
  }, [order.status, notificationPermission]);

  const ready = order.status === "ready";
  const done = ["completed", "no_show"].includes(order.status);
  const cooking = order.status === "cooking";
  const review = order.status === "review";

  // Calculate live queue position
  let estimatedMinutes = 0;
  let queuePosition = 0;
  if (snapshot && !done && !ready) {
    // A customer's snapshot holds only their own orders, so the line comes from the shared order numbers.
    // Older servers do not send them: fall back to the customer's own orders.
    const waiting =
      snapshot.queueNumbers ??
      snapshot.activeOrders
        .filter((o) => o.status === "review" || o.status === "cooking")
        .map((o) => o.number);
    queuePosition = waiting.filter((number) => number < order.number).length + 1;
    estimatedMinutes = Math.max(3, queuePosition * 4);
  }

  const testAudioChime = async () => {
    if (await enableAudio()) {
      chime(true);
      setTestedSound(true);
    }
  };

  return (
    <div
      className={`min-h-screen px-4 py-7 sm:px-6 transition-colors duration-200 ${
        ready
          ? "bg-gradient-to-b from-emerald-50 via-emerald-50/40 to-white"
          : "bg-cream"
      }`}
    >
      <div className="mx-auto max-w-lg space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-3 border-b border-stone-200/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <Brand />
          <div className="flex flex-wrap items-center gap-2">
            {notificationPermission === "default" && (
                <button
                  onClick={async () =>
                    setNotificationPermission(
                      await Notification.requestPermission(),
                    )
                  }
                  className="flex min-h-10 items-center gap-1 rounded-full border border-stone-200 bg-white px-3.5 py-1 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50"
                >
                  <Bell size={13} className="text-clay-600" />
                  <span>Avisarme al estar listo</span>
                </button>
              )}
            <button
              onClick={testAudioChime}
              className="flex min-h-10 items-center gap-1 rounded-full border border-stone-200 bg-white px-3.5 py-1 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50"
              title="Probar sonido de campana"
            >
              <Volume2 size={13} className="text-clay-600" />
              <span>{testedSound ? "Sonido listo ✓" : "Probar timbre"}</span>
            </button>
            <SoundButton />
            <PWAInstallButton />
          </div>
        </header>

        {/* Big Ticket Banner */}
        <section
          className={`overflow-hidden rounded-2xl border-2 bg-white p-6 text-center shadow-xs transition-all ${
            ready
              ? "border-emerald-500 shadow-emerald-100"
              : cooking
                ? "border-orange-400 shadow-orange-100"
                : review
                  ? "border-amber-400 shadow-amber-100"
                  : "border-stone-200"
          }`}
          aria-live="polite"
        >
          {/* Status Badge */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-bold uppercase tracking-wider">
            {review && (
              <span className="flex items-center gap-1.5 text-amber-900 bg-amber-100 px-3 py-1 rounded-full">
                <Clock3 size={14} />
                En revisión por el negocio
              </span>
            )}
            {cooking && (
              <span className="flex items-center gap-1.5 text-orange-950 bg-orange-100 px-3 py-1 rounded-full">
                <Flame size={14} className="animate-bump text-orange-600" />
                Paso 2: Manos a la Masa
              </span>
            )}
            {ready && (
              <span className="flex items-center gap-1.5 text-emerald-950 bg-emerald-100 px-3.5 py-1.5 rounded-full ring-2 ring-emerald-500/30 font-black animate-bump">
                <Check size={16} />
                ¡Tu pedido está listo!
              </span>
            )}
            {done && (
              <span className="flex items-center gap-1.5 text-stone-800 bg-stone-100 px-3 py-1 rounded-full">
                <Check size={14} />
                {order.status === "no_show" ? "Pedido cancelado / No-Show" : "Pedido entregado"}
              </span>
            )}
          </div>

          <div className="mb-1 text-stone-500 text-xs font-semibold uppercase tracking-wider">
            Comanda número
          </div>
          <p className="display mb-2 text-6xl sm:text-7xl font-bold tracking-tight text-clay-950">
            {orderLabel(order)}
          </p>
          <h1 className="text-xl font-bold text-stone-900">
            {order.customerName}
          </h1>

          {/* Contextual Status Guidance */}
          <div className="mt-4 rounded-xl p-4 text-sm leading-relaxed">
            {review && (
              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 text-amber-950 text-left space-y-2">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white font-bold text-xs mt-0.5">
                    !
                  </div>
                  <div>
                    <strong className="block text-sm font-bold text-amber-950">
                      Tu pedido está en revisión
                    </strong>
                    <p className="text-xs text-amber-900 mt-1">
                      El negocio confirmará tu pedido antes de comenzar a cocinar. Aún no tienes que pagar.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {cooking && (
              <div className="bg-orange-50/80 border border-orange-200 rounded-xl p-4 text-orange-950 text-left space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-orange-900 flex items-center gap-1.5">
                    <Clock3 size={15} className="animate-spin text-orange-600" />
                    Tiempo estimado: ~{estimatedMinutes}–{estimatedMinutes + 4} min
                  </span>
                  <span className="text-xs font-black text-orange-800 bg-orange-100 px-2 py-0.5 rounded-md">
                    #{queuePosition} en comal
                  </span>
                </div>
                <p className="text-xs text-orange-900 leading-relaxed">
                  Tu pedido está en preparación. Puedes pagar {order.paymentIntent === "spei" ? "por transferencia" : "en efectivo"} al recogerlo; deja esta pantalla abierta o activa los avisos para enterarte cuando esté listo.
                </p>
              </div>
            )}

            {ready && (
              <div className="bg-emerald-100/90 border border-emerald-300 rounded-xl p-4 text-emerald-950 text-left space-y-2 animate-ready-rise">
                <strong className="block text-base font-black text-emerald-950">
                  ¡Pasa al mostrador a recoger tu charola!
                </strong>
                <p className="text-xs text-emerald-900">
                  Muestra tu número <strong>{orderLabel(order)}</strong> ({order.customerName}){" "}
                  {order.paymentIntent === "spei" ? (
                    <>
                      y tu comprobante de transferencia por{" "}
                      <strong>{mxn(order.totalCents)} MXN</strong> para recogerlo.
                    </>
                  ) : (
                    <>
                      y paga <strong>{mxn(order.totalCents)} MXN</strong> en caja para recogerlo.
                    </>
                  )}
                </p>
              </div>
            )}

            {order.status === "completed" && (
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-stone-700 text-center">
                <p className="font-semibold text-sm">
                  ¡Gracias por tu visita! Que disfrutes tus antojitos.
                </p>
              </div>
            )}
            {order.status === "no_show" && (
              <div className="bg-stone-100 border border-stone-300 rounded-xl p-4 text-stone-700 text-center">
                <p className="font-semibold text-sm">
                  El negocio registró este pedido como cancelado / No-Show. No se registró ningún pago.
                </p>
              </div>
            )}
          </div>

          {/* Live order progress: review -> cooking -> pickup */}
          <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50/90 p-4.5 text-left">
            <div className="mb-2.5 flex items-center justify-between text-xs">
              <span className="font-bold text-stone-700 uppercase tracking-wider text-[11px]">
                Progreso en cocina
              </span>
              <span
                className={`font-black tabular-nums text-xs ${
                  ready || done
                    ? "text-emerald-800"
                    : cooking
                      ? "text-orange-700"
                      : "text-amber-800"
                }`}
              >
                {order.status === "no_show"
                  ? "Cancelado · Sin pago"
                  : review
                  ? "10% · En revisión"
                  : cooking
                    ? "55% · Cocinando"
                    : ready
                      ? "85% · Listo para recoger"
                      : "100% · Entregado"}
              </span>
            </div>

            {/* Continuous Animated Progress Track */}
            <div
              className="relative h-3.5 w-full overflow-hidden rounded-full bg-stone-200/80 p-0.5 shadow-inner"
              role="progressbar"
              aria-label="Progreso de preparación del pedido"
              aria-valuenow={review ? 10 : cooking ? 55 : ready ? 85 : 100}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded-full transition-all duration-220 ease-out shadow-xs ${
                  done
                    ? "w-full bg-emerald-600"
                    : ready
                      ? "w-[85%] bg-emerald-500"
                    : cooking
                      ? "w-[55%] bg-gradient-to-r from-clay-600 via-orange-500 to-amber-500"
                      : "w-[10%] bg-amber-400"
                }`}
              />
            </div>

            {/* 3 Explicit Workflow Milestones: 'paid' -> 'cooking' -> 'ready' */}
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-stone-200/70 pt-3 text-center">
              {/* Stage 1: Review */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    cooking || ready || order.status === "completed"
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : review
                        ? "bg-amber-400 text-amber-950 ring-2 ring-amber-300"
                        : "bg-stone-200 text-stone-400"
                  }`}
                >
                  {cooking || ready || order.status === "completed" ? (
                    <Check size={14} />
                  ) : (
                    <Clock3 size={13} />
                  )}
                </div>
                <strong
                  className={`mt-1.5 text-[11px] font-bold ${
                    review
                      ? "text-amber-900"
                      : cooking || ready || order.status === "completed"
                        ? "text-stone-900"
                        : "text-stone-400"
                  }`}
                >
                  1. En revisión
                </strong>
                <span className="text-[10px] text-stone-500 leading-tight">
                  {review ? "Esperando confirmación" : "Pedido confirmado"}
                </span>
              </div>

              {/* Stage 2: Cooking */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    ready || order.status === "completed"
                      ? "bg-emerald-600 text-white"
                      : cooking
                        ? "bg-orange-500 text-white ring-4 ring-orange-200 animate-bump"
                        : "bg-stone-200 text-stone-400"
                  }`}
                >
                  {ready || order.status === "completed" ? (
                    <Check size={14} />
                  ) : (
                    <Flame size={14} />
                  )}
                </div>
                <strong
                  className={`mt-1.5 text-[11px] font-bold ${
                    cooking
                      ? "text-orange-950 font-black"
                      : ready || order.status === "completed"
                        ? "text-stone-900"
                        : "text-stone-400"
                  }`}
                >
                  2. Cocinando
                </strong>
                <span className="text-[10px] text-stone-500 leading-tight">
                  {cooking
                    ? "Al comal vivo"
                    : ready || order.status === "completed"
                      ? "Preparado ✓"
                      : order.status === "no_show"
                        ? "Cancelado"
                        : "Esperando confirmación"}
                </span>
              </div>

              {/* Stage 3: Ready */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    ready
                      ? "bg-emerald-600 text-white ring-4 ring-emerald-200 animate-bump shadow-xs"
                      : done
                        ? "bg-emerald-700 text-white"
                        : "bg-stone-200 text-stone-400"
                  }`}
                >
                  <Check size={14} />
                </div>
                <strong
                  className={`mt-1.5 text-[11px] font-bold ${
                    ready
                      ? "text-emerald-950 font-black"
                      : done
                        ? "text-stone-900"
                        : "text-stone-400"
                  }`}
                >
                  3. Recoger
                </strong>
                <span className="text-[10px] text-stone-500 leading-tight">
                  {ready
                    ? "¡Recoger ahora!"
                    : order.status === "completed"
                      ? "Pagado y entregado ✓"
                      : order.status === "no_show"
                        ? "Cancelado"
                      : "Pendiente"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Itemized Order Breakdown */}
        <section className="panel space-y-3 bg-white border-stone-200">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="text-sm font-bold text-stone-900">
              Resumen de tu Orden
            </h2>
            <span className="text-xs text-stone-500 font-mono">
              Registrado a las {time(order.createdAt)}
            </span>
          </div>

          <OrderLines order={order} variant="soft" />

          <div className="mt-3 flex items-center justify-between text-xs text-stone-600">
            <span>Tipo de pedido</span>
            <strong className="text-stone-800">
              {order.orderType === "dine_in" ? "Comer aquí" : "Para llevar"}
            </strong>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-stone-200 pt-3 text-base font-bold">
            <span className="text-stone-800">Total</span>
            <span className="text-xl tabular-nums text-clay-950">
              {mxn(order.totalCents)} MXN
            </span>
          </div>

          {order.transaction ? (
            <div className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-900 flex justify-between">
              {order.transaction.method === "spei" ? (
                <>
                  <span>Pagado por transferencia</span>
                  <span>Recibimos {mxn(order.transaction.totalCents)}</span>
                </>
              ) : (
                <>
                  <span>Pagado en efectivo al mostrador</span>
                  <span>
                    Cambio recibido: {mxn(order.transaction.changeCents)}
                  </span>
                </>
              )}
            </div>
          ) : order.paymentIntent === "spei" && order.status !== "no_show" ? (
            <SpeiInstructions order={order} />
          ) : (
            <div className="rounded-lg bg-stone-50 p-2.5 text-xs text-stone-600 flex justify-between">
              <span>Pago al recoger</span>
              <span className="font-semibold">Efectivo en mostrador</span>
            </div>
          )}
        </section>

        {/* Order actions */}
        <div className="space-y-3">
          {done && (
            <button
              className="btn btn-primary w-full py-3 text-sm font-bold"
              disabled={!connected}
              onClick={onNewOrder}
            >
              Hacer otro pedido
            </button>
          )}
        </div>

        <p className="text-center text-xs text-stone-500">
          Esta pantalla se actualiza en vivo. Si sales de la página, tu comanda se restaurará automáticamente.
        </p>
      </div>
      {readyReveal && (
        <div
          className="animate-ready-rise fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-emerald-800 px-6 text-center text-white"
          role="status"
          aria-live="assertive"
          onClick={() => setReadyReveal(false)}
        >
          <Check size={64} />
          <p className="display mt-5 text-4xl font-bold">
            ¡Tu pedido está listo!
          </p>
          <p className="mt-3 text-lg">
            Pasa al mostrador por tu pedido {orderLabel(order)}.
          </p>
          <p className="mt-8 text-sm text-emerald-100">Toca para continuar</p>
        </div>
      )}
    </div>
  );
}
