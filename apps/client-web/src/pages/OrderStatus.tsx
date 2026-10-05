import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  ChefHat,
  Clock3,
  Coins,
  Flame,
  Printer,
  Sparkles,
  UtensilsCrossed,
  Volume2,
} from "lucide-react";
import type { Order } from "../../../../shared/types/realtime";
import {
  Brand,
  chime,
  enableAudio,
  mxn,
  OrderLines,
  orderLabel,
  PWAInstallButton,
  printThermalTicket,
  SoundButton,
  time,
} from "../../../../shared/ui/components";
import { useRealtime } from "../../../../shared/ui/RealtimeProvider";

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

  useEffect(() => {
    if (order.status === "ready" && previous.current !== "ready") {
      chime(true);
      try {
        if ("vibrate" in navigator) {
          navigator.vibrate([250, 100, 250, 100, 400]);
        }
      } catch {
        // Ignore vibration restrictions
      }
    }
    previous.current = order.status;
  }, [order.status]);

  const ready = order.status === "ready";
  const done = ["completed", "no_show"].includes(order.status);
  const cooking = order.status === "cooking";
  const unpaid = order.status === "unpaid";

  // Calculate live queue position
  let estimatedMinutes = 0;
  let queuePosition = 0;
  if (snapshot && !done && !ready) {
    const activeCooking = snapshot.activeOrders.filter(
      (o) => o.status === "cooking",
    );
    const orderIndex = activeCooking.findIndex((o) => o.id === order.id);
    if (orderIndex >= 0) {
      queuePosition = orderIndex + 1;
      estimatedMinutes = Math.max(3, queuePosition * 4);
    } else {
      queuePosition = activeCooking.length + 1;
      estimatedMinutes = Math.max(5, queuePosition * 4);
    }
  }

  const steps = [
    { id: "unpaid", label: "Pago en Caja", num: 1 },
    { id: "cooking", label: "En el Comal", num: 2 },
    { id: "ready", label: "Listo en Barra", num: 3 },
    { id: "completed", label: "Entregado", num: 4 },
  ];

  const currentStepIndex =
    order.status === "unpaid" || order.status === "draft"
      ? 0
      : order.status === "cooking"
        ? 1
        : order.status === "ready"
          ? 2
          : 3;

  const testAudioChime = () => {
    enableAudio();
    chime(true);
    setTestedSound(true);
  };

  return (
    <div
      className={`min-h-screen px-4 py-7 sm:px-6 transition-colors duration-500 ${
        ready
          ? "bg-gradient-to-b from-emerald-50 via-emerald-50/40 to-white"
          : "bg-cream"
      }`}
    >
      <div className="mx-auto max-w-lg space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-stone-200/80 pb-4">
          <Brand />
          <div className="flex items-center gap-2">
            <button
              onClick={testAudioChime}
              className="flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50"
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
                : unpaid
                  ? "border-amber-400 shadow-amber-100"
                  : "border-stone-200"
          }`}
          aria-live="polite"
        >
          {/* Status Badge */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-bold uppercase tracking-wider">
            {unpaid && (
              <span className="flex items-center gap-1.5 text-amber-900 bg-amber-100 px-3 py-1 rounded-full">
                <Coins size={14} />
                Paso 1: Pago en Efectivo Pendiente
              </span>
            )}
            {cooking && (
              <span className="flex items-center gap-1.5 text-orange-950 bg-orange-100 px-3 py-1 rounded-full">
                <Flame size={14} className="animate-bounce text-orange-600" />
                Paso 2: Manos a la Masa
              </span>
            )}
            {ready && (
              <span className="flex items-center gap-1.5 text-emerald-950 bg-emerald-100 px-3.5 py-1.5 rounded-full ring-2 ring-emerald-500/30 font-black animate-pulse">
                <Check size={16} />
                ¡Tu pedido está listo!
              </span>
            )}
            {done && (
              <span className="flex items-center gap-1.5 text-stone-800 bg-stone-100 px-3 py-1 rounded-full">
                <Check size={14} />
                Servicio Concluido
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
            {unpaid && (
              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 text-amber-950 text-left space-y-2">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white font-bold text-xs mt-0.5">
                    !
                  </div>
                  <div>
                    <strong className="block text-sm font-bold text-amber-950">
                      Acércate a la caja con tu número {orderLabel(order)}
                    </strong>
                    <p className="text-xs text-amber-900 mt-1">
                      Paga <strong className="font-bold underline">{mxn(order.totalCents)} MXN</strong> en efectivo al mostrador para encender el comal de tu orden.
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
                  Tus antojitos ya están sobre la plancha. Deja tu teléfono cerca con volumen; sonará una campana cuando estén listos.
                </p>
              </div>
            )}

            {ready && (
              <div className="bg-emerald-100/90 border border-emerald-300 rounded-xl p-4 text-emerald-950 text-left space-y-2 animate-bounce">
                <strong className="block text-base font-black text-emerald-950">
                  ¡Pasa al mostrador a recoger tu charola!
                </strong>
                <p className="text-xs text-emerald-900">
                  Muestra tu número <strong>{orderLabel(order)}</strong> ({order.customerName}) para recibir tus antojitos calientitos.
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
          </div>

          {/* Real-time Kitchen Workflow Progress Bar ('paid' -> 'cooking' -> 'ready') */}
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
                {unpaid
                  ? "15% · Por Pagar"
                  : cooking
                    ? "65% · En el Comal"
                    : ready
                      ? "100% · ¡Listo!"
                      : "100% · Entregado"}
              </span>
            </div>

            {/* Continuous Animated Progress Track */}
            <div
              className="relative h-3.5 w-full overflow-hidden rounded-full bg-stone-200/80 p-0.5 shadow-inner"
              role="progressbar"
              aria-label="Progreso de preparación del pedido"
              aria-valuenow={
                unpaid ? 15 : cooking ? 65 : 100
              }
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-out shadow-xs ${
                  ready || done
                    ? "w-full bg-emerald-600"
                    : cooking
                      ? "w-[65%] bg-gradient-to-r from-clay-600 via-orange-500 to-amber-500 animate-pulse"
                      : "w-[15%] bg-amber-400"
                }`}
              />
            </div>

            {/* 3 Explicit Workflow Milestones: 'paid' -> 'cooking' -> 'ready' */}
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-stone-200/70 pt-3 text-center">
              {/* Stage 1: Paid */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    order.transaction || cooking || ready || done
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "bg-amber-400 text-amber-950 ring-2 ring-amber-300 animate-pulse"
                  }`}
                >
                  {order.transaction || cooking || ready || done ? (
                    <Check size={14} />
                  ) : (
                    <Coins size={13} />
                  )}
                </div>
                <strong
                  className={`mt-1.5 text-[11px] font-bold ${
                    order.transaction || cooking || ready || done
                      ? "text-stone-900"
                      : "text-amber-900"
                  }`}
                >
                  1. Pagado
                </strong>
                <span className="text-[10px] text-stone-500 leading-tight">
                  {order.transaction || cooking || ready || done
                    ? "En efectivo ✓"
                    : "En mostrador"}
                </span>
              </div>

              {/* Stage 2: Cooking */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    ready || done
                      ? "bg-emerald-600 text-white"
                      : cooking
                        ? "bg-orange-500 text-white ring-4 ring-orange-200 animate-bounce"
                        : "bg-stone-200 text-stone-400"
                  }`}
                >
                  {ready || done ? (
                    <Check size={14} />
                  ) : (
                    <Flame size={14} />
                  )}
                </div>
                <strong
                  className={`mt-1.5 text-[11px] font-bold ${
                    cooking
                      ? "text-orange-950 font-black"
                      : ready || done
                        ? "text-stone-900"
                        : "text-stone-400"
                  }`}
                >
                  2. Cocinando
                </strong>
                <span className="text-[10px] text-stone-500 leading-tight">
                  {cooking
                    ? "Al comal vivo"
                    : ready || done
                      ? "Preparado ✓"
                      : "Espera pago"}
                </span>
              </div>

              {/* Stage 3: Ready */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    ready
                      ? "bg-emerald-600 text-white ring-4 ring-emerald-200 animate-bounce shadow-xs"
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
                  3. Listo
                </strong>
                <span className="text-[10px] text-stone-500 leading-tight">
                  {ready
                    ? "¡Recoger ahora!"
                    : done
                      ? "Entregado ✓"
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

          <OrderLines order={order} />

          <div className="mt-4 flex items-center justify-between border-t border-stone-200 pt-3 text-base font-bold">
            <span className="text-stone-800">Total</span>
            <span className="text-xl tabular-nums text-clay-950">
              {mxn(order.totalCents)} MXN
            </span>
          </div>

          {order.transaction ? (
            <div className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-900 flex justify-between">
              <span>Pagado en efectivo al mostrador</span>
              <span>
                Cambio recibido: {mxn(order.transaction.changeCents)}
              </span>
            </div>
          ) : (
            <div className="rounded-lg bg-stone-50 p-2.5 text-xs text-stone-600 flex justify-between">
              <span>Método de pago</span>
              <span className="font-semibold">Solo efectivo en caja</span>
            </div>
          )}
        </section>

        {/* Actions & Utilities */}
        <div className="space-y-3">
          <button
            className="btn w-full bg-white border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-semibold py-2.5"
            onClick={() => printThermalTicket(order)}
          >
            <Printer size={15} />
            <span>Ver / Guardar Recibo Digital</span>
          </button>

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
    </div>
  );
}
