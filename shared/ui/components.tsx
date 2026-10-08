import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Check,
  ChefHat,
  CircleHelp,
  LockKeyhole,
  Maximize2,
  Minimize2,
  Minus,
  Package,
  Plus,
  Volume1,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type { Modifier, Order, Transaction } from "../types/realtime";
import { useRealtime } from "./RealtimeProvider";
export const mxn = (cents: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    cents / 100,
  );
/** How a payment was made, in the words staff use. Receipts saved before transfers existed have no method: cash. */
export const paymentMethodLabel = (transaction: Pick<Transaction, "method">) =>
  transaction.method === "spei" ? "Transferencia SPEI" : "Efectivo";
/** One line describing what came in: cash shows the tender and change, a transfer shows only the exact total. */
export const paymentSummary = (
  transaction: Pick<
    Transaction,
    "method" | "totalCents" | "tenderedCents" | "changeCents"
  >,
) =>
  transaction.method === "spei"
    ? `${paymentMethodLabel(transaction)} · ${mxn(transaction.totalCents)}`
    : `Efectivo recibido: ${mxn(transaction.tenderedCents)} · Cambio: ${mxn(transaction.changeCents)}`;
export const time = (at: string) =>
  new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date(at));
export const orderLabel = (order: Order) =>
  `#${String(order.number).padStart(3, "0")}`;
export function appLink(app: "order" | "pos" | "analytics") {
  const devPorts = { order: "5173", pos: "5174", analytics: "5175" };
  return ["5173", "5174", "5175"].includes(location.port)
    ? `${location.protocol}//${location.hostname}:${devPorts[app]}/realtime.html`
    : `/${app}/`;
}
export function ConnectionBanner() {
  const { connected, suspended, error, clearError } = useRealtime();
  return (
    <>
      {!connected && !suspended && (
        <div
          role="alert"
          className="z-layer-system sticky top-0 flex items-center justify-center gap-2 bg-red-800 p-3 font-bold text-white"
        >
          <WifiOff size={18} />
          Sin Conexión{" "}
          <span className="hidden text-sm font-normal sm:inline">
            · Esperando al servidor
          </span>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 p-4 text-red-800"
        >
          <span>{error}</span>
          <button
            aria-label="Cerrar error"
            className="p-2"
            onClick={clearError}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
}
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}
let deferredInstallPrompt: InstallPromptEvent | null = null;
const installPromptListeners = new Set<
  (event: InstallPromptEvent | null) => void
>();
function updateInstallPrompt(event: InstallPromptEvent | null) {
  deferredInstallPrompt = event;
  for (const listener of installPromptListeners) listener(event);
}
if (typeof window !== "undefined")
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    updateInstallPrompt(event as InstallPromptEvent);
  });
