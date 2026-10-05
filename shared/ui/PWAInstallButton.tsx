import { useState } from "react";
import { Download, Smartphone, X } from "lucide-react";
import { usePWAInstall } from "./usePWAInstall";

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        onClick={() => void install()}
        className="btn border-clay-300 bg-clay-50 text-clay-700 hover:bg-clay-100"
        title="Instalar aplicación en dispositivo"
      >
        <Download size={15} />
        <span>Instalar App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="btn border-clay-300 bg-clay-50 text-clay-700 hover:bg-clay-100"
          title="Instalar aplicación en iPad o iPhone"
        >
          <Smartphone size={15} />
          <span>Instalar en iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3">
                <h3 className="text-lg font-bold">Instalar en iPhone / iPad</h3>
                <button
                  className="p-1 text-stone-400 hover:text-stone-700"
                  onClick={() => setShowIOSGuide(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <p className="mt-2 text-sm text-stone-600">
                Para usar MasaFlow en modo Kiosko sin barras del navegador:
              </p>
              <ol className="mt-3 list-decimal pl-5 text-sm text-stone-700 space-y-1.5">
                <li>
                  Toca el botón <strong>Compartir</strong> en Safari.
                </li>
                <li>
                  Desliza hacia abajo y selecciona{" "}
                  <strong>Agregar al inicio</strong>.
                </li>
              </ol>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="btn btn-primary mt-5 w-full"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
