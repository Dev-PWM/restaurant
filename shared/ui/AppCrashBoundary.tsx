import { useEffect, type ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

/** How many times a screen may rebuild itself without being asked, within WINDOW_MS, before it waits for a tap. */
const AUTO_RETRIES = 2;
const WINDOW_MS = 30_000;
const crashes: number[] = [];

/**
 * Rebuilds the screen on its own after a crash, at most twice in 30 seconds; after that it shows a button.
 * The cap matters: a crash that happens on every render must not become an endless rebuild loop.
 */
function Recovering({ retry }: { retry: () => void }) {
  const now = Date.now();
  while (crashes.length && now - crashes[0] > WINDOW_MS) crashes.shift();
  const automatic = crashes.length < AUTO_RETRIES;
  useEffect(() => {
    if (!automatic) return;
    crashes.push(Date.now());
    const timer = window.setTimeout(retry, 200);
    return () => window.clearTimeout(timer);
  }, [automatic, retry]);
  if (automatic) return null;
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="display text-3xl font-bold text-stone-900">
        Esta pantalla tuvo un problema.
      </h1>
      <p className="text-sm leading-relaxed text-stone-600">
        Tu sesión y tus pedidos siguen guardados. Toca el botón para volver a
        cargar la pantalla.
      </p>
      <button className="btn btn-primary w-full" onClick={retry}>
        Reintentar
      </button>
    </main>
  );
}

/**
 * Last line of defence for a whole app: a render or commit crash shows a recovery screen instead of a white page.
 * Put it inside the realtime provider and the PIN gate so recovering keeps the socket and the staff session.
 */
export function AppCrashBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={({ retry }) => <Recovering retry={retry} />}>
      {children}
    </ErrorBoundary>
  );
}
