import { createRoot } from "react-dom/client";
import { RealtimeProvider } from "../../../../../shared/ui/RealtimeProvider";
import {
  ConnectionBanner,
  PinGate,
  PWAServiceWorker,
} from "../../../../../shared/ui/components";
import { AppCrashBoundary } from "../../../../../shared/ui/AppCrashBoundary";
import { installTranslationGuard } from "../../../../../shared/ui/translation-guard";
import { Analytics } from "./Analytics";
import "../../../../../shared/ui/styles.css";
installTranslationGuard();
createRoot(document.getElementById("root")!).render(
  <RealtimeProvider staff>
    <PWAServiceWorker />
    <ConnectionBanner />
    <PinGate>
      <AppCrashBoundary>
        <Analytics />
      </AppCrashBoundary>
    </PinGate>
  </RealtimeProvider>,
);
