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
