#!/usr/bin/env node
"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");
const net = require("node:net");
const root = path.join(__dirname, "..");
const serviceVersion = require("../package.json").version;
process.chdir(root);
try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const backendPort = Number(
  process.env.PORT && process.env.PORT !== "8080" ? process.env.PORT : 3000,
);
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
async function checkExistingMasaFlow(port) {
  try {
    const [healthResponse, ...pages] = await Promise.all(
      ["/api/health", "/order/", "/pos/", "/analytics/"].map((route) =>
        fetch(`http://127.0.0.1:${port}${route}`, {
          signal: AbortSignal.timeout(1000),
        }),
      ),
    );
    const health = healthResponse.ok ? await healthResponse.json() : null;
    return (
      health?.service === "masaflow" &&
      health.version === serviceVersion &&
      health.status === "ready" &&
      pages.every((page) => page.ok)
    );
  } catch {
    /* No active MasaFlow instance responding */
  }
  return false;
}
async function main() {
  if (!/^\d{4}$/.test(process.env.MASAFLOW_STAFF_PIN || ""))
    throw new Error("Configura MASAFLOW_STAFF_PIN en .env (4 dígitos).");
  if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65535)
    throw new Error("PORT debe ser un puerto válido.");
  try {
    await available(backendPort);
  } catch (error) {
    if (await checkExistingMasaFlow(backendPort)) {
      console.log(
        `\nMasaFlow ya se encuentra en ejecución y listo en el puerto ${backendPort}.\nPOS: http://localhost:${backendPort}/pos/\nMenú: http://localhost:${backendPort}/order/\nCaja: http://localhost:${backendPort}/analytics/`,
      );
      if (process.argv.includes("--open") && process.platform === "darwin") {
        spawn("open", [`http://localhost:${backendPort}/pos/`], {
          stdio: "ignore",
        }).on("error", (openErr) =>
          console.error(`Abre el POS manualmente: ${openErr.message}`),
        );
      }
      return;
    }
    throw error;
  }
  const children = [],
    rootEnv = { ...process.env, PORT: String(backendPort) };
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
  const build = () =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.platform === "win32" ? "npm.cmd" : "npm",
        ["run", "build"],
        {
          cwd: root,
          env: rootEnv,
          stdio: "inherit",
        },
      );
      children.push(child);
      child.once("error", reject);
      child.once("exit", (code) => {
        children.splice(children.indexOf(child), 1);
        if (stopping) return reject(new Error("Inicio cancelado."));
        if (code !== 0)
          return reject(new Error("No se pudieron compilar las aplicaciones."));
        resolve();
      });
    });
  await build();
  const child = spawn(process.execPath, ["server.js"], {
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
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    try {
      if (await checkExistingMasaFlow(backendPort)) {
        let networkDetails = "";
        try {
          const netResponse = await fetch(
            `http://127.0.0.1:${backendPort}/api/network`,
            { signal: AbortSignal.timeout(1000) },
          );
          if (netResponse.ok) {
            const netData = await netResponse.json();
            networkDetails = `\nBonjour: ${netData.urls.bonjour}/pos/\nmDNS: ${netData.urls.mdns}/pos/\nRed LAN: ${netData.urls.lan}/pos/`;
          }
        } catch {
          /* non-blocking telemetry */
        }
        console.log(
          `\nMasaFlow listo. Mantén esta ventana abierta. Ctrl+C cierra el servicio.\nPOS: http://localhost:${backendPort}/pos/${networkDetails}\nMenú: http://localhost:${backendPort}/order/\nCaja: http://localhost:${backendPort}/analytics/`,
        );
        if (process.argv.includes("--open") && process.platform === "darwin")
          spawn("open", [`http://localhost:${backendPort}/pos/`], {
            stdio: "ignore",
          }).on("error", (error) =>
            console.error(`Abre el POS manualmente: ${error.message}`),
          );
        return;
      }
    } catch {
      /* Wait for the backend and all compiled apps to become ready. */
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
