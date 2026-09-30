import React from "react";

import reviewedSnapshot from "./data.json";
import { DataAppRuntime } from "./DataAppRuntime.jsx";
import { DashboardContent } from "./content/dashboard/DashboardContent.jsx";
import { ReportContent } from "./content/report/ReportContent.jsx";
import { LiveAnalyticsProvider } from "./content/shared/analytics-live.tsx";

export function App({ hosted = globalThis.location?.hostname.endsWith(".chatgpt.site") ?? false } = {}) {
  return (
    <LiveAnalyticsProvider>{({ snapshot }) => <DataAppRuntime
      reviewedSnapshot={snapshot}
      DashboardContent={DashboardContent}
      ReportContent={ReportContent}
      hosted={hosted}
    />}</LiveAnalyticsProvider>
  );
}
