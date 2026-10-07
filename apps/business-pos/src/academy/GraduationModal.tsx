import { useEffect } from "react";
import {
  Award,
  CheckCircle2,
  ChefHat,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Flame,
  RotateCcw,
} from "lucide-react";
import { burstConfetti } from "../confetti";

interface GraduationModalProps {
  isOpen: boolean;
  onGraduateAndGoLive: () => void;
  onRepeatTraining: () => void;
}

export function GraduationModal({
  isOpen,
  onGraduateAndGoLive,
  onRepeatTraining,
}: GraduationModalProps) {
  useEffect(() => {
    if (isOpen) {
      burstConfetti();
      const timer1 = setTimeout(burstConfetti, 400);
      const timer2 = setTimeout(burstConfetti, 800);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const badges = [
    {
      icon: ChefHat,
      title: "Flujo de Oro",
      desc: "Dominio de comanda: Aceptar, Cocinar y Cobrar al entregar.",
    },
    {
      icon: ShieldCheck,
      title: "Guardián de Alergias",
      desc: "Reconocimiento y confirmación táctil de restricciones críticas.",
    },
    {
      icon: RotateCcw,
      title: "Maestro del Deshacer",
      desc: "Salvamento de caja en ventana de 5 segundos y gestión de No-Shows.",
    },
    {
      icon: Flame,
      title: "Calma en la Tormenta",
      desc: "Corte de platillos agotados (86) y activación del botón de pánico.",
    },
    {
      icon: Award,
      title: "Arqueo Impecable",
      desc: "Cierre de turno ciego cuadrado al centavo ($555.00 MXN).",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl rounded-3xl border-4 border-yellow-400 bg-stone-900 text-white shadow-[0_0_60px_rgba(250,204,21,0.35)] overflow-hidden">
        {/* Top gold header banner */}
        <div className="bg-linear-to-r from-yellow-500 via-amber-400 to-yellow-500 p-6 text-center text-stone-950">
          <div className="mx-auto flex size-20 items-center justify-center rounded-3xl bg-stone-950 text-yellow-400 shadow-2xl mb-3 animate-bounce">
            <Award className="size-12 stroke-[2.5]" />
          </div>
          <span className="inline-block rounded-full bg-stone-950/20 px-4 py-1 text-xs font-black uppercase tracking-wider text-stone-900">
            Certificación Oficial MasaFlow POS
          </span>
          <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
            ¡Felicidades, Taquero Experto!
          </h2>
          <p className="mt-1 text-sm font-bold text-stone-900/90 max-w-md mx-auto">
            Has completado con éxito el 100% del currículo interactivo. Estás listo para operar la caja y la cocina en vivo con máxima velocidad y cero errores.
          </p>
        </div>

        {/* Badges Earned */}
        <div className="p-6 space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-yellow-400 flex items-center gap-2">
            <Sparkles className="size-4" />
            Habilidades y Credenciales Adquiridas
          </h3>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {badges.map((b, i) => {
              const Icon = b.icon;
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-2xl bg-stone-950/80 p-3 border border-stone-800"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-yellow-400/20 text-yellow-400 border border-yellow-400/30">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      {b.title}
                      <CheckCircle2 className="size-3 text-emerald-400" />
                    </h4>
                    <p className="text-[11px] text-stone-400 leading-tight mt-0.5">
                      {b.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="pt-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              data-tour-allow="graduate"
              onClick={onGraduateAndGoLive}
              className="btn btn-primary flex-1 py-4 text-base font-black shadow-xl flex items-center justify-center gap-2 group"
            >
              <span>Entrar a la Caja Real (En Vivo)</span>
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
            </button>
            <button
              type="button"
              data-tour-allow="repeat"
              onClick={onRepeatTraining}
              className="btn btn-secondary py-4 text-sm font-bold flex items-center justify-center gap-1.5 text-stone-300"
            >
              <RotateCcw className="size-4" />
              Repetir Práctica
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
