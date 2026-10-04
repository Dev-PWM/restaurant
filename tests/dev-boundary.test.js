"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Vite serves the three apps but rejects ledger and archive requests, including raw imports", async (t) => {
  const { createServer } = await import("vite");
  const repo = path.resolve(__dirname, "..");
  const directory = fs.mkdtempSync(
    path.join(repo, "apps/client-web/.masaflow-test-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const name of ["data.json", "state.json", "archive_test.json"])
    fs.writeFileSync(
      path.join(directory, name),
      '{"private":"ledger sentinel"}',
    );
  for (const mode of ["client-web", "business-pos", "analytics"]) {
    const server = await createServer({
      configFile: path.join(repo, "vite.realtime.config.mts"),
      mode,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, open: false },
    });
    try {
      await server.listen();
      const base = `http://127.0.0.1:${server.httpServer.address().port}`;
      assert.equal((await fetch(`${base}/realtime.html`)).status, 200);
      assert.equal(
        (await fetch(`${base}/@fs/${repo}/shared/ui/RealtimeProvider.tsx`))
          .status,
        200,
      );
      for (const name of ["data.json", "state.json", "archive_test.json"]) {
        for (const suffix of ["", "?raw", "?import", "?url"]) {
          const response = await fetch(
            `${base}/@fs/${directory}/${name}${suffix}`,
          );
          assert.ok(
            [403, 404].includes(response.status),
            `${mode}: ${name}${suffix} must be denied`,
          );
          assert.ok(!(await response.text()).includes("ledger sentinel"));
        }
      }
      assert.equal(
        (await fetch(`${base}/@fs/${repo}/shared/realtime/engine.js`)).status,
        403,
      );
    } finally {
      await server.close();
    }
  }
});
