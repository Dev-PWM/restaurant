"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "..");

test("realtime apps expose an installable, scoped offline app shell", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repo, "shared/pwa/manifest.webmanifest"), "utf8"),
  );
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.ok(manifest.icons.some((icon) => icon.purpose.includes("maskable")));

  for (const app of ["client-web", "business-pos", "analytics"]) {
    const html = fs.readFileSync(
      path.join(repo, `apps/${app}/realtime.html`),
      "utf8",
    );
    assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
    assert.match(html, /viewport-fit=cover/);
  }

  const worker = fs.readFileSync(path.join(repo, "shared/pwa/sw.js"), "utf8");
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/socket\.io\/"\)/);
});

test("quick UI feedback animations stay brief and honor reduced motion", () => {
  const styles = fs.readFileSync(
    path.join(repo, "shared/ui/styles.css"),
    "utf8",
  );
  for (const duration of [200, 260, 280]) {
    assert.match(styles, new RegExp(`animation:[^;]+ ${duration}ms`));
  }
  assert.match(styles, /prefers-reduced-motion: reduce/);

  const pos = fs.readFileSync(
    path.join(repo, "apps/business-pos/src/pages/LiveOrders.tsx"),
    "utf8",
  );
  assert.match(pos, /duration: 220/);
  assert.match(pos, /function TicketSkeleton/);
  assert.match(pos, /card\.animate/);
  assert.doesNotMatch(pos, /BatchingView|Lotes de Cocina|Agrupar por/);

  const customer = fs.readFileSync(
    path.join(repo, "apps/client-web/src/pages/OrderStatus.tsx"),
    "utf8",
  );
  assert.match(customer, /animate-ready-rise/);
  assert.doesNotMatch(customer, /duration-1000/);
});

test("digital order tracking and pickup payment contain no print controls", () => {
  const files = [
    "apps/business-pos/src/pages/LiveOrders.tsx",
    "apps/client-web/src/pages/OrderStatus.tsx",
    "apps/analytics/src/content/realtime/Analytics.tsx",
    "shared/ui/components.tsx",
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(repo, file), "utf8");
    assert.doesNotMatch(
      source,
      /printThermalTicket|thermalPrint|window\.print/,
    );
  }
  const analytics = fs.readFileSync(
    path.join(repo, "apps/analytics/src/content/realtime/Analytics.tsx"),
    "utf8",
  );
  assert.match(analytics, /Ventas cobradas · MXN/);
  assert.match(analytics, /Recibido/);
  assert.match(analytics, /Cambio/);
  assert.doesNotMatch(analytics, /Efectivo en caja/);
  assert.doesNotMatch(analytics, /DenominationCounter|Arqueo de gaveta/);
  const engine = fs.readFileSync(
    path.join(repo, "shared/realtime/engine.js"),
    "utf8",
  );
  assert.match(engine, /status: "review"/);
  assert.match(engine, /order\.status === "ready"/);
});
