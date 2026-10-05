import { createRoot } from "react-dom/client";
import { RealtimeProvider } from "../../../../../shared/ui/RealtimeProvider";
import {
  ConnectionBanner,
  PinGate,
  PWAServiceWorker,
} from "../../../../../shared/ui/components";
import { Analytics } from "./Analytics";
import "../../../../../shared/ui/styles.css";
createRoot(document.getElementById("root")!).render(
  <RealtimeProvider staff>
    <PWAServiceWorker />
    <ConnectionBanner />
    <PinGate>
      <Analytics />
    </PinGate>
  </RealtimeProvider>,
);
