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

test("staff can explicitly unlock chimes and accounting export remains available", () => {
  const sharedUi = fs.readFileSync(
    path.join(repo, "shared/ui/components.tsx"),
    "utf8",
  );
  assert.match(sharedUi, /export function AudioUnlockButton/);
  assert.match(sharedUi, /Iniciar turno · Activar timbre/);
  assert.match(sharedUi, /await audio\.resume\(\)/);
  assert.match(sharedUi, /No se pudo activar el timbre/);

  const analytics = fs.readFileSync(
    path.join(repo, "apps/analytics/src/content/realtime/Analytics.tsx"),
    "utf8",
  );
  assert.match(analytics, /Exportar historial/);
  assert.match(analytics, /text\/csv;charset=utf-8/);
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

/** Width and height of a PNG, read from its header (bytes 16-23), so no image library is needed. */
function pngSize(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString("latin1"), "PNG", `${file} is not a PNG`);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

test("the logo and every icon exist, are the size they claim, and are cached for offline use", () => {
  const publicFolder = path.join(repo, "shared/pwa");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(publicFolder, "manifest.webmanifest"), "utf8"),
  );
  assert.ok(manifest.icons.length >= 3);
  for (const icon of manifest.icons) {
    const file = path.join(publicFolder, icon.src);
    assert.ok(fs.existsSync(file), `${icon.src} is in the manifest but not on disk`);
    assert.equal(icon.type, "image/png");
    assert.equal(pngSize(file), icon.sizes, `${icon.src} is not ${icon.sizes}`);
  }
  assert.ok(manifest.icons.some((icon) => icon.purpose === "any" && icon.sizes === "512x512"));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512"));

  // Each app's favicon, the iPhone icon and the header logo point at real files.
  for (const app of ["client-web", "business-pos", "analytics"]) {
    const html = fs.readFileSync(path.join(repo, `apps/${app}/realtime.html`), "utf8");
    const favicon = html.match(/rel="icon" href="([^"]+)"/)?.[1];
    assert.ok(favicon && fs.existsSync(path.join(publicFolder, favicon)), `${app} favicon`);
    const touch = html.match(/rel="apple-touch-icon" href="\/assets\/([^"]+)"/)?.[1];
    assert.ok(touch && fs.existsSync(path.join(repo, "assets", touch)), `${app} apple-touch-icon`);
    assert.equal(pngSize(path.join(repo, "assets", touch)), "180x180");
  }
  assert.ok(fs.existsSync(path.join(publicFolder, "logo.png")));
  const components = fs.readFileSync(path.join(repo, "shared/ui/components.tsx"), "utf8");
  assert.match(components, /BASE_URL\}logo\.png/, "the Brand component must draw logo.png");

  // The service worker caches the logo up front, so the first offline visit still shows it.
  const worker = fs.readFileSync(path.join(publicFolder, "sw.js"), "utf8");
  for (const cached of ["logo.png", "favicon-32.png", "icon-192.png"]) {
    assert.match(worker, new RegExp(`"${cached.replace(".", "\\.")}"`), `${cached} not precached`);
    assert.ok(fs.existsSync(path.join(publicFolder, cached)));
  }
  // The picture the icons were built from stays in the repo, with the script that rebuilds them.
  assert.ok(fs.existsSync(path.join(repo, "docs/brand/mascot-source.jpg")));
  assert.ok(fs.existsSync(path.join(repo, "scripts/build-logo.swift")));
});

test("people read the restaurant's name, never the software's, on every screen", () => {
  const read = (file) => fs.readFileSync(path.join(repo, file), "utf8");
  // Folder names, env vars, storage keys and file names keep «masaflow» on purpose: renaming them would orphan
  // saved data. Only text a person reads is checked, so those identifiers are stripped first.
  const strip = (text) => text.replace(/masaflow[._-][\w.-]*/gi, "").replace(/MASAFLOW_\w+/g, "");
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(path.join(repo, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (/\.(tsx|ts|js)$/.test(entry.name)) files.push(relative);
    }
  };
  for (const directory of ["apps/client-web/src", "apps/business-pos/src", "apps/analytics/src/content/realtime", "shared/ui"])
    walk(directory);
  // brand.ts is the one file that explains why the old name survives in identifiers, so it names it.
  const offenders = files.filter(
    (file) => file !== path.join("shared/ui", "brand.ts") && /masaflow/i.test(strip(read(file))),
  );
  assert.deepEqual(offenders, [], "these files still show the software's name instead of the restaurant's");

  const manifest = JSON.parse(read("shared/pwa/manifest.webmanifest"));
  assert.equal(manifest.name, "Los Huaraches de Zapata");
  assert.equal(JSON.parse(read("assets/manifest.webmanifest")).name, manifest.name);
  assert.ok(manifest.short_name.length <= 13, "a home-screen label longer than 13 characters gets cut off");
  for (const [app, screen] of [["client-web", "Menú"], ["business-pos", "Cocina"], ["analytics", "Caja y ventas"]]) {
    const head = read(`apps/${app}/realtime.html`).split("</head>")[0];
    assert.ok(head.includes(`<title>Los Huaraches de Zapata · ${screen}</title>`), `${app} title`);
    assert.match(head, /apple-mobile-web-app-title" content="Los Huaraches"/);
    assert.doesNotMatch(head, /masaflow/i, `${app} head`);
  }
  assert.match(read("shared/ui/brand.ts"), /RESTAURANT_NAME = "Los Huaraches de Zapata"/);
  assert.match(read("shared/ui/components.tsx"), /De Zapata/, "the header wordmark");
});