export function PWAServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch((error: unknown) =>
        console.error("MasaFlow service worker registration failed.", error),
      );
  }, []);
  return null;
}
export function PWAInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    () => deferredInstallPrompt,
  );
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    setIos(
      window.isSecureContext &&
        (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)),
    );
    const standalone = window.matchMedia("(display-mode: standalone)");
    setInstalled(
      standalone.matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    const onInstalled = () => {
      setInstalled(true);
      updateInstallPrompt(null);
    };
    installPromptListeners.add(setInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    standalone.addEventListener("change", onInstalled);
    return () => {
      installPromptListeners.delete(setInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      standalone.removeEventListener("change", onInstalled);
    };
  }, []);
  if (installed || (!installPrompt && !ios)) return null;
  return (
    <>
      <button
        type="button"
        className="btn min-h-11 px-3"
        onClick={async () => {
          if (installPrompt) {
            await installPrompt.prompt();
            const choice = await installPrompt.userChoice;
            updateInstallPrompt(null);
            if (choice.outcome === "accepted") setInstalled(true);
          } else {
            setShowHelp(true);
          }
        }}
      >
        Instalar app
      </button>
      {showHelp && (
        <Modal title="Instalar MasaFlow" onClose={() => setShowHelp(false)}>
          <p>
            En Safari, pulsa <strong>Compartir</strong> y elige{" "}
            <strong>Añadir a pantalla de inicio</strong> para abrir MasaFlow
            como una aplicación.
          </p>
        </Modal>
      )}
    </>
  );
}
export function Modal({
  title,
  children,
  onClose,
  layer = "native",
  closeTarget,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Training only: lets the spotlight find the close button. */
  closeTarget?: string;
  /**
   * «native» is a browser <dialog> (top layer, focus trap for free). «inline» is a fixed
   * panel at z-layer-modal rendered in a portal: the training simulator uses it so the
   * coach card and spotlight (z-layer-academy) can stay above the dialog they explain.
   */
  layer?: "native" | "inline";
}) {
  const { connected, suspended, error } = useRealtime();
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (layer === "native") ref.current?.showModal();
    else panel.current?.focus();
  }, [layer]);
  useEffect(() => {
    if (layer !== "inline") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [layer, onClose]);
  const header = (
    <header className="z-layer-board sticky top-0 flex items-center justify-between gap-4 border-b border-stone-200 bg-cream p-5">
      <h2 className="text-xl font-bold">{title}</h2>
      <button
        className="btn min-h-11 min-w-11"
        aria-label="Cerrar ventana"
        data-tour-target={closeTarget}
        onClick={onClose}
      >
        <X size={18} />
      </button>
    </header>
  );
  const notices = (
    <>
      {!connected && !suspended && (
        <p
          role="alert"
          className="bg-red-800 p-3 text-center font-bold text-white"
        >
          Sin Conexión
        </p>
      )}
      {error && (
        <p role="alert" className="bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </>
  );
  if (layer === "inline")
    return createPortal(
      <div
        className="z-layer-modal fixed inset-0 flex items-end justify-center bg-stone-900/55 pt-[var(--academy-bar-h,0px)] sm:items-center sm:p-4 sm:pt-[calc(var(--academy-bar-h,0px)_+_1rem)]"
        data-academy-modal
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className="max-h-[calc(100dvh_-_var(--academy-bar-h,0px)_-_0.5rem)] w-full overflow-y-auto overscroll-contain rounded-t-2xl border border-stone-200 bg-cream pb-[env(safe-area-inset-bottom)] text-stone-900 shadow-xl outline-none sm:max-w-[580px] sm:rounded-2xl"
        >
          <div className="z-layer-board sticky top-0 bg-cream">
            {header}
            {/* The coach card for steps inside this dialog is portaled here, so it can never cover the dialog's own buttons. */}
            <div data-academy-coach-slot />
          </div>
          {notices}
          <div className="p-5">{children}</div>
        </div>
      </div>,
      document.body,
    );
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      {header}
      {notices}
      <div className="p-5">{children}</div>
    </dialog>
  );
}
export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
  tourTarget,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
  /** Training only: lets the spotlight find this switch. */
  tourTarget?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-help="inventory-toggle"
      data-tour-target={tourTarget}
      onClick={onChange}
      className={`flex min-h-12 min-w-20 items-center justify-center gap-2 rounded-full px-3 text-xs font-bold ${checked ? "bg-emerald-800 text-white" : "bg-stone-200 text-stone-700"}`}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-emerald-900">
        {checked ? <Check size={14} /> : <Minus size={14} />}
      </span>
      {checked ? "Disponible" : "Agotado"}
    </button>
  );
}
export function InventoryControl({ onClose }: { onClose: () => void }) {
  const { snapshot, command, connected } = useRealtime();
  const [pending, setPending] = useState(false);
  if (!snapshot) return null;
  return (
    <Modal title="Inventario" onClose={onClose}>
      <p className="mb-6 text-sm text-stone-600">
        Los cambios aparecen al instante en el menú de tus clientes.
      </p>
      {(["item", "modifier"] as const).map((kind) => (
        <section key={kind} className="mb-6">
          <h3 className="eyebrow mb-2">
            {kind === "item" ? "Platillos" : "Masas y modificadores"}
          </h3>
          {(kind === "item" ? snapshot.menuItems : snapshot.modifiers).map(
            (item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 border-b border-stone-200 py-3"
              >
                <span className="font-medium">{item.name}</span>
                <ToggleSwitch
                  checked={item.available}
                  label={`Disponibilidad de ${item.name}`}
                  disabled={!connected || pending}
                  onChange={async () => {
                    setPending(true);
                    await command("admin_toggle_stock", {
                      kind,
                      id: item.id,
                      available: !item.available,
                    });
                    setPending(false);
                  }}
                />
              </div>
            ),
          )}
        </section>
      ))}
    </Modal>
  );
}
export function PinGate({ children }: { children: ReactNode }) {
  const { snapshot, login, connected, error, suspended } = useRealtime();
  const [pin, setPin] = useState(""),
    [busy, setBusy] = useState(false),
    [shakeKey, setShakeKey] = useState(0);
  // The training simulator suspends realtime (snapshot becomes null) while staff stay signed in.
  if (snapshot?.staff || suspended) return <>{children}</>;
  const enter = async () => {
    setBusy(true);
    const authenticated = await login(pin);
    if (!authenticated && connected) setShakeKey((key) => key + 1);
    setPin("");
    setBusy(false);
  };
  return (
    <div className="flex min-h-[90dvh] items-center justify-center px-5 py-10">
      <section className="w-full max-w-sm text-center">
        <Brand />
        <div className="mx-auto mb-5 mt-10 flex h-14 w-14 items-center justify-center rounded-full bg-clay-100 text-clay-700">
          <LockKeyhole />
        </div>
        <h1 className="display text-4xl">Bienvenido al turno.</h1>
        <p className="mb-6 mt-3 text-stone-600">
          Ingresa el PIN de 4 dígitos del personal.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void enter();
          }}
        >
          <label className="sr-only" htmlFor="staff-pin">
            PIN del personal
          </label>
          <input
            id="staff-pin"
            key={shakeKey}
            className={`field text-center text-3xl tracking-[0.5em] ${shakeKey ? "animate-shake" : ""}`}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) =>
              setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
          />
          {error && (
            <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}
          <div className="my-4 grid grid-cols-3 gap-3">
            {[
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
              "Borrar",
              "0",
              "←",
            ].map((key) => (
              <button
                key={key}
                type="button"
                className="btn text-xl"
                disabled={busy}
                onClick={() =>
                  setPin((p) =>
                    key === "Borrar"
                      ? ""
                      : key === "←"
                        ? p.slice(0, -1)
                        : (p + key).slice(0, 4),
                  )
                }
              >
                {key}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary w-full"
            disabled={!connected || pin.length !== 4 || busy}
          >
            {busy ? "Verificando…" : "Entrar al turno"}
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="mt-5 text-xs text-stone-500">
          Acceso exclusivo del personal · MasaFlow
        </p>
      </section>
    </div>
  );
}
export function Brand() {
  return (
    <div className="inline-flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-clay-600 text-white">
        <ChefHat size={24} />
      </span>
      <span className="text-xl font-bold tracking-tight">
        MasaFlow<span className="text-clay-600">.</span>
      </span>
    </div>
  );
}
export function FullscreenButton() {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {});
    } else {
      void document.exitFullscreen().catch(() => {});
    }
  };
  return (
    <button
      className="btn"
      onClick={toggle}
      data-help="fullscreen"
      title={
        fullscreen
          ? "Salir de pantalla completa"
          : "Modo Kiosko / Pantalla completa"
      }
      aria-label="Pantalla completa"
    >
      {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  );
}
export function StaffHeader({
  page,
  children,
  lockDisabled = false,
  onAnalyticsClick,
  analyticsTourTarget,
  onHelp,
}: {
  page: "pos" | "analytics";
  children?: ReactNode;
  /** Locking drops the session, so it is blocked while a confirmed payment is still unsent. */
  lockDisabled?: boolean;
  /** Training only: replaces the page navigation with a practice screen and marks the link as a spotlight target. */
  onAnalyticsClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  analyticsTourTarget?: string;
  /** Opens the button cheat sheet. */
  onHelp?: () => void;
}) {
  const { snapshot, connected, suspended, logout } = useRealtime();
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <Brand />
        <nav className="flex gap-2" aria-label="Navegación del personal">
          <a
            className={`btn ${page === "pos" ? "bg-clay-50 text-clay-700" : ""}`}
            href={appLink("pos")}
            aria-current={page === "pos" ? "page" : undefined}
          >
            <ChefHat size={17} />
            Cocina
          </a>
          <a
            className={`btn ${page === "analytics" ? "bg-clay-50 text-clay-700" : ""}`}
            href={appLink("analytics")}
            aria-current={page === "analytics" ? "page" : undefined}
            data-help="nav-analytics"
            data-tour-target={analyticsTourTarget}
            onClick={onAnalyticsClick}
          >
            Caja y ventas
          </a>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`flex items-center gap-1.5 text-xs font-semibold ${suspended ? "text-amber-800" : connected ? "text-emerald-800" : "text-red-700"}`}
          >
            {suspended ? (
              <Volume1 size={15} />
            ) : connected ? (
              <Wifi size={15} />
            ) : (
              <WifiOff size={15} />
            )}{" "}
            {suspended ? "Simulador" : connected ? "En vivo" : "Sin Conexión"}
            {snapshot && !suspended && (
              <span className="hidden font-normal text-stone-500 xl:inline">
                · {time(snapshot.observedAt)}
              </span>
            )}
          </span>
          <PWAInstallButton />
          <FullscreenButton />
          {children}
          {onHelp && !suspended && (
            <button
              className="btn"
              onClick={onHelp}
              aria-label="Ayuda: qué hace cada botón"
              title="Ayuda: qué hace cada botón"
            >
              <CircleHelp size={16} />
              <span className="hidden sm:inline">Ayuda</span>
            </button>
          )}
          <button
            className="btn"
            onClick={logout}
            disabled={lockDisabled || suspended}
            data-help="lock"
            data-tour-target={suspended ? "btn-lock" : undefined}
            title={
              suspended
                ? "No disponible durante el entrenamiento"
                : lockDisabled
                  ? "Espera a que se registre el pago en curso"
                  : undefined
            }
            aria-label="Bloquear sesión"
          >
            <LockKeyhole size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
