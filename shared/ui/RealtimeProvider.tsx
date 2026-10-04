import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  Command,
  Commands,
  Reply,
  ServerToClientEvents,
  Snapshot,
} from "../types/realtime";
type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const sessionKey = "masaflow.v3.session";
const tokenKey = "masaflow.v3.staff";
export function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
/** UUID fallback works on plain HTTP LAN addresses, where randomUUID is unavailable. */
export function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function session() {
  const stored = readStorage(sessionKey);
  if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
  const id = uuid();
  writeStorage(sessionKey, id);
  return id;
}
interface ContextValue {
  snapshot: Snapshot | null;
  connected: boolean;
  sessionId: string;
  error: string;
  clearError: () => void;
  command: <K extends Command>(
    event: K,
    payload: Commands[K],
  ) => Promise<Reply>;
  login: (pin: string) => Promise<boolean>;
  logout: () => void;
}
const Context = createContext<ContextValue | null>(null);
export function RealtimeProvider({
  children,
  staff = false,
}: {
  children: ReactNode;
  staff?: boolean;
}) {
  const [sessionId] = useState(session),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState("");
  const socketRef = useRef<AppSocket | null>(null);
  useEffect(() => {
    const socket: AppSocket = io({
      autoConnect: false,
      auth: { sessionId, token: staff ? readStorage(tokenKey) || "" : "" },
      reconnectionDelayMax: 3000,
    });
    socketRef.current = socket;
    const apply = (next: Snapshot) => {
      setSnapshot(next);
      setConnected(socket.connected && navigator.onLine);
      if (staff && !next.staff) {
        writeStorage(tokenKey, null);
        socket.auth = { sessionId, token: "" };
      }
    };
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 3000;
    const cancelRetry = () => {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    };
    const disconnect = () => setConnected(false);
    socket.on("connect", () => {
      cancelRetry();
      retryDelay = 3000;
      socket.emit("request_init");
    });
    socket.on("disconnect", disconnect);
    socket.on("connect_error", () => {
      disconnect();
      cancelRetry();
      if (!socket.active && navigator.onLine) {
        retryTimer = setTimeout(() => {
          if (navigator.onLine) socket.connect();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      }
    });
    socket.on("init_data", apply);
    socket.on("state_updated", apply);
    socket.on("menu_updated", (menu) =>
      setSnapshot((previous) =>
        previous && menu.revision >= previous.revision
          ? { ...previous, ...menu }
          : previous,
      ),
    );
    socket.on("metrics_updated", (salesMetrics) =>
      setSnapshot((previous) =>
        previous?.staff ? { ...previous, salesMetrics } : previous,
      ),
    );
    socket.on("staff_expired", () => {
      writeStorage(tokenKey, null);
      socket.auth = { sessionId, token: "" };
      setSnapshot((previous) =>
        previous
          ? {
              ...previous,
              staff: false,
              salesMetrics: null,
              activeOrders: [],
              completedOrders: [],
            }
          : null,
      );
    });
    const offline = () => {
      cancelRetry();
      setConnected(false);
      socket.disconnect();
    };
    const online = () => {
      socket.connect();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    if (navigator.onLine) socket.connect();
    return () => {
      cancelRetry();
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId, staff]);
  async function command<K extends Command>(
    event: K,
    payload: Commands[K],
  ): Promise<Reply> {
    const socket = socketRef.current;
    if (!connected || !socket?.connected)
      return {
        ok: false,
        error: "Sin Conexión. Espera a reconectar.",
        code: "OFFLINE",
      };
    setError("");
    try {
      // Never buffer cash actions for a later connection. Every action has a bounded acknowledgement.
      const response = await new Promise<Reply>((resolve, reject) => {
        const emit = socket.timeout(8000).emit.bind(socket) as (
          event: K,
          payload: Commands[K],
          ack: (error: Error | null, result: Reply) => void,
        ) => void;
        emit(event, payload, (failure, result) =>
          failure ? reject(failure) : resolve(result),
        );
      });
      if (!response.ok) setError(response.error);
      return response;
    } catch {
      const message =
        "No recibimos confirmación. Reconecta y verifica antes de reintentar.";
      setError(message);
      return { ok: false, error: message, code: "ACK_TIMEOUT" };
    }
  }
  async function login(pin: string) {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("Sin Conexión.");
      return false;
    }
    setError("");
    try {
      const response = await socket
        .timeout(8000)
        .emitWithAck("staff_login", pin);
      if (!response.ok) {
        setError(response.error);
        return false;
      }
      writeStorage(tokenKey, response.token || "");
      socket.auth = { sessionId, token: response.token };
      return true;
    } catch {
      setError("No se pudo verificar el PIN. Intenta otra vez.");
      return false;
    }
  }
  function logout() {
    writeStorage(tokenKey, null);
    const socket = socketRef.current;
    if (socket) {
      socket.auth = { sessionId, token: "" };
      if (socket.connected) socket.emit("staff_logout", () => {});
      socket.disconnect().connect();
    }
    setSnapshot(null);
    setConnected(false);
  }
  return (
    <Context.Provider
      value={{
        snapshot,
        connected,
        sessionId,
        command,
        login,
        logout,
        error,
        clearError: () => setError(""),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useRealtime() {
  const value = useContext(Context);
  if (!value) throw new Error("RealtimeProvider required");
  return value;
}
