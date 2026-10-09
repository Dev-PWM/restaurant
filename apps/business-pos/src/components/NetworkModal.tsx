import { memo, useState, useEffect, useRef } from "react";
import { Radio, QrCode, Copy, Check, ExternalLink, Wifi, ShieldCheck, Laptop } from "lucide-react";
import { Modal } from "../../../../shared/ui/components";

export interface NetworkInfo {
  service: string;
  version: string;
  restaurant: string;
  port: number;
  bonjourHost: string;
  primaryIp: string;
  hostnames: {
    bonjour: string;
    mdns: string;
    lan: string;
  };
  urls: {
    bonjour: string;
    mdns: string;
    lan: string;
    localhost: string;
    pos: string;
    order: string;
    analytics: string;
  };
  interfaces: { name: string; address: string; internal: boolean }[];
  active: boolean;
}

export interface NetworkModalProps {
  onClose: () => void;
  simulator?: boolean;
}

type TargetTab = "order" | "pos" | "analytics";

export const NetworkModal = memo(function NetworkModal({
  onClose,
  simulator = false,
}: NetworkModalProps) {
  const [target, setTarget] = useState<TargetTab>("order");
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchInfo() {
      try {
        const res = await fetch("/api/network");
        if (!res.ok) throw new Error("Network API unavailable");
        const data = (await res.json()) as NetworkInfo;
        if (!cancelled) {
          setNetworkInfo(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          // Fallback gracefully using current browser origin
          const host = window.location.hostname || "localhost";
          const port = Number(window.location.port) || 3000;
          const origin = window.location.origin || `http://localhost:${port}`;
          setNetworkInfo({
            service: "masaflow.service",
            version: "0.3.0",
            restaurant: "Los Huaraches de Zapata",
            port,
            bonjourHost: host.replace(/\.local$/i, ""),
            primaryIp: host,
            hostnames: {
              bonjour: host.endsWith(".local") ? host : `${host}.local`,
              mdns: "masaflow.local",
              lan: host,
            },
            urls: {
              bonjour: `${origin}`,
              mdns: `http://masaflow.local:${port}`,
              lan: `${origin}`,
              localhost: `http://localhost:${port}`,
              pos: `${origin}/pos/`,
              order: `${origin}/order/`,
              analytics: `${origin}/analytics/`,
            },
            interfaces: [{ name: "en0", address: host, internal: false }],
            active: true,
          });
          setLoading(false);
        }
      }
    }

    void fetchInfo();
    return () => {
      cancelled = true;
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = async (text: string, key: string) => {
    if (!navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedKey(null);
        copyTimerRef.current = null;
      }, 2500);
    } catch {}
  };

  const getTargetUrl = (type: "bonjour" | "mdns" | "lan") => {
    if (!networkInfo) return "";
    const port = networkInfo.port;
    const path = target === "order" ? "/order/" : target === "pos" ? "/pos/" : "/analytics/";
    if (type === "bonjour") return `http://${networkInfo.hostnames.bonjour}:${port}${path}`;
    if (type === "mdns") return `http://${networkInfo.hostnames.mdns}:${port}${path}`;
    return `http://${networkInfo.primaryIp}:${port}${path}`;
  };

  const qrSrc = `/api/network/qr?target=${target}&_t=${target}`;

  return (
    <Modal
      title="Conectar Dispositivos · Red Local"
      onClose={onClose}
      layer={simulator ? "inline" : "native"}
    >
      <div className="space-y-5 text-stone-900">
        {/* Header banner */}
        <div className="flex items-center gap-3 border-b border-stone-200 pb-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs">
            <Radio className="size-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-black tracking-tight text-stone-900">
              Cero Configuración (Zero-Config)
            </h3>
            <p className="text-xs font-semibold text-stone-500">
              Bonjour & Multicast DNS · Sin IP estática requerida
            </p>
          </div>
        </div>

        {/* Status card */}
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs text-emerald-950 font-semibold">
          <ShieldCheck className="size-5 shrink-0 text-emerald-600" />
          <span>
            El servidor local anuncia su presencia. Cualquier tablet, comanda o
            teléfono en la misma red Wi-Fi se enlaza al instante sin reconfigurar routers.
          </span>
        </div>

        {/* Target Switcher */}
        <div className="flex rounded-xl bg-stone-100 p-1 border border-stone-200">
          <button
            type="button"
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
              target === "order"
                ? "bg-white text-stone-950 shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
            onClick={() => setTarget("order")}
          >
            Menú Clientes (/order/)
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
              target === "pos"
                ? "bg-white text-stone-950 shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
            onClick={() => setTarget("pos")}
          >
            Punto de Venta (/pos/)
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
              target === "analytics"
                ? "bg-white text-stone-950 shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
            onClick={() => setTarget("analytics")}
          >
            Caja (/analytics/)
          </button>
        </div>

        {/* QR Code and Instructions */}
        <div className="flex flex-col sm:flex-row items-center gap-5 rounded-2xl border border-stone-200 bg-stone-50/60 p-4">
          <div className="relative flex size-44 shrink-0 items-center justify-center rounded-xl border-2 border-stone-300 bg-white p-2 shadow-xs">
            {loading ? (
              <div className="flex flex-col items-center gap-2 text-xs text-stone-400">
                <QrCode className="size-8 animate-pulse text-stone-300" />
                <span>Generando QR…</span>
              </div>
            ) : (
              <img
                src={qrSrc}
                alt={`Código QR para ${target}`}
                className="size-full object-contain"
                width={160}
                height={160}
              />
            )}
          </div>
          <div className="space-y-2 text-center sm:text-left">
            <h4 className="text-sm font-black text-stone-900">
              {target === "order"
                ? "Escanea para ordenar o ver el menú"
                : target === "pos"
                  ? "Escanea para abrir cocina o caja en otra tablet"
                  : "Escanea para monitorear métricas y corte de caja"}
            </h4>
            <p className="text-xs text-stone-600 leading-relaxed">
              Apunta la cámara de un iPhone, iPad o Android conectado a la misma red Wi-Fi para
              abrir la pantalla del restaurante de inmediato sin escribir direcciones complejas.
            </p>
            <div className="pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-800 border border-teal-200">
                <Wifi className="size-3" /> Red Wi-Fi del restaurante
              </span>
            </div>
          </div>
        </div>

        {/* Connection URLs list */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-black uppercase tracking-wider text-stone-500">
            Direcciones de enlace directo
          </h4>

          {/* Bonjour URL */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-stone-600">
                  Apple Bonjour
                </span>
                <span className="text-xs font-semibold text-stone-400">Recomendado para iPad / Mac</span>
              </div>
              <p className="mt-1 truncate font-mono text-xs font-bold text-stone-900">
                {getTargetUrl("bonjour")}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => handleCopy(getTargetUrl("bonjour"), "bonjour")}
                title="Copiar enlace"
              >
                {copiedKey === "bonjour" ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copiedKey === "bonjour" ? "¡Copiado!" : "Copiar"}</span>
              </button>
            </div>
          </div>

          {/* Multicast DNS URL */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-stone-600">
                  mDNS Estándar
                </span>
                <span className="text-xs font-semibold text-stone-400">Cualquier sistema mDNS</span>
              </div>
              <p className="mt-1 truncate font-mono text-xs font-bold text-stone-900">
                {getTargetUrl("mdns")}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => handleCopy(getTargetUrl("mdns"), "mdns")}
                title="Copiar enlace"
              >
                {copiedKey === "mdns" ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copiedKey === "mdns" ? "¡Copiado!" : "Copiar"}</span>
              </button>
            </div>
          </div>

          {/* LAN IP URL */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-stone-600">
                  IP LAN
                </span>
                <span className="text-xs font-semibold text-stone-400">Respaldo directo</span>
              </div>
              <p className="mt-1 truncate font-mono text-xs font-bold text-stone-900">
                {getTargetUrl("lan")}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => handleCopy(getTargetUrl("lan"), "lan")}
                title="Copiar enlace"
              >
                {copiedKey === "lan" ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copiedKey === "lan" ? "¡Copiado!" : "Copiar"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Network Hardware Details */}
        {networkInfo && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-stone-200 pt-3 text-[11px] text-stone-600">
            <div>
              <span className="block font-medium text-stone-400">Host Bonjour</span>
              <strong className="font-mono text-stone-800">{networkInfo.bonjourHost}</strong>
            </div>
            <div>
              <span className="block font-medium text-stone-400">IP Primaria</span>
              <strong className="font-mono text-stone-800">{networkInfo.primaryIp}</strong>
            </div>
            <div>
              <span className="block font-medium text-stone-400">Puerto Servidor</span>
              <strong className="font-mono text-stone-800">{networkInfo.port}</strong>
            </div>
            <div>
              <span className="block font-medium text-stone-400">Adaptador</span>
              <strong className="font-mono text-stone-800">{networkInfo.interfaces[0]?.name || "en0"}</strong>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
});
