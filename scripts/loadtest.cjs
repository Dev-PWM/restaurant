#!/usr/bin/env node
"use strict";
/**
 * Stress profile for MasaFlow, run against a DISPOSABLE server it starts itself
 * (temp data directory, random PIN) so test orders can never reach the real ledger.
 *
 *   npm run loadtest                 both parts
 *   npm run loadtest -- --only=assets    static delivery spike + socket latency probe (autocannon)
 *   npm run loadtest -- --only=sockets   50 phones + POS cashier over Socket.io (Artillery)
 *
 * Attach to an existing throwaway server instead:
 *   MASAFLOW_STAFF_PIN=xxxx npm run loadtest -- --target=http://127.0.0.1:3999 --disposable
 */
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const autocannon = require("autocannon");
const { io } = require("socket.io-client");
const { createService } = require("../server.js");

const root = path.join(__dirname, "..");
/** The release the thresholds were calibrated on; bump it deliberately. */
const ARTILLERY_VERSION = "2.0.34";
const flags = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const only = flags.only || "all";
const LIMITS = {
  /** Slowest acceptable realtime ack while a static-asset spike is running. */
  probeMaxMs: Number(process.env.PROBE_MAX_MS || 500),
  latencyP99Ms: Number(process.env.LATENCY_P99_MS || 1000),
};
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  ];
};

/** Keeps asking for a fresh snapshot (an ack-ed event) and records the round trip. */
function startProbe(target) {
  const samples = [];
  let timeouts = 0;
  const socket = io(target, {
    auth: { sessionId: crypto.randomUUID(), token: "" },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
  // request_init is limited to 60/minute per socket, so one sample per second is safe.
  const timer = setInterval(async () => {
    if (!socket.connected) return;
    const started = performance.now();
    try {
      await socket.timeout(5000).emitWithAck("request_init");
      samples.push(performance.now() - started);
    } catch {
      timeouts++;
    }
  }, 1000);
  return () => {
    clearInterval(timer);
    socket.close();
    return { samples, timeouts };
  };
}

async function profileAssets(target) {
  const html = await (await fetch(`${target}/order/`)).text();
  const script = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  const requests = [
    { method: "GET", path: "/api/health" },
    { method: "GET", path: "/order/" },
    { method: "GET", path: "/pos/" },
    ...(script
      ? [{ method: "GET", path: new URL(script, `${target}/order/`).pathname }]
      : []),
  ];
  const failures = [];
  for (const [name, connections, duration] of [
    ["baseline", 10, 5],
    ["spike", 200, 15],
  ]) {
    const stopProbe = name === "spike" ? startProbe(target) : null;
    const result = await autocannon({
      url: target,
      connections,
      duration,
      workers: 2,
      timeout: 10,
      requests,
    });
    const probe = stopProbe?.();
    const bad = result.errors + result.timeouts + result.non2xx;
    console.log(
      `${name.padEnd(8)} c=${String(connections).padEnd(3)} ${Math.round(result.requests.average)} req/s  ` +
        `p99 ${result.latency.p99} ms  max ${result.latency.max} ms  errors ${result.errors}  timeouts ${result.timeouts}  non-2xx ${result.non2xx}`,
    );
    if (bad) failures.push(`${name}: ${bad} failed requests`);
    if (result.latency.p99 > LIMITS.latencyP99Ms)
      failures.push(
        `${name}: p99 ${result.latency.p99} ms > ${LIMITS.latencyP99Ms} ms`,
      );
    if (probe) {
      const max = Math.round(Math.max(0, ...probe.samples));
      console.log(
        `         socket ack during spike: ${probe.samples.length} samples, p95 ${Math.round(percentile(probe.samples, 95))} ms, max ${max} ms, timeouts ${probe.timeouts}`,
      );
      if (probe.timeouts)
        failures.push(
          `socket acks timed out ${probe.timeouts}x during the spike`,
        );
      if (max > LIMITS.probeMaxMs)
        failures.push(
          `socket ack max ${max} ms > ${LIMITS.probeMaxMs} ms during the spike`,
        );
      if (!probe.samples.length)
        failures.push("socket probe collected no samples");
    }
  }
  return failures;
}

function runArtillery(target, pin) {
  return new Promise((resolve) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      [
        "--yes",
        `artillery@${ARTILLERY_VERSION}`,
        "run",
        "artillery/masaflow.yml",
      ],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          LOADTEST_TARGET: target,
          MASAFLOW_STAFF_PIN: pin,
        },
      },
    );
    child.on("error", (error) =>
      resolve([`could not start artillery: ${error.message}`]),
    );
    child.on("exit", (code) =>
      resolve(
        code === 0
          ? []
          : [`artillery exited with code ${code} (thresholds or errors)`],
      ),
    );
  });
}

async function main() {
  for (const app of ["client-web", "business-pos"])
    if (!fs.existsSync(path.join(root, "apps", app, "dist-realtime")))
      throw new Error("Ejecuta npm run build antes de la prueba de carga.");
  let service;
  let directory;
  let target = flags.target;
  let pin = process.env.MASAFLOW_STAFF_PIN || "";
  if (target) {
    if (flags.disposable !== "true")
      throw new Error(
        "--target requires --disposable: the test creates and pays fake orders.",
      );
    if (!pin) throw new Error("Set MASAFLOW_STAFF_PIN for the target server.");
  } else {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-loadtest-"));
    pin = String(1000 + crypto.randomInt(9000));
    service = await createService({ dataDirectory: directory, pin });
    await new Promise((resolve) =>
      service.server.listen(
        Number(process.env.LOADTEST_PORT || 0),
        "127.0.0.1",
        resolve,
      ),
    );
    target = `http://127.0.0.1:${service.server.address().port}`;
    console.log(`Disposable server on ${target} (data in ${directory})`);
  }
  const failures = [];
  try {
    if (only === "all" || only === "assets") {
      console.log("\n== Static delivery: baseline vs spike ==");
      failures.push(...(await profileAssets(target)));
    }
    if (only === "all" || only === "sockets") {
      console.log("\n== Socket.io: 50 phones + POS cashier ==");
      failures.push(...(await runArtillery(target, pin)));
    }
  } finally {
    if (service) await service.close();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log(
    failures.length ? `\nFAILED\n - ${failures.join("\n - ")}` : "\nPASSED",
  );
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
