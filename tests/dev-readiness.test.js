"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { createServer } = require("node:http");
const path = require("node:path");
const { promisify } = require("node:util");

const run = promisify(execFile);
const root = path.join(__dirname, "..");
const version = require("../package.json").version;

test("dev launcher only reuses a matching service with all app pages ready", async (t) => {
  let reportedVersion = "older-version";
  let pageStatus = 200;
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/health") {
      response.end(
        JSON.stringify({
          service: "masaflow",
          version: reportedVersion,
          status: "ready",
        }),
      );
      return;
    }
    response.statusCode = pageStatus;
    response.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  t.after(() => server.close());
  const port = String(server.address().port);
  const launch = () =>
    run(process.execPath, ["scripts/dev.cjs"], {
      cwd: root,
      env: { ...process.env, PORT: port, MASAFLOW_STAFF_PIN: "1234" },
      timeout: 5000,
    });

  await assert.rejects(launch(), (error) => {
    assert.doesNotMatch(error.stdout, /ya se encuentra en ejecución y listo/);
    return true;
  });
  reportedVersion = version;
  pageStatus = 404;
  await assert.rejects(launch(), (error) => {
    assert.doesNotMatch(error.stdout, /ya se encuentra en ejecución y listo/);
    return true;
  });
  pageStatus = 200;
  const { stdout } = await launch();
  assert.match(stdout, /ya se encuentra en ejecución y listo/);
});
