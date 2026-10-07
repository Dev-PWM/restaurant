import { AlertTriangle } from "lucide-react";

export function ShadowWarningToast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-3 rounded-2xl border-2 border-red-600 bg-red-600 px-5 py-3 text-white shadow-2xl animate-shake"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-300" />
      <span className="text-sm font-bold tracking-wide">{message}</span>
    </div>
  );
}
