import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ArrowRight,
  Check,
  ChefHat,
  Clock3,
  Flame,
  GraduationCap,
  LayoutGrid,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Table,
  Trophy,
} from "lucide-react";
import type { Order, Snapshot } from "../../../../shared/types/realtime";
import { useRealtime } from "../../../../shared/ui/RealtimeProvider";
import {
  advanceDemoOrder,
  createRushOrders,
  createDemoOrder,
  createPickyEaterDemoOrder,
  createNoShowDemoOrder,
  calculatePracticeMetrics,
  evaluateRush,
  HESITATION_MS,
  markDemoNoShow,
  payDemoOrder,
  RUSH_LIMIT_SECONDS,
  RUSH_TICKET_COUNT,
  UNDO_WINDOW_SECONDS,
} from "../simulator.js";
import { burstConfetti } from "../confetti";
import { ErrorBoundary } from "../../../../shared/ui/ErrorBoundary";
import { ACADEMY_MODULES, CURRICULUM_STEPS } from "../academy/curriculum";
import type { AcademyModuleId, AcademyStep, GhostSalesMetrics } from "../academy/types";
import { playSuccessChime, playMistakeThud, triggerHaptic } from "../academy/sound";
import { CoachmarkSpotlight } from "../academy/CoachmarkSpotlight";
import { AcademyBanner } from "../academy/AcademyBanner";
import { AcademyLedgerModal } from "../academy/AcademyLedgerModal";
import { AcademyInventoryModal } from "../academy/AcademyInventoryModal";
import { GraduationModal } from "../academy/GraduationModal";
import { ShadowWarningToast } from "../academy/ShadowWarningToast";
import {
  chime,
  enableAudio,
  AudioUnlockButton,
  EmptyState,
  InventoryControl,
  Modal,
  mxn,
  OrderLines,
  orderLabel,
  SoundButton,
  StaffHeader,
  time,
  useTicketTimer,
} from "../../../../shared/ui/components";
export function CashTender({
  order,
  onClose,
  onConfirm,
  simulator = false,
  guidedTarget = null,
  onSimulatorTenderSelected,
  onExitSimulator,
  trainingMessage,
}: {
  order: Order;
  onClose: () => void;
  /** Queues the payment. Live mode starts the undo window; the simulator grades it. */
  onConfirm: (orderId: string, tenderedCents: number) => void;
  simulator?: boolean;
  guidedTarget?: string | null;
  onSimulatorTenderSelected?: (tenderedCents: number) => void;
  onExitSimulator?: () => void;
  trainingMessage?: string;
}) {
  const { connected } = useRealtime();
  const [value, setValue] = useState("");
  const valid = /^\d{1,7}(?:\.\d{0,2})?$/.test(value),
    parts = value.split(".");
  const cents = valid
    ? Number(parts[0]) * 100 + Number((parts[1] || "").padEnd(2, "0"))
    : 0;
  const change = cents - order.totalCents;
  const spotlight = "relative z-50 ring-4 ring-yellow-400";
  return (
    <Modal
      title={`Cobrar al entregar ${orderLabel(order)} · ${order.customerName}`}
      onClose={onClose}
    >
      <OrderLines order={order} />
      {simulator && trainingMessage && (
        <p
          className="my-4 rounded-xl border-2 border-yellow-500 bg-yellow-50 p-4 font-semibold text-stone-900"
          role="status"
        >
          {trainingMessage}
        </p>
      )}
      <div className="my-6 flex items-end justify-between border-t border-stone-200 pt-5">
        <span>Total a cobrar</span>
        <strong className="text-4xl tabular-nums">
          {mxn(order.totalCents)}
        </strong>
      </div>
      <label className="block text-sm font-semibold">
        Efectivo recibido (MXN)
        <input
          autoFocus
          className="field mt-2 text-2xl tabular-nums"
          inputMode="decimal"
          value={value}
          placeholder="0.00"
          readOnly={simulator}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <div className="my-4 grid grid-cols-2 gap-3">
        {[100, 200, 500].map((preset) => {
          const target =
            preset === 200
              ? "tender-200"
              : preset === 500
                ? "tender-500"
                : undefined;
          const lit =
            simulator && target !== undefined && guidedTarget === target;
          return (
            <button
              className={`btn min-h-16 text-xl tabular-nums ${lit ? spotlight : ""}`}
              key={preset}
              data-tour-action={simulator ? "cash-preset" : undefined}
              data-tour-cents={simulator ? preset * 100 : undefined}
              data-tour-target={lit ? target : undefined}
              disabled={!simulator && !connected}
              onClick={() => {
                setValue(String(preset));
                if (simulator) onSimulatorTenderSelected?.(preset * 100);
              }}
            >
              {mxn(preset * 100)}
            </button>
          );
        })}
        <button
          className="btn min-h-16 text-lg tabular-nums"
          disabled={simulator && guidedTarget !== null}
          onClick={() => setValue((order.totalCents / 100).toFixed(2))}
        >
          Exacto · {mxn(order.totalCents)}
        </button>
      </div>
      <div
        className={`my-5 rounded-xl p-4 ${change >= 0 ? "bg-emerald-50 text-emerald-900" : "bg-stone-100"}`}
      >
        <div className="flex justify-between">
          <span>{change >= 0 ? "Cambio a entregar" : "Falta por recibir"}</span>
          <strong className="text-2xl tabular-nums">
            {mxn(Math.abs(change))}
          </strong>
        </div>
      </div>
      <button
        className={`btn btn-primary w-full ${simulator && guidedTarget === "confirm-demo-payment" ? spotlight : ""}`}
        data-tour-action={simulator ? "confirm" : undefined}
        data-tour-target={
          simulator && guidedTarget === "confirm-demo-payment"
            ? "confirm-demo-payment"
            : undefined
        }
        disabled={(!simulator && !connected) || !valid || change < 0}
        onClick={() => onConfirm(order.id, cents)}
      >
        Confirmar pago y entregar
        <ArrowRight size={18} />
      </button>
      <button
        className="btn mt-3 w-full"
        // Guided steps stay on the scripted bills; the exam may pay exact change
        // (a $555 ticket cannot be covered by the $500 preset).
        disabled={simulator ? guidedTarget !== null : !connected}
        onClick={() => onConfirm(order.id, order.totalCents)}
      >
        Efectivo exacto · Cobrar y entregar {mxn(order.totalCents)}
      </button>
      <p className="mt-4 text-center text-xs text-stone-500">
        Confirma solo después de recibir el efectivo. Tendrás{" "}
        {UNDO_WINDOW_SECONDS} segundos para deshacer.
      </p>
      {simulator && onExitSimulator && (
        <button
          className="btn mt-3 w-full"
          data-tour-allow="exit"
          onClick={onExitSimulator}
        >
          Salir del simulador
        </button>
      )}
    </Modal>
  );
}
export function TicketCard({
  order,
  now,
  onPay,
  simulator = false,
  highlighted = false,
  onSimulatorAdvance,
  onSimulatorNoShow,
  onSimulatorNoShowOpen,
  onAcknowledgeRestriction,
  restrictionAcknowledged = false,
  errorShake = false,
  coachTarget,
  pendingSeconds,
  pendingCents = 0,
  onUndoPayment,
}: {
  order: Order;
  now: number;
  onPay: () => void;
  /** Set while a confirmed payment can still be undone; the ticket is grayed out. */
  pendingSeconds?: number;
  pendingCents?: number;
  onUndoPayment?: () => void;
  simulator?: boolean;
  highlighted?: boolean;
  onSimulatorAdvance?: (order: Order) => void;
  onSimulatorNoShow?: (orderId: string) => void;
  onAcknowledgeRestriction?: () => void;
  restrictionAcknowledged?: boolean;
  errorShake?: boolean;
  coachTarget?: string;
  onSimulatorNoShowOpen?: () => void;
}) {
  const { command, connected } = useRealtime();
  const [noShow, setNoShow] = useState(false),
    [busy, setBusy] = useState(false);
  const isCooking = order.status === "cooking";
  const isReview = order.status === "review";
  const paymentPending = pendingSeconds !== undefined;
  const tracksElapsedTime = isReview || isCooking;
  const startTime = Date.parse(
    isCooking ? order.acceptedAt || order.createdAt : order.createdAt,
  );
  const elapsedSeconds = tracksElapsedTime
    ? Math.max(0, Math.floor((now - startTime) / 1000))
    : 0;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedTimer = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const aging =
    (isReview && elapsedSeconds > 180) || (isCooking && elapsedSeconds > 900);
  const isWarning = (isCooking && minutes >= 5) || (isReview && minutes >= 2);
  const agingLimitSeconds = isReview ? 180 : 900;
  const progressPercent = Math.min(
    100,
    Math.max(4, Math.round((elapsedSeconds / agingLimitSeconds) * 100)),
  );
  async function advance() {
    setBusy(true);
    if (simulator) {
      onSimulatorAdvance?.(order);
      setBusy(false);
      return;
    }
    await command("pos_update_status", {
      orderId: order.id,
      status: order.status === "review" ? "cooking" : "ready",
    });
    setBusy(false);
  }
  return (
    <article
      data-order-id={order.id}
      aria-busy={paymentPending}
      className={`relative overflow-hidden rounded-xl border-2 shadow-xs transition-colors ${paymentPending ? "bg-stone-100" : "bg-white"} ${errorShake ? "animate-shake" : ""} ${
        highlighted ? "z-40 ring-4 ring-yellow-400" : ""
      } ${
        aging
          ? "animate-pulse border-red-500 bg-red-50/40"
          : order.status === "cooking" && minutes >= 5
            ? "border-amber-400 bg-amber-50"
            : order.status === "review" && minutes >= 8
              ? "border-amber-300"
              : "border-stone-200"
      }`}
      aria-label={`Pedido ${orderLabel(order)} de ${order.customerName}`}
    >
      {tracksElapsedTime && (
        <div
          className="h-1.5 w-full bg-stone-100"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Tiempo de espera: ${minutes} minutos`}
        >
          <div
            className={`h-full transition-all duration-220 ease-linear ${
              aging
                ? "bg-red-500 animate-pulse"
                : isWarning
                  ? "bg-amber-400"
                  : "bg-clay-600"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
      <div className="p-4">
        <div className={paymentPending ? "opacity-60 grayscale" : undefined}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <strong className="text-xl tracking-tight">
                {orderLabel(order)}
              </strong>
              <p className="font-semibold text-stone-900">
                {order.customerName}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {tracksElapsedTime && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono font-bold tabular-nums shadow-xs ${
                    aging
                      ? "border-red-400 bg-red-100 text-red-800 ring-2 ring-red-400/40"
                      : isWarning
                        ? "border-amber-300 bg-amber-100 text-amber-900"
                        : "border-stone-200 bg-stone-100 text-stone-700"
                  }`}
                  title={`Tiempo transcurrido: ${minutes} min ${seconds} s`}
                  aria-label={`Tiempo transcurrido: ${minutes} minutos con ${seconds} segundos`}
                >
                  <Clock3
                    size={13}
                    className={`shrink-0 ${
                      aging
                        ? "text-red-600 animate-bounce"
                        : isWarning
                          ? "text-amber-600"
                          : "text-stone-500"
                    }`}
                  />
                  {formattedTimer}
                </span>
              )}
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  aging
                    ? "font-bold text-red-700"
                    : isWarning
                      ? "font-bold text-amber-800"
                      : "text-stone-400"
                }`}
              >
                {aging
                  ? "Demorado"
                  : isWarning
                    ? "Atención"
                    : order.status === "review"
                      ? "En revisión"
                      : order.status === "cooking"
                        ? "Cocinando"
                        : "Lista para recoger"}
              </span>
            </div>
          </div>
          <OrderLines order={order} />
          {simulator &&
            order.status === "cooking" &&
            order.items.some((item) =>
              item.modifiers.some(
                (modifier) =>
                  modifier.name.toLowerCase().includes("sin") ||
                  modifier.kind === "omit",
              ),
            ) && (
              <button
                className={`btn mt-3 w-full border-2 border-red-600 bg-red-600 font-black tracking-wide text-white hover:bg-red-700 shadow-md ${coachTarget === "acknowledge-restriction" ? "relative z-50 ring-4 ring-yellow-400" : ""}`}
                data-tour-target={
                  coachTarget === "acknowledge-restriction"
                    ? "acknowledge-restriction"
                    : undefined
                }
                data-tour-action="acknowledge"
                aria-pressed={restrictionAcknowledged}
                onClick={onAcknowledgeRestriction}
              >
                {restrictionAcknowledged
                  ? "✓ Restricción revisada: SIN CEBOLLA / SIN QUESO"
                  : "⚠ Tocar para confirmar: SIN CEBOLLA / SIN QUESO"}
              </button>
            )}
          <div className="mt-4 flex items-center justify-between border-t border-dashed border-stone-200 pt-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-stone-500">{time(order.createdAt)}</span>
            </div>
            <strong>{mxn(order.totalCents)}</strong>
          </div>
        </div>
        {order.status === "review" ? (
          <>
            <button
              className="btn btn-primary mt-4 w-full"
              data-tour-action="accept"
              data-tour-target={
                coachTarget === "accept-demo-order"
                  ? "accept-demo-order"
                  : undefined
              }
              disabled={(!simulator && !connected) || busy}
              onClick={() => void advance()}
            >
              <Check size={17} />
              Aceptar y empezar a cocinar
            </button>
            <button
              className="btn btn-danger mt-2 w-full"
              data-tour-action="no-show"
              disabled={(!simulator && !connected) || busy}
              onClick={() => setNoShow(true)}
            >
              Anular pedido / No-Show
            </button>
          </>
        ) : order.status === "ready" && paymentPending ? (
          <div
            className="mt-4 rounded-xl border-2 border-red-600 bg-red-50 p-3"
            role="group"
            aria-label="Pago por registrar"
          >
            <p className="text-sm font-bold text-red-900" aria-live="polite">
              {pendingSeconds === 0
                ? `Registrando pago de ${mxn(pendingCents)}…`
                : `Pago de ${mxn(pendingCents)} recibido · se registra en ${pendingSeconds}s`}
            </p>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-red-100"
              role="progressbar"
              aria-valuenow={pendingSeconds}
              aria-valuemin={0}
              aria-valuemax={UNDO_WINDOW_SECONDS}
              aria-label="Tiempo para deshacer"
            >
              <div
                className="h-full rounded-full bg-red-600 transition-[width] duration-1000 ease-linear"
                style={{
                  width: `${((pendingSeconds ?? 0) / UNDO_WINDOW_SECONDS) * 100}%`,
                }}
              />
            </div>
            {pendingSeconds !== 0 && (
              <button
                className={`btn btn-danger mt-3 w-full ${coachTarget === "undo-demo-payment" ? "relative z-50 ring-4 ring-yellow-400" : ""}`}
                data-tour-action="undo"
                data-tour-target={
                  coachTarget === "undo-demo-payment"
                    ? "undo-demo-payment"
                    : undefined
                }
                onClick={onUndoPayment}
              >
                Deshacer
              </button>
            )}
          </div>
        ) : order.status === "ready" ? (
          <>
            <button
              className="btn mt-4 w-full border-emerald-800 bg-emerald-800 text-white hover:bg-emerald-900"
              data-tour-action="pay"
              data-tour-target={
                coachTarget === "pay-demo-order" ? "pay-demo-order" : undefined
              }
              disabled={(!simulator && !connected) || busy}
              onClick={onPay}
            >
              Cobrar al entregar
              <ArrowRight size={16} />
            </button>
            <button
              className={`btn btn-danger mt-2 w-full ${coachTarget === "noshow-demo-order" ? "relative z-50 ring-4 ring-yellow-400" : ""}`}
              data-tour-action={simulator ? "noshow-open" : "no-show"}
              data-tour-target={
                coachTarget === "noshow-demo-order"
                  ? "noshow-demo-order"
                  : undefined
              }
              disabled={(!simulator && !connected) || busy}
              onClick={() => {
                setNoShow(true);
                if (simulator) onSimulatorNoShowOpen?.();
              }}
            >
              Anular pedido / No-Show
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary mt-4 w-full"
            data-tour-action="ready"
            data-tour-target={
              coachTarget === "mark-demo-ready" ? "mark-demo-ready" : undefined
            }
            disabled={
              (!simulator && !connected) ||
              busy ||
              (simulator && !restrictionAcknowledged)
            }
            onClick={() => void advance()}
          >
            <Check size={17} />
            Marcar lista para recoger
          </button>
        )}
        {noShow && (
          <Modal
            title="¿Anular pedido / marcar No-Show?"
            onClose={() => setNoShow(false)}
          >
            <p className="mb-5">
              Se quitará {orderLabel(order)} de la fila. El historial conservará
              sus platillos y cantidades como No-Show; no se registrará ningún
              ingreso de efectivo.
            </p>
            <div className="flex gap-3">
              <button className="btn flex-1" onClick={() => setNoShow(false)}>
                Volver
              </button>
              <button
                className={`btn btn-danger flex-1 ${coachTarget === "noshow-confirm" ? "relative z-50 ring-4 ring-yellow-400" : ""}`}
                data-tour-action={simulator ? "noshow-confirm" : "no-show"}
                data-tour-target={
                  coachTarget === "noshow-confirm"
                    ? "noshow-confirm"
                    : undefined
                }
                disabled={(!simulator && !connected) || busy}
                onClick={async () => {
                  setBusy(true);
                  if (simulator) {
                    onSimulatorNoShow?.(order.id);
                    setBusy(false);
                    setNoShow(false);
                    return;
                  }
                  const reply = await command("pos_mark_noshow", {
                    orderId: order.id,
                  });
                  setBusy(false);
                  if (reply.ok) setNoShow(false);
                }}
              >
                Confirmar No-Show
              </button>
            </div>
          </Modal>
        )}
      </div>
    </article>
  );
}

function TicketSkeleton() {
  return (
    <div className="panel animate-pulse space-y-4" aria-hidden="true">
      <div className="flex justify-between gap-3">
        <div className="h-6 w-20 rounded bg-stone-200" />
        <div className="h-6 w-14 rounded bg-stone-200" />
      </div>
      <div className="h-4 w-2/3 rounded bg-stone-200" />
      <div className="h-3 w-full rounded bg-stone-200" />
      <div className="h-3 w-4/5 rounded bg-stone-200" />
      <div className="h-10 w-full rounded-xl bg-stone-200" />
    </div>
  );
}

export function CompletedOrdersSection({ orders }: { orders: Order[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "completed" | "no_show">("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const completedList = useMemo(() => {
    return orders
      .filter((o) => {
        if (filter !== "all" && o.status !== filter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          o.customerName.toLowerCase().includes(q) ||
          orderLabel(o).toLowerCase().includes(q) ||
          o.items.some((i) => i.name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const timeA = a.completedAt || a.transaction?.paidAt || a.createdAt;
        const timeB = b.completedAt || b.transaction?.paidAt || b.createdAt;
        return timeB.localeCompare(timeA);
      });
  }, [orders, search, filter]);

  const totalFulfilled = orders.filter((o) => o.status === "completed").length;
  const totalRevenueCents = orders
    .filter((o) => o.status === "completed" && o.transaction)
    .reduce((sum, o) => sum + (o.transaction?.totalCents || 0), 0);

  return (
    <section aria-label="Historial y auditoría de pedidos completados">
      {/* Audit Banner */}
      <div className="mb-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-800">
                <Check size={14} />
              </span>
              <h2 className="text-base font-bold text-stone-900">
                Auditoría de Servicio en Vivo
              </h2>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Verifica el historial de comandas entregadas, montos cobrados y
              tiempos originales de este turno sin necesidad de cerrar turno.
            </p>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1">
            <button
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                viewMode === "cards"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-900"
              }`}
              onClick={() => setViewMode("cards")}
              title="Vista en tarjetas"
            >
              <LayoutGrid size={14} />
              <span>Tarjetas</span>
            </button>
            <button
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                viewMode === "table"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-900"
              }`}
              onClick={() => setViewMode("table")}
              title="Vista en tabla de auditoría"
            >
              <Table size={14} />
              <span>Tabla de Auditoría</span>
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="block text-xs text-stone-500">
                Total entregados
              </span>
              <strong className="text-xl font-bold text-stone-900">
                {totalFulfilled} pedidos
              </strong>
            </div>
            <div className="hidden h-8 w-px bg-stone-200 sm:block" />
            <div>
              <span className="block text-xs text-stone-500">
                Ventas verificadas
              </span>
              <strong className="text-xl font-bold text-emerald-800 tabular-nums">
                {mxn(totalRevenueCents)} MXN
              </strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="search"
                placeholder="Buscar cliente o #pedido…"
                className="field w-56 pl-9 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="field w-auto text-sm"
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as "all" | "completed" | "no_show")
              }
            >
              <option value="all">Todos los completados</option>
              <option value="completed">Solo Entregados</option>
              <option value="no_show">Solo No-Show</option>
            </select>
          </div>
        </div>
      </div>

      {completedList.length === 0 ? (
        <EmptyState>
          {orders.length === 0
            ? "Aún no se han completado pedidos en este turno. Cuando marques un pedido como 'Entregado', aparecerá aquí para auditoría."
            : "No se encontraron pedidos con ese criterio de búsqueda."}
        </EmptyState>
      ) : viewMode === "table" ? (
        /* Tabular Audit View */
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-xs">
          <table className="w-full text-left text-xs text-stone-700">
            <thead className="border-b border-stone-200 bg-stone-50 text-[11px] font-bold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3.5">Ticket</th>
                <th className="px-4 py-3.5">Cliente</th>
                <th className="px-4 py-3.5">Hora Original (Creado)</th>
                <th className="px-4 py-3.5">Hora Entregado</th>
                <th className="px-4 py-3.5">Duración Servicio</th>
                <th className="px-4 py-3.5">Platillos</th>
                <th className="px-4 py-3.5 text-right">Total Cobrado</th>
                <th className="px-4 py-3.5">Detalle Efectivo</th>
                <th className="px-4 py-3.5 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium">
              {completedList.map((order) => {
                const isNoShow = order.status === "no_show";
                const prepMinutes =
                  order.completedAt && order.paidAt
                    ? Math.max(
                        1,
                        Math.round(
                          (new Date(order.completedAt).getTime() -
                            new Date(order.paidAt).getTime()) /
                            60000,
                        ),
                      )
                    : null;

                return (
                  <tr key={order.id} className="hover:bg-stone-50/70">
                    <td className="px-4 py-3">
                      <strong className="text-sm font-bold text-clay-700">
                        {orderLabel(order)}
                      </strong>
                    </td>
                    <td className="px-4 py-3 font-semibold text-stone-900">
                      {order.customerName}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-stone-600">
                      <span className="font-bold text-stone-800">
                        {time(order.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-stone-600">
                      {order.completedAt ? time(order.completedAt) : "--"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-emerald-800">
                      {prepMinutes !== null ? `~${prepMinutes} min` : "--"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="line-clamp-2 text-stone-600">
                        {order.items
                          .map((i) => `${i.quantity}× ${i.name}`)
                          .join(", ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-stone-900">
                      {mxn(order.totalCents)}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-stone-500">
                      {order.transaction ? (
                        <span>
                          Recibido: {mxn(order.transaction.tenderedCents)} ·
                          Cambio: {mxn(order.transaction.changeCents)}
                        </span>
                      ) : (
                        "--"
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                          isNoShow
                            ? "bg-stone-100 text-stone-600"
                            : "bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {isNoShow ? "No-Show" : "Entregado"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Card Audit View */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {completedList.map((order) => {
            const isNoShow = order.status === "no_show";
            const prepMinutes =
              order.completedAt && order.paidAt
                ? Math.max(
                    1,
                    Math.round(
                      (new Date(order.completedAt).getTime() -
                        new Date(order.paidAt).getTime()) /
                        60000,
                    ),
                  )
                : null;

            return (
              <article
                key={order.id}
                className="panel flex flex-col justify-between border-stone-200 bg-white"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="display text-2xl font-bold">
                        {orderLabel(order)}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                          isNoShow
                            ? "bg-stone-100 text-stone-600"
                            : "bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {isNoShow ? "No-Show" : "Entregado"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs">
                    <strong className="text-sm text-stone-900">
                      {order.customerName}
                    </strong>
                    <span className="font-bold text-stone-900 tabular-nums">
                      {mxn(order.totalCents)}
                    </span>
                  </div>

                  {/* Audit Timestamps */}
                  <div className="mt-2.5 rounded-lg bg-stone-50 p-2.5 border border-stone-100 space-y-1 text-[11px] text-stone-600">
                    <div className="flex justify-between">
                      <span className="text-stone-500">
                        Hora original (Creado):
                      </span>
                      <strong className="font-mono text-stone-800">
                        {time(order.createdAt)}
                      </strong>
                    </div>
                    {order.paidAt && (
                      <div className="flex justify-between">
                        <span className="text-stone-500">
                          Hora cobrado (Caja):
                        </span>
                        <strong className="font-mono text-stone-800">
                          {time(order.paidAt)}
                        </strong>
                      </div>
                    )}
                    {order.completedAt && (
                      <div className="flex justify-between">
                        <span className="text-stone-500">Hora entregado:</span>
                        <strong className="font-mono text-stone-800">
                          {time(order.completedAt)}
                        </strong>
                      </div>
                    )}
                    {prepMinutes !== null && (
                      <div className="flex justify-between pt-1 border-t border-stone-200/60 text-emerald-800 font-semibold">
                        <span>Tiempo de preparación:</span>
                        <span>~{prepMinutes} min</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 border-t border-dashed border-stone-100 pt-2">
                    <OrderLines order={order} />
                  </div>
                </div>

                <div className="mt-4 border-t border-stone-100 pt-3">
                  <div className="flex justify-between text-sm font-bold">
                    <span>Total de la orden</span>
                    <span className="tabular-nums">
                      {mxn(order.totalCents)}
                    </span>
                  </div>
                  {order.transaction && (
                    <p className="mt-1 text-xs text-stone-500">
                      Efectivo recibido: {mxn(order.transaction.tenderedCents)}{" "}
                      · Cambio: {mxn(order.transaction.changeCents)}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** What the spotlighted control must be tagged with (data-tour-action) to be clickable. */
const TOUR_ACTIONS: Record<string, string> = {
  "accept-demo-order": "accept",
  "acknowledge-restriction": "acknowledge",
  "mark-demo-ready": "ready",
  "pay-demo-order": "pay",
  "undo-demo-payment": "undo",
  "tender-200": "cash-preset",
  "tender-500": "cash-preset",
  "confirm-demo-payment": "confirm",
  "noshow-demo-order": "noshow-open",
  "noshow-confirm": "noshow-confirm",
  "btn-inventory": "inventory-open",
  "toggle-86-gordita": "toggle-stock",
  "close-inventory": "inventory-close",
  "btn-panic-pause": "panic-pause",
  "btn-panic-resume": "panic-resume",
  "btn-nav-analytics": "nav-analytics",
  "card-revenue-display": "inspect-revenue",
  "btn-close-shift": "close-shift-open",
  "input-blind-drop": "blind-drop-input",
  "btn-confirm-close-shift": "close-shift-confirm",
};
const INTERACTIVE =
  "button, a[href], input, select, textarea, summary, [role='tab'], [role='switch']";

interface PendingPayment {
  tenderedCents: number;
  deadline: number;
  settling: boolean;
}

function DataErrorFallback({
  title,
  retry,
}: {
  title: string;
  retry: () => void;
}) {
  const { resync } = useRealtime();
  return (
    <div
      role="alert"
      className="rounded-xl border-2 border-red-600 bg-red-50 p-4 text-red-950"
    >
      <strong className="block">{title}</strong>
      <p className="mt-1 text-sm">
        No pudimos mostrar esto. El resto del tablero sigue funcionando.
      </p>
      <button
        className="btn mt-3 w-full"
        data-tour-allow="recover"
        onClick={() => {
          resync();
          retry();
        }}
      >
        Volver a sincronizar
      </button>
    </div>
  );
}

export function LiveOrders() {
  const {
    snapshot: liveSnapshot,
    connected,
    command,
    suspendRealtime,
    resumeRealtime,
  } = useRealtime();
  const [inventory, setInventory] = useState(false),
    [payId, setPayId] = useState<string | null>(null),
    [pausing, setPausing] = useState(false),
    [kitchenOnly, setKitchenOnly] = useState(false),
    [showComalDetails, setShowComalDetails] = useState(false),
    [simulator, setSimulator] = useState(false),
    [savedLiveSnapshot, setSavedLiveSnapshot] = useState<Snapshot | null>(null),
    [demoOrders, setDemoOrders] = useState<Order[]>([]),
    [demoCompletedOrders, setDemoCompletedOrders] = useState<Order[]>([]),
    [currentModule, setCurrentModule] = useState<AcademyModuleId>("module1_golden_path"),
    [currentStepIndex, setCurrentStepIndex] = useState(0),
    [completedModules, setCompletedModules] = useState<AcademyModuleId[]>([]),
    [explainLockRemaining, setExplainLockRemaining] = useState(2),
    [shadowWarning, setShadowWarning] = useState<string | null>(null),
    [ghostInventoryOpen, setGhostInventoryOpen] = useState(false),
    [ghostInventoryItems, setGhostInventoryItems] = useState([
      { id: "gordita-chicharron", name: "Gordita de chicharrón prensado", available: true },
      { id: "taco-suadero", name: "Taco de suadero confitado", available: true },
      { id: "quesadilla-hongos", name: "Quesadilla de huitlacoche y queso", available: true },
    ]),
    [ghostWebOrdersPaused, setGhostWebOrdersPaused] = useState(false),
    [ghostLedgerOpen, setGhostLedgerOpen] = useState(false),
    [ghostBlindDropOpen, setGhostBlindDropOpen] = useState(false),
    [isGraduated, setIsGraduated] = useState(false),
    [isTrained, setIsTrained] = useState<boolean>(() =>
      typeof window !== "undefined" && localStorage.getItem("masaflow_trained") === "true",
    ),
    [restrictionAcknowledgedIds, setRestrictionAcknowledgedIds] = useState<Set<string>>(() => new Set()),
    [mistakeCountdown, setMistakeCountdown] = useState(0),
    [mistakeOrderId, setMistakeOrderId] = useState<string | null>(null),
    [alarmFlash, setAlarmFlash] = useState(false),
    [selectedTenderCents, setSelectedTenderCents] = useState<number | null>(null),
    [rushMode, setRushMode] = useState(false),
    [rushRemaining, setRushRemaining] = useState(RUSH_LIMIT_SECONDS),
    [rushCompleted, setRushCompleted] = useState(0),
    [rushResolved, setRushResolved] = useState(0),
    [rushNoShows, setRushNoShows] = useState(0),
    [rushFinished, setRushFinished] = useState(false),
    [wrongOrderId, setWrongOrderId] = useState<string | null>(null),
    [pendingPayments, setPendingPayments] = useState<Record<string, PendingPayment>>({}),
    [paymentNotice, setPaymentNotice] = useState(""),
    [activeTab, setActiveTab] = useState<"queue" | "completed">("queue"),
    [activeLane, setActiveLane] = useState<"review" | "cooking" | "ready">("review");

  const wrongActionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingTimers = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; tenderedCents: number }>(),
  );
  const commandRef = useRef(command);
  const resumeRef = useRef(resumeRealtime);
  const simulatorRef = useRef(false);
  useEffect(() => {
    commandRef.current = command;
    resumeRef.current = resumeRealtime;
    simulatorRef.current = simulator;
  });

  const sourceSnapshot = simulator ? (savedLiveSnapshot ?? liveSnapshot) : liveSnapshot;
  const snapshot =
    simulator && sourceSnapshot
      ? {
          ...sourceSnapshot,
          activeOrders: demoOrders,
          completedOrders: demoCompletedOrders,
        }
      : sourceSnapshot;

  const previousActive = useRef<Set<string> | null>(null);
  const previousCooking = useRef<Set<string> | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const previousTicketPositions = useRef(new Map<string, { left: number; top: number }>());
  const now = useTicketTimer();
  const layoutKey =
    snapshot?.activeOrders.map((order) => `${order.id}:${order.status}`).join("|") ?? "";
  const hasPendingPayment = Object.keys(pendingPayments).length > 0;

  const moduleSteps = useMemo(
    () => CURRICULUM_STEPS.filter((s) => s.moduleId === currentModule),
    [currentModule],
  );
  const currentStep = simulator && !rushMode ? moduleSteps[currentStepIndex] || null : null;
  const guidedTarget = currentStep ? currentStep.target : null;
  const guided = simulator && !rushMode && currentStep !== null;
  const canExit = isTrained;

  const overallProgressPercent = useMemo(() => {
    const total = CURRICULUM_STEPS.length;
    let done = 0;
    for (const mod of ACADEMY_MODULES) {
      if (completedModules.includes(mod.id)) {
        done += CURRICULUM_STEPS.filter((s) => s.moduleId === mod.id).length;
      } else if (mod.id === currentModule) {
        done += currentStepIndex;
      }
    }
    return Math.round((done / total) * 100);
  }, [completedModules, currentModule, currentStepIndex]);

  const rushElapsed = RUSH_LIMIT_SECONDS - rushRemaining;
  const rushPassed =
    rushFinished &&
    evaluateRush({
      paid: rushCompleted,
      noShows: rushNoShows,
      elapsedSeconds: rushElapsed,
    });

  const ghostSalesMetrics: GhostSalesMetrics = useMemo(() => {
    return calculatePracticeMetrics(demoCompletedOrders);
  }, [demoCompletedOrders]);

  // Explain-Before-Execute 2-second lock
  useEffect(() => {
    if (!simulator || rushMode || !currentStep) {
      setExplainLockRemaining(0);
      return;
    }
    setExplainLockRemaining(2);
    const t1 = setTimeout(() => setExplainLockRemaining(1), 1000);
    const t2 = setTimeout(() => setExplainLockRemaining(0), 2000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [simulator, rushMode, currentModule, currentStepIndex]);

  // Auto-boot simulator on very first visit if staff hasn't graduated
  useEffect(() => {
    if (typeof window === "undefined") return;
    const trained = localStorage.getItem("masaflow_trained") === "true";
    if (!trained && liveSnapshot && !simulatorRef.current) {
      startSimulator();
    }
  }, [liveSnapshot]);

  function loadModule(modId: AcademyModuleId) {
    setCurrentModule(modId);
    setCurrentStepIndex(0);
    setPayId(null);
    setSelectedTenderCents(null);
    setMistakeCountdown(0);
    setMistakeOrderId(null);
    setGhostInventoryOpen(false);
    setGhostLedgerOpen(false);
    setGhostBlindDropOpen(false);

    if (modId === "module1_golden_path") {
      setDemoOrders([createDemoOrder()]);
      setDemoCompletedOrders([]);
      setActiveTab("queue");
      setActiveLane("review");
    } else if (modId === "module2_picky_eater") {
      setDemoOrders([createPickyEaterDemoOrder()]);
      setRestrictionAcknowledgedIds(new Set());
      setActiveTab("queue");
      setActiveLane("review");
    } else if (modId === "module3_mistakes_noshow") {
      const mistakeOrder = { ...createDemoOrder(), status: "ready" as const };
      const noShowOrder = createNoShowDemoOrder();
      setDemoOrders([mistakeOrder, noShowOrder]);
      setActiveTab("queue");
      setActiveLane("ready");
    } else if (modId === "module4_panic_86") {
      setDemoOrders([]);
      setGhostInventoryOpen(false);
      setGhostWebOrdersPaused(false);
      setActiveTab("queue");
    } else if (modId === "module5_revenue_closeout") {
      const order1 = payDemoOrder(createDemoOrder(), 20000);
      const order2 = payDemoOrder(createPickyEaterDemoOrder(), 20000);
      const order3 = payDemoOrder(createDemoOrder(), 50000);
      const noShow = markDemoNoShow(createNoShowDemoOrder());
      setDemoCompletedOrders([order1, order2, order3, noShow]);
      setDemoOrders([]);
      setActiveTab("completed");
    }
  }

  function advanceStep() {
    playSuccessChime();
    triggerHaptic("success");
    if (currentStepIndex + 1 < moduleSteps.length) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      completeModule(currentModule);
    }
  }

  function completeModule(modId: AcademyModuleId) {
    setCompletedModules((prev) => Array.from(new Set([...prev, modId])));
    playSuccessChime();
    triggerHaptic("success");

    const moduleOrder: AcademyModuleId[] = [
      "module1_golden_path",
      "module2_picky_eater",
      "module3_mistakes_noshow",
      "module4_panic_86",
      "module5_revenue_closeout",
    ];
    const currentIndex = moduleOrder.indexOf(modId);
    if (currentIndex < moduleOrder.length - 1) {
      const nextModule = moduleOrder[currentIndex + 1];
      loadModule(nextModule);
    } else {
      if (!rushPassed) {
        startRushChallenge();
      } else {
        setIsGraduated(true);
        burstConfetti();
      }
    }
  }

  function handleGraduateAndGoLive() {
    localStorage.setItem("masaflow_trained", "true");
    setIsTrained(true);
    setIsGraduated(false);
    exitSimulator();
  }

  function startSimulator() {
    if (!liveSnapshot || hasPendingPayment) return;
    void enableAudio();
    setSavedLiveSnapshot(liveSnapshot);
    suspendRealtime();
    setSimulator(true);
    setRushMode(false);
    setRushFinished(false);
    setCompletedModules([]);
    loadModule("module1_golden_path");
  }

  function exitSimulator() {
    if (wrongActionTimer.current) clearTimeout(wrongActionTimer.current);
    setSimulator(false);
    setSavedLiveSnapshot(null);
    setDemoOrders([]);
    setDemoCompletedOrders([]);
    setPayId(null);
    setCurrentStepIndex(0);
    setCompletedModules([]);
    setRestrictionAcknowledgedIds(new Set());
    setMistakeCountdown(0);
    setMistakeOrderId(null);
    setAlarmFlash(false);
    setSelectedTenderCents(null);
    setRushMode(false);
    setRushFinished(false);
    setWrongOrderId(null);
    setShadowWarning(null);
    setGhostInventoryOpen(false);
    setGhostLedgerOpen(false);
    setGhostBlindDropOpen(false);
    setIsGraduated(false);
    resumeRealtime();
  }

  function advanceSimulatorOrder(order: Order) {
    if (order.status === "cooking" && !restrictionAcknowledgedIds.has(order.id)) return;
    const next = advanceDemoOrder(order);
    setDemoOrders((orders) =>
      orders.map((current) => (current.id === order.id ? next : current)),
    );
    setActiveLane(next.status === "cooking" ? "cooking" : "ready");
    if (!rushMode) {
      advanceStep();
    }
  }

  function acknowledgeDemoRestriction(orderId: string) {
    setRestrictionAcknowledgedIds((ids) => new Set(ids).add(orderId));
    if (!rushMode) {
      advanceStep();
    }
  }

  function markSimulatorNoShow(orderId: string) {
    const order = demoOrders.find((candidate) => candidate.id === orderId);
    if (!order) return;
    const noShow = markDemoNoShow(order);
    setDemoOrders((orders) => orders.filter((candidate) => candidate.id !== orderId));
    setDemoCompletedOrders((completed) => [...completed, noShow]);
    if (rushMode) {
      setRushResolved((count) => count + 1);
      setRushNoShows((count) => count + 1);
    } else {
      advanceStep();
    }
  }

  function undoDemoMistake() {
    setMistakeCountdown(0);
    setMistakeOrderId(null);
    advanceStep();
  }

  function completeSimulatorPayment(orderId: string, tenderedCents: number) {
    const order = demoOrders.find((candidate) => candidate.id === orderId);
    if (!order) return;

    if (!rushMode && currentModule === "module3_mistakes_noshow") {
      if (currentStep?.target === "confirm-demo-payment" && currentStepIndex === 2) {
        setPayId(null);
        setSelectedTenderCents(null);
        setMistakeOrderId(orderId);
        setMistakeCountdown(UNDO_WINDOW_SECONDS);
        setAlarmFlash(true);
        chime("alarm");
        playMistakeThud();
        triggerHaptic("mistake");
        advanceStep();
        return;
      }
    }

    const completed = payDemoOrder(order, tenderedCents);
    setDemoOrders((orders) => orders.filter((candidate) => candidate.id !== orderId));
    setDemoCompletedOrders((previous) => [...previous, completed]);
    setPayId(null);
    setSelectedTenderCents(null);
    setMistakeCountdown(0);

    if (rushMode) {
      setRushCompleted((count) => count + 1);
      setRushResolved((count) => count + 1);
      setActiveTab("queue");
    } else {
      advanceStep();
    }
  }

  function startRushChallenge() {
    setDemoOrders(createRushOrders());
    setDemoCompletedOrders([]);
    setPayId(null);
    setRushCompleted(0);
    setRushResolved(0);
    setRushNoShows(0);
    setRushRemaining(RUSH_LIMIT_SECONDS);
    setRushFinished(false);
    setRushMode(true);
    setRestrictionAcknowledgedIds(new Set());
    setMistakeCountdown(0);
    setMistakeOrderId(null);
    setSelectedTenderCents(null);
    setActiveTab("queue");
    setActiveLane("review");
  }

  function queueLivePayment(orderId: string, tenderedCents: number) {
    if (pendingTimers.current.has(orderId)) return;
    const timer = setTimeout(
      () => void settleLivePayment(orderId, tenderedCents),
      UNDO_WINDOW_SECONDS * 1000,
    );
    pendingTimers.current.set(orderId, { timer, tenderedCents });
    setPendingPayments((current) => ({
      ...current,
      [orderId]: {
        tenderedCents,
        deadline: Date.now() + UNDO_WINDOW_SECONDS * 1000,
        settling: false,
      },
    }));
    setPayId(null);
  }

  async function settleLivePayment(orderId: string, tenderedCents: number) {
    pendingTimers.current.delete(orderId);
    setPendingPayments((current) =>
      current[orderId]
        ? { ...current, [orderId]: { ...current[orderId], settling: true } }
        : current,
    );
    try {
      const reply = await commandRef.current("pos_order_paid", {
        orderId,
        tenderedCents,
      });
      if (!reply.ok)
        setPaymentNotice(
          `No se registró el pago de ${mxn(tenderedCents)}: ${reply.error} El pedido sigue por cobrar; vuelve a cobrarlo cuando haya conexión.`,
        );
    } finally {
      setPendingPayments(({ [orderId]: _settled, ...rest }) => rest);
    }
  }

  function undoLivePayment(orderId: string) {
    const entry = pendingTimers.current.get(orderId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingTimers.current.delete(orderId);
    setPendingPayments(({ [orderId]: _undone, ...rest }) => rest);
  }

  function pendingPaymentFor(orderId: string) {
    if (simulator)
      return mistakeCountdown > 0 && mistakeOrderId === orderId
        ? { seconds: mistakeCountdown, cents: 20000 }
        : null;
    const entry = pendingPayments[orderId];
    if (!entry) return null;
    return {
      seconds: entry.settling
        ? 0
        : Math.max(1, Math.ceil((entry.deadline - now) / 1000)),
      cents: entry.tenderedCents,
    };
  }

  function triggerShadowWarning(message: string) {
    playMistakeThud();
    triggerHaptic("mistake");
    setShadowWarning(message);
    if (wrongActionTimer.current) clearTimeout(wrongActionTimer.current);
    wrongActionTimer.current = setTimeout(() => {
      setShadowWarning(null);
      setWrongOrderId(null);
    }, 1400);
  }

  function handleGuidedClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!guided || !currentStep) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const interactive = target.closest<HTMLElement>(INTERACTIVE);
    if (!interactive || interactive.closest("[data-tour-allow]")) return;

    if (explainLockRemaining > 0) {
      event.preventDefault();
      event.stopPropagation();
      triggerShadowWarning("Lee la explicación antes de continuar.");
      return;
    }

    const actionElement = target.closest<HTMLElement>("[data-tour-action]");
    const targetAttr = actionElement?.dataset.tourTarget || interactive.dataset.tourTarget;
    const actionAttr = actionElement?.dataset.tourAction;

    const wrongTender =
      actionAttr === "cash-preset" &&
      Number(actionElement?.dataset.tourCents) !==
        (currentStep.target === "tender-500" ? 50000 : 20000);

    const isMatch =
      (targetAttr === currentStep.target ||
        (actionAttr && actionAttr === TOUR_ACTIONS[currentStep.target])) &&
      !wrongTender;

    if (isMatch) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const card = interactive.closest<HTMLElement>("[data-order-id]");
    if (card?.dataset.orderId) setWrongOrderId(card.dataset.orderId);
    triggerShadowWarning("Aún no. Termina el paso actual primero.");
  }

  useEffect(() => {
    if (!simulator || mistakeCountdown <= 0) return;
    const timer = setTimeout(() => {
      if (mistakeCountdown > 1) {
        setMistakeCountdown(mistakeCountdown - 1);
        return;
      }
      setMistakeCountdown(0);
      setMistakeOrderId(null);
      setAlarmFlash(true);
      chime("alarm");
      playMistakeThud();
      triggerHaptic("mistake");
      triggerShadowWarning("¡Tiempo agotado! En la caja real se habría registrado el monto erróneo.");
      loadModule("module3_mistakes_noshow");
    }, 1000);
    return () => clearTimeout(timer);
  }, [simulator, mistakeCountdown]);

  useEffect(() => {
    if (!alarmFlash) return;
    const timer = setTimeout(() => setAlarmFlash(false), 700);
    return () => clearTimeout(timer);
  }, [alarmFlash]);


  useEffect(() => {
    if (!rushMode || rushRemaining <= 0) return;
    const timer = setTimeout(
      () => setRushRemaining((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [rushMode, rushRemaining]);

  useEffect(() => {
    if (
      rushMode &&
      (rushRemaining === 0 || rushResolved >= RUSH_TICKET_COUNT)
    ) {
      setRushMode(false);
      setRushFinished(true);
    }
  }, [rushMode, rushRemaining, rushResolved]);

  useEffect(() => {
    if (!rushPassed) return;
    chime("ready");
    return burstConfetti();
  }, [rushPassed]);

  // A confirmed real payment must not vanish silently if the tab is closed mid-window.
  useEffect(() => {
    if (!hasPendingPayment) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasPendingPayment]);

  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      if (wrongActionTimer.current) clearTimeout(wrongActionTimer.current);
      // Leaving the page flushes confirmed payments instead of dropping them.
      for (const [orderId, entry] of timers) {
        clearTimeout(entry.timer);
        void commandRef.current("pos_order_paid", {
          orderId,
          tenderedCents: entry.tenderedCents,
        });
      }
      timers.clear();
      // Never leave realtime suspended behind an unmounted simulator.
      if (simulatorRef.current) resumeRef.current();
    };
  }, []);

  const trainingMessage = currentStep?.instruction || "";
  const overallProgress = Math.round((completedModules.length / 5) * 100);

  useEffect(() => {
    if (!liveSnapshot) return;
    const currentActive = new Set(liveSnapshot.activeOrders.map((o) => o.id));
    const currentCooking = new Set(
      liveSnapshot.activeOrders
        .filter((o) => o.status === "cooking")
        .map((o) => o.id),
    );

    if (!simulator && previousActive.current !== null) {
      const hasNewCooking = [...currentCooking].some(
        (id) => !previousCooking.current?.has(id),
      );
      const hasNewOrder = [...currentActive].some(
        (id) => !previousActive.current?.has(id),
      );

      if (hasNewCooking) {
        chime("kitchen");
      } else if (hasNewOrder) {
        chime("new");
      }
    }

    previousActive.current = currentActive;
    previousCooking.current = currentCooking;
  }, [liveSnapshot, simulator]);
  const cookingOrders =
    snapshot?.activeOrders.filter((o) => o.status === "cooking") ?? [];

  const comalSummary = useMemo(() => {
    const itemMap = new Map<
      string,
      { name: string; total: number; masas: Record<string, number> }
    >();
    let totalPieces = 0;
    for (const order of cookingOrders) {
      for (const line of order.items) {
        totalPieces += line.quantity;
        const entry = itemMap.get(line.name) || {
          name: line.name,
          total: 0,
          masas: {},
        };
        entry.total += line.quantity;
        const masaMod = line.modifiers.find((m) => m.kind === "masa");
        const masaName = masaMod ? masaMod.name : "Estándar";
        entry.masas[masaName] = (entry.masas[masaName] || 0) + line.quantity;
        itemMap.set(line.name, entry);
      }
    }
    return {
      items: Array.from(itemMap.values()),
      totalPieces,
    };
  }, [cookingOrders]);
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const positions = new Map<string, { left: number; top: number }>();
    for (const card of board.querySelectorAll<HTMLElement>("[data-order-id]")) {
      if (!card.getClientRects().length) continue;
      const id = card.dataset.orderId;
      if (!id) continue;
      const rect = card.getBoundingClientRect();
      const next = { left: rect.left, top: rect.top };
      const previous = previousTicketPositions.current.get(id);
      if (!reducedMotion && typeof card.animate === "function") {
        if (previous) {
          const x = previous.left - next.left;
          const y = previous.top - next.top;
          if (x || y) {
            card.animate(
              [
                { transform: `translate(${x}px, ${y}px)` },
                { transform: "translate(0, 0)" },
              ],
              { duration: 220, easing: "ease-out" },
            );
          }
        } else {
          card.animate(
            [
              { opacity: 0.7, transform: "translateY(8px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 220, easing: "ease-out" },
          );
        }
      }
      positions.set(id, next);
    }
    previousTicketPositions.current = positions;
  }, [layoutKey]);
  if (!snapshot) {
    return (
      <main
        className="mx-auto max-w-[1600px] px-5 py-8"
        role="status"
        aria-label="Conectando con la cocina"
        aria-busy="true"
      >
        <h1 className="display mb-6 text-3xl">Conectando con la cocina…</h1>
        <div className="grid gap-5 md:grid-cols-3">
          {["En revisión", "Cocinando", "Lista para recoger"].map((lane) => (
            <section
              key={lane}
              className="space-y-3 rounded-2xl bg-stone-100 p-3"
            >
              <h2 className="px-2 py-2 font-bold text-stone-700">{lane}</h2>
              <TicketSkeleton />
              <TicketSkeleton />
            </section>
          ))}
        </div>
      </main>
    );
  }
  const payOrder = snapshot.activeOrders.find(
    (o) => o.id === payId && o.status === "ready",
  );

  const lanes = [
    {
      status: "review",
      title: "En revisión",
      note: "Acepta el pedido para empezar a cocinar.",
      color: "bg-stone-500",
    },
    {
      status: "cooking",
      title: "Cocinando",
      note: "Pedidos aceptados. Manos a la masa.",
      color: "bg-clay-600",
    },
    {
      status: "ready",
      title: "Lista para recoger",
      note: "Cobra al entregar o marca No-Show.",
      color: "bg-emerald-700",
    },
  ] as const;

  const visibleLanes = kitchenOnly
    ? lanes.filter((lane) => lane.status !== "review")
    : lanes;
  const laneCounts = {
    review: snapshot.activeOrders.filter((order) => order.status === "review")
      .length,
    cooking: cookingOrders.length,
    ready: snapshot.activeOrders.filter((order) => order.status === "ready")
      .length,
  };
  return (
    <div
      className={`min-h-screen ${simulator ? "border-8 border-dashed border-yellow-400" : ""}`}
      onClickCapture={handleGuidedClick}
      style={
        simulator
          ? {
              borderImage:
                "repeating-linear-gradient(45deg, #facc15 0 12px, #171717 12px 24px) 8",
            }
          : undefined
      }
    >
      {simulator && (
        <AcademyBanner
          currentModuleId={currentModule}
          completedModules={completedModules}
          currentStep={currentStep}
          overallProgressPercent={overallProgress}
          rushMode={rushMode}
          rushRemaining={rushRemaining}
          rushResolved={rushResolved}
          rushTotal={RUSH_TICKET_COUNT}
          canExit={isTrained || completedModules.length === 5}
          onSelectModule={loadModule}
          onStartRush={startRushChallenge}
          onResetModule={() => loadModule(currentModule)}
          onExit={exitSimulator}
        />
      )}
      <StaffHeader
        page="pos"
        lockDisabled={hasPendingPayment}
        onAnalyticsClick={
          simulator
            ? (e) => {
                e.preventDefault();
                setGhostLedgerOpen(true);
                if (currentModule === "module5_revenue_closeout" && currentStepIndex === 0) {
                  advanceStep();
                }
              }
            : undefined
        }
        analyticsTourTarget="btn-nav-analytics"
      >
        {simulator ? (
          <>
            <button
              className="btn bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
              data-tour-target="btn-inventory"
              data-tour-action="inventory-open"
              onClick={() => {
                setGhostInventoryOpen(true);
                if (currentModule === "module4_panic_86" && currentStepIndex === 0) {
                  advanceStep();
                }
              }}
            >
              <SlidersHorizontal size={16} />
              Inventario (Práctica)
            </button>
            <button
              role="switch"
              aria-checked={ghostWebOrdersPaused}
              className={`btn ${ghostWebOrdersPaused ? "btn-danger" : "bg-stone-100 text-stone-800"}`}
              data-tour-target={ghostWebOrdersPaused ? "btn-panic-resume" : "btn-panic-pause"}
              data-tour-action={ghostWebOrdersPaused ? "panic-resume" : "panic-pause"}
              onClick={() => {
                const nextState = !ghostWebOrdersPaused;
                setGhostWebOrdersPaused(nextState);
                if (currentModule === "module4_panic_86" && currentStepIndex === 3 && nextState) {
                  advanceStep();
                } else if (currentModule === "module4_panic_86" && currentStepIndex === 4 && !nextState) {
                  advanceStep();
                }
              }}
            >
              {ghostWebOrdersPaused ? <Play size={16} /> : <Pause size={16} />}
              {ghostWebOrdersPaused ? "Reanudar pedidos web" : "Pausar pedidos web"}
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => setInventory(true)}>
              <SlidersHorizontal size={16} />
              Inventario
            </button>
            <button
              role="switch"
              aria-checked={!snapshot.acceptingOrders}
              className={`btn ${snapshot.acceptingOrders ? "" : "btn-danger"}`}
              disabled={!connected || pausing}
              onClick={async () => {
                setPausing(true);
                await command("pos_toggle_accepting_orders", {
                  acceptingOrders: !snapshot.acceptingOrders,
                });
                setPausing(false);
              }}
            >
              {snapshot.acceptingOrders ? (
                <Pause size={16} />
              ) : (
                <Play size={16} />
              )}
              {snapshot.acceptingOrders
                ? "Pausar pedidos web"
                : "Reanudar pedidos web"}
            </button>
          </>
        )}
      </StaffHeader>
      {activeTab === "queue" && (
        <nav
          className="sticky top-0 z-20 flex border-b border-stone-200 bg-white shadow-sm md:hidden"
          role="tablist"
          aria-label="Filas de pedidos"
        >
          {visibleLanes.map((lane) => (
            <button
              key={lane.status}
              id={`lane-tab-${lane.status}`}
              type="button"
              role="tab"
              aria-selected={activeLane === lane.status}
              aria-controls={`lane-panel-${lane.status}`}
              className={`min-h-12 flex-1 border-b-4 px-2 py-3 text-center text-sm font-bold ${activeLane === lane.status ? "border-clay-600 text-clay-700" : "border-transparent text-stone-500"}`}
              onClick={() => setActiveLane(lane.status)}
            >
              {lane.title}
              <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs tabular-nums">
                {laneCounts[lane.status]}
              </span>
            </button>
          ))}
        </nav>
      )}
      <main className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
        {paymentNotice && (
          <div
            role="alert"
            className="mb-5 flex items-start justify-between gap-3 rounded-xl border-2 border-red-700 bg-red-50 p-4 font-semibold text-red-900"
          >
            <span>{paymentNotice}</span>
            <button
              className="btn shrink-0"
              data-tour-allow="notice"
              onClick={() => setPaymentNotice("")}
            >
              Entendido
            </button>
          </div>
        )}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow mb-2">Un buen turno empieza aquí</p>
            <h1 className="display text-4xl lg:text-5xl">
              Al ritmo del comal.
            </h1>
            <p className="mt-3 text-stone-600">
              {activeTab === "queue"
                ? `${snapshot.activeOrders.length} pedidos en fila · Solo efectivo, siempre al mostrador.`
                : `${snapshot.completedOrders.filter((o) => o.status === "completed").length} pedidos entregados en este turno.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!simulator && (
              <button
                className="btn border-yellow-600 bg-yellow-50 font-bold text-stone-900 hover:bg-yellow-100"
                onClick={startSimulator}
                disabled={hasPendingPayment}
                title={
                  hasPendingPayment
                    ? "Espera a que se registre el pago en curso"
                    : "Practica el flujo de cocina y caja sin cambiar los datos reales"
                }
              >
                <GraduationCap size={16} />
                Guía interactiva
              </button>
            )}
            {activeTab === "queue" && (
              <button
                className={`btn transition-colors ${
                  kitchenOnly
                    ? "border-clay-600 bg-clay-50 text-clay-900 font-bold"
                    : "border-stone-300 text-stone-700"
                }`}
                onClick={() => {
                  const next = !kitchenOnly;
                  setKitchenOnly(next);
                  if (next && activeLane === "review") setActiveLane("cooking");
                }}
                title="Ocultar o mostrar fila de caja"
              >
                <ChefHat size={16} />
                <span>
                  {kitchenOnly ? "Solo Cocina (Activo)" : "Modo Cocina"}
                </span>
              </button>
            )}
            {simulator && !rushMode && (
              <button
                className="btn border-clay-700 bg-clay-50 font-bold text-clay-950 hover:bg-clay-100"
                data-tour-allow="rush"
                onClick={startRushChallenge}
              >
                Reto almuerzo · {RUSH_LIMIT_SECONDS} segundos
              </button>
            )}
            <AudioUnlockButton />
            <SoundButton />
          </div>
        </div>

        {/* Tab switcher: En Fila vs Completados */}
        <div className="mb-6 flex border-b border-stone-200" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "queue"}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition-colors ${
              activeTab === "queue"
                ? "border-clay-600 text-clay-800"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
            onClick={() => setActiveTab("queue")}
          >
            <Clock3 size={16} />
            <span>Pedidos en Fila</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-black ${
                activeTab === "queue"
                  ? "bg-clay-100 text-clay-800"
                  : "bg-stone-100 text-stone-600"
              }`}
            >
              {snapshot.activeOrders.length}
            </span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "completed"}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition-colors ${
              activeTab === "completed"
                ? "border-clay-600 text-clay-800"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
            onClick={() => setActiveTab("completed")}
          >
            <Check size={16} />
            <span>Pedidos Completados</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-black ${
                activeTab === "completed"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-stone-100 text-stone-600"
              }`}
            >
              {
                snapshot.completedOrders.filter((o) => o.status === "completed")
                  .length
              }
            </span>
          </button>
        </div>

        {activeTab === "completed" ? (
          <CompletedOrdersSection orders={snapshot.completedOrders} />
        ) : (
          <>
            {comalSummary.totalPieces > 0 && (
              <section
                className="mb-6 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-xs"
                aria-label="Resumen de platillos al comal"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                      <Flame size={20} />
                    </span>
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-bold text-amber-950">
                        <span>En el comal ahora:</span>
                        <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-black text-amber-950">
                          {comalSummary.totalPieces}{" "}
                          {comalSummary.totalPieces === 1 ? "pieza" : "piezas"}
                        </span>
                      </h2>
                      <p className="mt-0.5 text-xs font-medium text-amber-900/80">
                        {comalSummary.items
                          .map((i) => `${i.total}× ${i.name}`)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <button
                    className="cursor-pointer text-xs font-bold text-amber-900 underline hover:text-amber-950"
                    onClick={() => setShowComalDetails(!showComalDetails)}
                  >
                    {showComalDetails ? "Ocultar masas" : "Ver detalle de masa"}
                  </button>
                </div>
                {showComalDetails && (
                  <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-amber-200/60 pt-3 text-xs sm:grid-cols-3 md:grid-cols-4">
                    {comalSummary.items.map((item) => (
                      <div
                        key={item.name}
                        className="rounded-lg border border-amber-200/50 bg-white/80 p-2.5 shadow-xs"
                      >
                        <strong className="block font-semibold text-stone-900">
                          {item.total}× {item.name}
                        </strong>
                        <ul className="mt-1 space-y-0.5 text-[11px] text-stone-600">
                          {Object.entries(item.masas).map(([masa, qty]) => (
                            <li key={masa} className="flex justify-between">
                              <span>{masa}:</span>
                              <span className="font-bold">{qty}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <div
              ref={boardRef}
              className={`grid items-start gap-5 ${
                kitchenOnly ? "md:grid-cols-2" : "md:grid-cols-3"
              }`}
            >
              {visibleLanes.map((lane) => {
                const orders = snapshot.activeOrders.filter(
                  (o) => o.status === lane.status,
                );
                return (
                  <section
                    key={lane.status}
                    className={`${lane.status === activeLane ? "flex" : "hidden"} min-w-0 flex-col rounded-2xl bg-stone-100 p-3 md:flex`}
                    aria-label={lane.title}
                  >
                    <header className="px-2 pb-5 pt-2">
                      <div className="flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-lg font-bold">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${lane.color}`}
                          />
                          {lane.title}
                        </h2>
                        <span className="rounded-md bg-white px-2.5 py-1 text-sm font-bold">
                          {orders.length}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-stone-500">{lane.note}</p>
                    </header>
                    <ErrorBoundary
                      resetKeys={[snapshot.revision]}
                      fallback={({ retry }) => (
                        <DataErrorFallback
                          title={`Error de datos en «${lane.title}»`}
                          retry={retry}
                        />
                      )}
                    >
                      <div className="space-y-3">
                        {orders.map((order) => {
                          const pendingPayment = pendingPaymentFor(order.id);
                          return (
                            <ErrorBoundary
                              key={order.id}
                              resetKeys={[snapshot.revision]}
                              fallback={({ retry }) => (
                                <DataErrorFallback
                                  title="Error de datos"
                                  retry={retry}
                                />
                              )}
                            >
                              <TicketCard
                                order={order}
                                now={now}
                                simulator={simulator}
                                highlighted={
                                  simulator && currentStep?.targetLane === order.status
                                }
                                errorShake={wrongOrderId === order.id}
                                coachTarget={guidedTarget ?? undefined}
                                onSimulatorAdvance={advanceSimulatorOrder}
                                onSimulatorNoShow={markSimulatorNoShow}
                                restrictionAcknowledged={restrictionAcknowledgedIds.has(
                                  order.id,
                                )}
                                onAcknowledgeRestriction={() =>
                                  acknowledgeDemoRestriction(order.id)
                                }
                                pendingSeconds={pendingPayment?.seconds}
                                pendingCents={pendingPayment?.cents}
                                onUndoPayment={() =>
                                  simulator
                                    ? undoDemoMistake()
                                    : undoLivePayment(order.id)
                                }
                                onPay={() => {
                                  setPayId(order.id);
                                  if (simulator && currentStep?.action === "pay") {
                                    advanceStep();
                                  }
                                }}
                              />
                            </ErrorBoundary>
                          );
                        })}
                        {!simulator && !connected && <TicketSkeleton />}
                        {!orders.length && (simulator || connected) && (
                          <EmptyState>
                            Sin pedidos {lane.title.toLowerCase()}
                          </EmptyState>
                        )}
                      </div>
                    </ErrorBoundary>
                  </section>
                );
              })}
            </div>
          </>
        )}
        <footer className="mt-8 flex flex-wrap justify-between gap-3 text-xs text-stone-500">
          <span>Hecho con masa. Servido con cuidado.</span>
          <span>
            {simulator
              ? "Las ventas reales del turno no se modifican en el simulador."
              : `Venta del turno: ${mxn(snapshot.salesMetrics?.revenueCents || 0)} MXN`}
          </span>
        </footer>
      </main>
      {inventory && <InventoryControl onClose={() => setInventory(false)} />}{" "}
      {payOrder && (
        <CashTender
          order={payOrder}
          onClose={() => {
            setPayId(null);
            if (simulator) {
              setSelectedTenderCents(null);
            }
          }}
          simulator={simulator}
          guidedTarget={guidedTarget}
          onExitSimulator={exitSimulator}
          trainingMessage={simulator ? trainingMessage : undefined}
          onSimulatorTenderSelected={(cents) => {
            setSelectedTenderCents(cents);
            if (currentStep?.action === "cash-preset") {
              advanceStep();
            }
          }}
          onConfirm={simulator ? completeSimulatorPayment : queueLivePayment}
        />
      )}
      {alarmFlash && (
        <div
          className="animate-alarm-flash pointer-events-none fixed inset-0 z-[90] bg-red-600/60 motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      {simulator && rushFinished && (
        <>
          <div
            className="fixed inset-0 z-[75] bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
          />
          <section
            className="fixed inset-x-4 top-1/2 z-[80] mx-auto max-w-md -translate-y-1/2 rounded-3xl border-4 border-yellow-400 bg-white p-6 text-center text-stone-950 shadow-2xl"
            role="alertdialog"
            aria-labelledby="rush-result-title"
            aria-describedby="rush-result-detail"
          >
            <Trophy
              className={`mx-auto ${rushPassed ? "text-emerald-700" : "text-clay-700"}`}
              size={48}
              aria-hidden="true"
            />
            <h2
              id="rush-result-title"
              className={`display mt-3 text-3xl ${rushPassed ? "text-emerald-800" : "text-clay-800"}`}
            >
              {rushPassed ? "¡Velocidad de Taquero Experto!" : "Casi lo logras"}
            </h2>
            <p id="rush-result-detail" className="mt-2 font-semibold">
              {rushPassed
                ? `Cobraste las ${RUSH_TICKET_COUNT} comandas en ${rushElapsed} segundos.`
                : `${rushCompleted} de ${RUSH_TICKET_COUNT} comandas cobradas en ${rushElapsed} segundos. Inténtalo otra vez: cada ronda te sale más rápido.`}
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                className="btn btn-primary flex-1"
                data-tour-allow="rush"
                onClick={startRushChallenge}
              >
                {rushPassed ? "Repetir reto" : "Intentar de nuevo"}
              </button>
              {rushPassed ? (
                <button
                  className="btn btn-primary bg-emerald-700 border-emerald-700 flex-1 text-white font-bold"
                  onClick={() => {
                    setRushFinished(false);
                    setIsGraduated(true);
                  }}
                >
                  ¡Ver Graduación!
                </button>
              ) : (
                <button
                  className="btn flex-1"
                  data-tour-allow="exit"
                  onClick={() => {
                    setRushFinished(false);
                    setRushMode(false);
                    loadModule("module5_revenue_closeout");
                  }}
                >
                  Volver a Ganancias y Cierre
                </button>
              )}
            </div>
          </section>
        </>
      )}
      {simulator && currentStep && !rushMode && (
        <CoachmarkSpotlight
          step={currentStep}
          explainLockRemaining={explainLockRemaining}
          onTargetClickAllowed={explainLockRemaining === 0}
        />
      )}
      {simulator && (
        <>
          <AcademyInventoryModal
            isOpen={ghostInventoryOpen}
            onClose={() => {
              setGhostInventoryOpen(false);
              if (currentModule === "module4_panic_86" && currentStepIndex === 2) {
                advanceStep();
              }
            }}
            items={ghostInventoryItems}
            onToggleItem={(itemId) => {
              setGhostInventoryItems((prev) =>
                prev.map((it) =>
                  it.id === itemId ? { ...it, available: !it.available } : it,
                ),
              );
              if (
                currentModule === "module4_panic_86" &&
                currentStepIndex === 1 &&
                itemId === "gordita-chicharron"
              ) {
                advanceStep();
              }
            }}
            guidedTarget={guidedTarget}
            onToggleAllowed={explainLockRemaining === 0}
          />
          <AcademyLedgerModal
            metrics={ghostSalesMetrics}
            isOpen={ghostLedgerOpen}
            onClose={() => setGhostLedgerOpen(false)}
            guidedTarget={guidedTarget}
            onInspectRevenue={() => {
              if (currentModule === "module5_revenue_closeout" && currentStepIndex === 1) {
                advanceStep();
              }
            }}
            onOpenCloseShift={() => {
              setGhostBlindDropOpen(true);
              if (currentModule === "module5_revenue_closeout" && currentStepIndex === 2) {
                advanceStep();
              }
            }}
            isBlindDropOpen={ghostBlindDropOpen}
            onBlindDropConfirmed={() => {
              setGhostBlindDropOpen(false);
              setGhostLedgerOpen(false);
              if (currentModule === "module5_revenue_closeout") {
                completeModule("module5_revenue_closeout");
              }
            }}
            onCardClickAllowed={explainLockRemaining === 0}
          />
          <GraduationModal
            isOpen={isGraduated}
            onGraduateAndGoLive={handleGraduateAndGoLive}
            onRepeatTraining={() => {
              setIsGraduated(false);
              setCompletedModules([]);
              loadModule("module1_golden_path");
            }}
          />
          <ShadowWarningToast message={shadowWarning} />
        </>
      )}
    </div>
  );
}
