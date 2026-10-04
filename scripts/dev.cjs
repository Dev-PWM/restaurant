#!/usr/bin/env node
"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");
const net = require("node:net");
const root = path.join(__dirname, "..");
process.chdir(root);
try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const backendPort = Number(process.env.PORT || 3000);
async function available(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () =>
      reject(
        new Error(
          `Puerto ${port} ocupado. No se detuvo ningún proceso. Cierra la otra instancia o cambia PORT.`,
        ),
      ),
    );
    probe.listen(port, "0.0.0.0", () => probe.close(resolve));
  });
}
async function main() {
  if (!/^\d{4}$/.test(process.env.MASAFLOW_STAFF_PIN || ""))
    throw new Error("Configura MASAFLOW_STAFF_PIN en .env (4 dígitos).");
  if (
    !Number.isInteger(backendPort) ||
    backendPort < 1 ||
    backendPort > 65535 ||
    [5173, 5174, 5175].includes(backendPort)
  )
    throw new Error(
      "PORT debe ser un puerto válido distinto de 5173, 5174 y 5175.",
    );
  await Promise.all([backendPort, 5173, 5174, 5175].map(available));
  const children = [],
    rootEnv = { ...process.env };
  let stopping = false;
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const child of children) child.kill("SIGTERM");
    const timer = setTimeout(() => {
      for (const child of children)
        if (child.exitCode === null) child.kill("SIGKILL");
    }, 5000);
    timer.unref();
  }
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.once(signal, () => stop());
  const launch = (args) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: rootEnv,
      stdio: "inherit",
    });
    children.push(child);
    child.once("error", (error) => {
      console.error(error.message);
      stop(1);
    });
    child.once("exit", (code) => {
      if (!stopping) stop(code || 1);
    });
  };
  launch(["server.js"]);
  for (const workspace of ["client-web", "business-pos", "analytics"])
    launch([
      "node_modules/vite/bin/vite.js",
      "--config",
      "vite.realtime.config.mts",
      "--mode",
      workspace,
    ]);
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    try {
      const results = await Promise.all(
        [
          `http://127.0.0.1:${backendPort}/api/health`,
          ...[5173, 5174, 5175].map(
            (port) => `http://127.0.0.1:${port}/realtime.html`,
          ),
        ].map((url) => fetch(url, { signal: AbortSignal.timeout(1000) })),
      );
      if (results.every((result) => result.ok)) {
        console.log(
          "\nMasaFlow listo. Mantén esta ventana abierta. Ctrl+C cierra todos los servicios.\nPOS: http://localhost:5174/realtime.html\nMenú: http://localhost:5173/realtime.html\nCaja: http://localhost:5175/realtime.html",
        );
        if (process.argv.includes("--open") && process.platform === "darwin")
          spawn("open", ["http://localhost:5174/realtime.html"], {
            stdio: "ignore",
          }).on("error", (error) =>
            console.error(`Abre el POS manualmente: ${error.message}`),
          );
        return;
      }
    } catch {
      /* Wait for all four owned processes to become ready. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!stopping) {
    console.error("Los servicios no iniciaron a tiempo.");
    stop(1);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
