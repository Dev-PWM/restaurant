import { createRoot } from "react-dom/client";
import { RealtimeProvider } from "../../../shared/ui/RealtimeProvider";
import { ConnectionBanner } from "../../../shared/ui/components";
import { Menu } from "./pages/Menu";
import "../../../shared/ui/styles.css";
createRoot(document.getElementById("root")!).render(
  <RealtimeProvider>
    <ConnectionBanner />
    <Menu />
  </RealtimeProvider>,
);