export function ModifierBadge({ modifier }: { modifier: Modifier }) {
  // Red = leave it off, green = add it, purple/amber = how it is cooked (comal / frito), grey = anything else (masa).
  const style =
    modifier.kind === "omit"
      ? "bg-red-600 text-white"
      : modifier.kind === "extra"
        ? "bg-green-600 text-white"
        : modifier.kind === "prep"
          ? modifier.id === "prep-comal"
            ? "bg-purple-700 text-white"
            : "bg-amber-500 text-stone-950"
          : "bg-stone-100 text-stone-700";
  return (
    <span
      data-modifier-kind={modifier.kind}
      className={`inline-block rounded-md px-2 py-1 text-xs font-bold ${style}`}
    >
      {modifier.name}
    </span>
  );
}
export function OrderLines({ order }: { order: Order }) {
  return (
    <ul className="space-y-4">
      {order.items.map((line, index) => (
        <li key={index}>
          <div className="flex items-start justify-between gap-3">
            <span className="font-semibold">
              {line.quantity} × {line.name}
            </span>
            <span className="text-sm tabular-nums text-stone-500">
              {mxn(line.lineTotalCents)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {line.modifiers.map((m) => (
              <ModifierBadge key={m.id} modifier={m} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
/**
 * One shared one-second clock. Only components that actually display elapsed time
 * subscribe, so a tick re-renders each ticket's timer instead of the whole board, and
 * nothing ticks when nobody is subscribed.
 */
const clock = {
  listeners: new Set<() => void>(),
  value: 0,
  timer: undefined as ReturnType<typeof setInterval> | undefined,
};
function subscribeClock(listener: () => void) {
  clock.listeners.add(listener);
  if (clock.listeners.size === 1) {
    clock.value = Date.now();
    clock.timer = setInterval(() => {
      clock.value = Date.now();
      clock.listeners.forEach((notify) => notify());
    }, 1000);
  }
  // A late subscriber must not show a stale value from the previous tick.
  clock.value = Date.now();
  listener();
  return () => {
    clock.listeners.delete(listener);
    if (clock.listeners.size === 0) clearInterval(clock.timer);
  };
}
const idleSubscribe = () => () => {};
/** Current time in ms, refreshed every second while `enabled`; 0 when disabled (do not read it then). */
export function useNow(enabled = true) {
  return useSyncExternalStore(
    enabled ? subscribeClock : idleSubscribe,
    enabled ? () => clock.value : () => 0,
  );
}
export function useTicketTimer(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
let audio: AudioContext | undefined;
export async function enableAudio(): Promise<boolean> {
  try {
    if (typeof window === "undefined") return false;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return false;
    audio ||= new AudioCtx();
    if (audio.state === "suspended") await audio.resume();
    return audio.state === "running";
  } catch {
    return false;
  }
}
export function AudioUnlockButton({
  onUnlocked,
}: {
  /** Called after the browser actually allowed sound (the training uses it to confirm the step). */
  onUnlocked?: () => void;
}) {
  const [ready, setReady] = useState(
    () => typeof audio !== "undefined" && audio.state === "running",
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <button
        type="button"
        data-tour-allow="audio"
        data-tour-target="btn-audio-unlock"
        data-help="audio-unlock"
        className={`btn ${ready ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-400 bg-amber-50 font-bold text-amber-950"}`}
        aria-label={
          ready
            ? "Timbre activado en este dispositivo"
            : "Iniciar turno y activar timbre"
        }
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          const unlocked = await enableAudio();
          setReady(unlocked);
          setFailed(!unlocked);
          if (unlocked) {
            chime("new");
            onUnlocked?.();
          }
          setBusy(false);
        }}
        disabled={busy}
      >
        {ready ? <Volume2 size={16} /> : <Volume1 size={16} />}
        {busy
          ? "Activando…"
          : ready
            ? "Timbre activo"
            : "Iniciar turno · Activar timbre"}
      </button>
      {failed && (
        <span role="alert" className="text-xs font-semibold text-red-800">
          No se pudo activar el timbre en este navegador.
        </span>
      )}
    </>
  );
}
let volumeScale = 1.0;
export function setChimeVolume(vol: number) {
  volumeScale = Math.max(0, Math.min(2.0, vol));
}
export function getChimeVolume() {
  return volumeScale;
}
export function chime(
  type: "new" | "kitchen" | "ready" | "alarm" | boolean = "new",
) {
  try {
    if (volumeScale <= 0) return;
    enableAudio();
    if (!audio || audio.state !== "running") return;
    const isKitchen = type === "kitchen" || type === true;
    const isReady = type === "ready";
    const isAlarm = type === "alarm";
    const notes = isAlarm
      ? [880, 440, 880, 440]
      : isReady
        ? [659.25, 783.99, 1046.5]
        : isKitchen
          ? [587.33, 880]
          : [523.25, 659.25];
    notes.forEach((frequency, index) => {
      const oscillator = audio!.createOscillator();
      const gain = audio!.createGain();
      const at = audio!.currentTime + index * 0.15;
      oscillator.type = isAlarm ? "square" : "sine";
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.08 * volumeScale, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
      oscillator.connect(gain);
      gain.connect(audio!.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.33);
    });
  } catch {
    // Ignore audio play errors
  }
}
export function SoundButton() {
  // mode: "normal" (1.0), "soft" (0.5), "mute" (0.0)
  const [mode, setMode] = useState<"normal" | "soft" | "mute">("normal");
  useEffect(() => {
    if (volumeScale === 0) setMode("mute");
    else if (volumeScale <= 0.6) setMode("soft");
    else setMode("normal");
  }, []);
  const cycle = () => {
    void enableAudio();
    if (mode === "normal") {
      setMode("soft");
      setChimeVolume(0.5);
      chime("new");
    } else if (mode === "soft") {
      setMode("mute");
      setChimeVolume(0);
    } else {
      setMode("normal");
      setChimeVolume(1.0);
      chime("new");
    }
  };
  return (
    <button
      data-tour-allow="audio"
      data-help="sound"
      className={`btn transition-colors ${
        mode === "mute"
          ? "border-stone-300 text-stone-400 line-through"
          : mode === "soft"
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : "border-stone-300 text-stone-800"
      }`}
      onClick={cycle}
      title="Alternar volumen del timbre: Normal → Suave → Silenciado"
      aria-label={`Sonido: ${mode === "mute" ? "Silenciado" : mode === "soft" ? "Suave" : "Normal"}`}
    >
      {mode === "mute" ? (
        <VolumeX size={16} />
      ) : mode === "soft" ? (
        <Volume1 size={16} className="text-amber-700" />
      ) : (
        <Volume2 size={16} className="text-emerald-700" />
      )}
      <span>
        {mode === "mute"
          ? "Silencio"
          : mode === "soft"
            ? "Sonido Suave"
            : "Sonido Activo"}
      </span>
    </button>
  );
}
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="py-12 text-center text-stone-500">
      <Package className="mx-auto mb-3 opacity-40" size={32} />
      <p className="text-sm">{children}</p>
    </div>
  );
}
export function Quantity({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        className="btn"
        aria-label="Quitar uno"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={16} />
      </button>
      <span className="w-5 text-center font-bold">{value}</span>
      <button
        className="btn"
        aria-label="Agregar uno"
        disabled={value >= 99}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
