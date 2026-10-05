import { createRoot } from "react-dom/client";
import { RealtimeProvider } from "../../../shared/ui/RealtimeProvider";
import {
  ConnectionBanner,
  PinGate,
  PWAServiceWorker,
} from "../../../shared/ui/components";
import { LiveOrders } from "./pages/LiveOrders";
import "../../../shared/ui/styles.css";
createRoot(document.getElementById("root")!).render(
  <RealtimeProvider staff>
    <PWAServiceWorker />
    <ConnectionBanner />
    <PinGate>
      <LiveOrders />
    </PinGate>
  </RealtimeProvider>,
);
