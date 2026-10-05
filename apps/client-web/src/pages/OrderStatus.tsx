import { useEffect, useRef } from "react";
import { Check, ChefHat, Clock3 } from "lucide-react";
import type { Order } from "../../../../shared/types/realtime";
import {
  Brand,
  chime,
  mxn,
  OrderLines,
  orderLabel,
  PWAInstallButton,
  SoundButton,
} from "../../../../shared/ui/components";
import { useRealtime } from "../../../../shared/ui/RealtimeProvider";
export function OrderStatus({
  order,
  onNewOrder,
}: {
  order: Order;
  onNewOrder: () => void;
}) {
  const { connected } = useRealtime();
  const previous = useRef(order.status);
  useEffect(() => {
    if (order.status === "ready" && previous.current !== "ready") chime(true);
    previous.current = order.status;
  }, [order.status]);
  const ready = order.status === "ready",
    done = ["completed", "no_show"].includes(order.status);
  const titles = {
    draft: "Estamos enviando tu pedido.",
    unpaid: "Te esperamos en el mostrador.",
    cooking: "Ya está en el comal.",
    ready: "¡Tu pedido está listo!",
    completed: "Gracias. ¡Buen provecho!",
    no_show: "Tu pedido fue cerrado.",
  };
  return (
    <div
      className={`min-h-screen bg-stone-50 px-5 py-7 ${ready ? "bg-emerald-50" : ""}`}
    >
      <div className="mx-auto max-w-lg">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Brand />
          <div className="flex items-center gap-2">
            <PWAInstallButton />
            <SoundButton />
          </div>
        </header>
        <section className="py-10 text-center" aria-live="polite">
          <div
            className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${ready || done ? "bg-emerald-800 text-white" : "bg-clay-100 text-clay-700"}`}
          >
            {ready || done ? (
              <Check size={40} />
            ) : order.status === "cooking" ? (
              <ChefHat size={40} />
            ) : (
              <Clock3 size={40} />
            )}
          </div>
          <p className="eyebrow mb-2">{order.customerName} · Tu pedido</p>
          <p className="display mb-5 text-7xl">{orderLabel(order)}</p>
          <h1 className="display text-4xl">{titles[order.status]}</h1>
          <p className="mt-4 text-stone-600">
            {order.status === "unpaid"
              ? "Tu pedido está pendiente de pago en el mostrador."
              : ready
                ? "Acércate al mostrador y recoge tu pedido."
                : order.status === "cooking"
                  ? "Lo estamos preparando. Te avisaremos aquí cuando esté listo."
                  : order.status === "no_show"
                    ? "No se registró ningún pago. Consulta al mostrador si necesitas ayuda."
                    : "Gracias por compartir nuestra mesa."}
          </p>
        </section>
        {order.status === "unpaid" && (
          <p
            role="status"
            className="sticky top-2 z-10 mb-5 rounded-xl border border-amber-300 bg-amber-100 p-4 font-semibold text-amber-950 shadow-sm"
            aria-live="polite"
          >
            Tu orden está en pausa. Paga {mxn(order.totalCents)} MXN en el
            mostrador para que empecemos a cocinar.
          </p>
        )}
        <section className="panel">
          <OrderLines order={order} />
          <div className="mt-5 flex justify-between border-t border-stone-200 pt-4 font-bold">
            <span>Total</span>
            <span>{mxn(order.totalCents)} MXN</span>
          </div>
          {order.transaction && (
            <p className="mt-3 text-sm text-emerald-800">
              Pagado en efectivo · Cambio: {mxn(order.transaction.changeCents)}
              {order.transaction.tipCents > 0 && (
                <> · Propina: {mxn(order.transaction.tipCents)}</>
              )}
            </p>
          )}
        </section>
        {done && (
          <button
            className="btn btn-primary mt-6 w-full"
            disabled={!connected}
            onClick={onNewOrder}
          >
            Hacer otro pedido
          </button>
        )}
        <p className="mt-6 text-center text-xs text-stone-500">
          Puedes cerrar esta ventana. Tu pedido se conserva en este dispositivo.
        </p>
      </div>
    </div>
  );
}
