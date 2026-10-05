// @ts-check
"use strict";
const express = require("express");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { isIP } = require("node:net");
const { Server } = require("socket.io");
const realtime = require("./shared/realtime/engine.js");
const { createEngine, UUID } = realtime;
/** @type {typeof import("./shared/realtime/engine.js").ensure} */
const ensure = realtime.ensure;
const { acquireLock } = require("./shared/realtime/lock.js");
/** @typedef {import('./shared/types/realtime').Snapshot} Snapshot */
/** @typedef {import('./shared/types/realtime').Command} Command */
/** @typedef {import('./shared/types/realtime').Reply} Reply */
/** @typedef {{sessionId: string, token: string}} SocketData */
/** @typedef {import('socket.io').Socket<import('./shared/types/realtime').ClientToServerEvents, import('./shared/types/realtime').ServerToClientEvents, Record<string, never>, SocketData>} AppSocket */
/** Trust only the final forwarded hop appended by our loopback Vite proxy.
 * @param {string} peer @param {string | string[] | undefined} forwarded */
function clientAddress(peer, forwarded) {
  if (
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer) ||
    typeof forwarded !== "string"
  )
    return peer;
  const address = forwarded.split(",").at(-1)?.trim() || "";
  return isIP(address) ? address : peer;
}
/** @param {{dataDirectory?: string, pin?: string, sessionMs?: number}} [options] */
async function createService(options = {}) {
  const dataDirectory =
    options.dataDirectory ||
    process.env.MASAFLOW_DATA_DIR ||
    path.join(__dirname, ".masaflow-realtime");
  const pin =
    options.pin !== undefined
      ? options.pin
      : process.env.MASAFLOW_STAFF_PIN || "1234";
  const sessionMs = options.sessionMs ?? 12 * 60 * 60 * 1000;
  ensure(
    /^\d{4}$/.test(pin),
    "Configura MASAFLOW_STAFF_PIN con 4 dígitos antes de iniciar.",
  );
  const release = await acquireLock(dataDirectory);
  try {
    const engine = createEngine({ directory: dataDirectory });
    const app = express();
    app.disable("x-powered-by");
    app.use((_req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      next();
    });
    const server = http.createServer(app);
    /** @type {Server<import('./shared/types/realtime').ClientToServerEvents, import('./shared/types/realtime').ServerToClientEvents, Record<string, never>, SocketData>} */
    const io = new Server(server, {
      cors: { origin: "*" },
      maxHttpBufferSize: 65536,
    });
    /** @type {Map<string, number>} */
    const sessions = new Map();
    /** @type {Map<string, {count: number, until: number}>} */
    const limits = new Map();
    const pinHash = crypto.createHash("sha256").update(pin).digest();
    /** @param {string} key @param {number} count @param {number} duration */
    function limit(key, count, duration) {
      const at = Date.now();
      for (const [id, value] of limits)
        if (value.until <= at) limits.delete(id);
      const value = limits.get(key) || { count: 0, until: at + duration };
      ensure(
        limits.size < 5000 || limits.has(key),
        "Intenta más tarde.",
        "RATE_LIMITED",
      );
      value.count++;
      limits.set(key, value);
      ensure(
        value.count <= count,
        "Demasiados intentos. Intenta más tarde.",
        "RATE_LIMITED",
      );
    }
    /** @param {AppSocket} socket */
    function staff(socket) {
      return (sessions.get(socket.data.token) || 0) > Date.now();
    }
    /** @param {AppSocket} socket @param {import("./shared/types/realtime").State} [s] @returns {Snapshot} */
    function snapshot(socket, s = engine.getState()) {
      const authenticated = staff(socket);
      return {
        shiftId: s.shiftId,
        shiftOpenedAt: s.shiftOpenedAt,
        revision: s.revision,
        observedAt: new Date().toISOString(),
        acceptingOrders: s.acceptingOrders,
        menuItems: s.menuItems,
        modifiers: s.modifiers,
        staff: authenticated,
        activeOrders: s.activeOrders.filter(
          (o) => authenticated || o.sessionId === socket.data.sessionId,
        ),
        completedOrders: s.completedOrders.filter(
          (o) => authenticated || o.sessionId === socket.data.sessionId,
        ),
        salesMetrics: authenticated ? s.salesMetrics : null,
      };
    }
    /** @param {Command} event */
    function broadcast(event) {
      const s = engine.getState();
      for (const socket of io.sockets.sockets.values()) {
        socket.emit("state_updated", snapshot(socket, s));
        if (staff(socket)) socket.emit("metrics_updated", s.salesMetrics);

      }
      if (event === "admin_toggle_stock")
        io.emit("menu_updated", {
          menuItems: s.menuItems,
          modifiers: s.modifiers,
          revision: s.revision,
        });
    }
    io.use((socket, next) => {
      try {
        limit(
          `connect:${clientAddress(socket.handshake.address, socket.handshake.headers["x-forwarded-for"])}`,
          120,
          60000,
        );
        const { sessionId, token } = socket.handshake.auth;
        ensure(
          typeof sessionId === "string" && UUID.test(sessionId),
          "Sesión inválida.",
        );
        socket.data = {
          sessionId,
          token: typeof token === "string" ? token : "",
        };
        next();
      } catch (error) {
        next(error instanceof Error ? error : new Error("Sesión inválida."));
      }
    });
    io.on("connection", (socket) => {
      socket.emit("init_data", snapshot(socket));
      socket.on("request_init", (ack) => {
        try {
          limit(`init:${socket.id}`, 60, 60000);
          socket.emit("init_data", snapshot(socket));
          if (typeof ack === "function") ack({ ok: true });
        } catch (error) {
          if (typeof ack === "function") ack(failure(error));
        }
      });
      socket.on("staff_login", (value, ack) => {
        if (typeof ack !== "function") return;
        try {
          const key = `pin:${clientAddress(socket.handshake.address, socket.handshake.headers["x-forwarded-for"])}`;
          const failures = limits.get(key);
          ensure(
            !failures || failures.until <= Date.now() || failures.count < 8,
            "Demasiados intentos. Intenta más tarde.",
            "RATE_LIMITED",
          );
          const correct =
            typeof value === "string" &&
            /^\d{4}$/.test(value) &&
            crypto.timingSafeEqual(
              crypto.createHash("sha256").update(value).digest(),
              pinHash,
            );
          if (!correct) {
            limit(key, 8, 15 * 60000);
            ensure(false, "PIN incorrecto.", "INVALID_PIN");
          }
          limits.delete(key);
          for (const [id, until] of sessions)
            if (until <= Date.now()) sessions.delete(id);
          ensure(sessions.size < 1000, "Demasiadas sesiones.");
          sessions.delete(socket.data.token);
          socket.data.token = crypto.randomBytes(32).toString("base64url");
          sessions.set(socket.data.token, Date.now() + sessionMs);
          socket.emit("init_data", snapshot(socket));
          ack({ ok: true, token: socket.data.token });
        } catch (error) {
          ack(failure(error));
        }
      });
      socket.on("staff_logout", (ack) => {
        if (!socket.data.token) {
          if (typeof ack === "function") ack({ ok: true });
          return;
        }
        sessions.delete(socket.data.token);
        for (const peer of io.sockets.sockets.values())
          if (peer.data.token === socket.data.token) {
            peer.emit("staff_expired");
            peer.emit("init_data", snapshot(peer));
          }
        socket.data.token = "";
        if (typeof ack === "function") ack({ ok: true });
      });
      /** @type {Command[]} */
      const events = [
        "submit_client_order",
        "pos_order_paid",
        "pos_update_status",
        "pos_mark_noshow",
        "admin_toggle_stock",
        "pos_toggle_accepting_orders",
        "pos_close_shift",
      ];
      for (const event of events)
        socket.on(
          event,
          /** @param {import('./shared/types/realtime').Commands[Command]} input @param {(reply: Reply) => void} ack */ (
            input,
            ack,
          ) => {
            if (typeof ack !== "function") return;
            try {
              if (event === "submit_client_order") {
                limit(
                  `orders:${clientAddress(socket.handshake.address, socket.handshake.headers["x-forwarded-for"])}`,
                  60,
                  60000,
                );
                ensure(
                  input &&
                    "sessionId" in input &&
                    input.sessionId === socket.data.sessionId,
                  "Sesión de pedido inválida.",
                );
              } else {
                if (!staff(socket)) {
                  socket.emit("staff_expired");
                  throw Object.assign(
                    new Error("Ingresa el PIN del personal."),
                    { code: "UNAUTHORIZED" },
                  );
                }
                limit(`staff:${socket.id}`, 300, 60000);
              }
              const result = engine.dispatch(event, input);
              broadcast(event);
              ack(result);
            } catch (error) {
              ack(failure(error));
            }
          },
        );
    });
    const expiry = setInterval(() => {
      for (const socket of io.sockets.sockets.values())
        if (socket.data.token && !staff(socket)) {
          socket.data.token = "";
          socket.emit("staff_expired");
          socket.emit("init_data", snapshot(socket));
        }
    }, 10000);
    expiry.unref();
    app.get("/api/health", (_req, res) =>
      res.json({ service: "masaflow", version: "0.3.0", status: "ready" }),
    );
    app.use("/assets", express.static(path.join(__dirname, "assets")));
    app.get("/manifest.webmanifest", (_req, res) =>
      res.sendFile(path.join(__dirname, "assets", "manifest.webmanifest")),
    );
    app.get("/sw.js", (_req, res) =>
      res.type("text/javascript").sendFile(path.join(__dirname, "assets", "sw.js")),
    );
    app.get("/", (_req, res) => res.redirect("/order/"));
    for (const [route, workspace] of [
      ["order", "client-web"],
      ["pos", "business-pos"],
      ["analytics", "analytics"],
    ]) {
      const root = path.join(__dirname, "apps", workspace, "dist-realtime");
      app.use(`/${route}`, express.static(root, { index: "realtime.html" }));
      app.get(`/${route}`, (_req, res) =>
        res
          .status(503)
          .send("Ejecuta npm run build antes de iniciar MasaFlow."),
      );
    }
    app.get("/track", (_req, res) => res.redirect("/order/"));
    app.get("/insights", (_req, res) => res.redirect("/analytics/"));
    /** @type {Promise<void> | undefined} */
    let closing;
    return {
      server,
      io,
      engine,
      close: () => {
        if (!closing)
          closing = new Promise((resolve, reject) => {
            clearInterval(expiry);
            io.close(() => {
              release().then(() => resolve(undefined), reject);
            });
          });
        return closing;
      },
    };
  } catch (error) {
    await release();
    throw error;
  }
}
/** @param {unknown} error @returns {Reply} */
function failure(error) {
  const e = /** @type {Error & {code?: string}} */ (error);
  const disk = ["ENOSPC", "EACCES", "EROFS", "EIO"].includes(e?.code || "");
  return {
    ok: false,
    error: disk
      ? "No se pudo guardar. Revisa el disco antes de reintentar."
      : e?.message || "No se pudo completar la acción.",
    code: disk ? "PERSISTENCE_FAILED" : e?.code || "ACTION_REJECTED",
  };
}
if (require.main === module) {
  try {
    process.loadEnvFile();
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT")
      throw error;
  }
  createService()
    .then((service) => {
      const stop = () => {
        void service.close();
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      process.once("SIGHUP", stop);
      service.server.once("error", async (error) => {
        console.error(error.message);
        await service.close();
        process.exitCode = 1;
      });
      const port = Number(
        process.env.PORT && process.env.PORT !== "8080"
          ? process.env.PORT
          : 3000,
      );
      service.server.listen(
        port,
        process.env.MASAFLOW_HOST || "0.0.0.0",
        () =>
          console.log(
            `MasaFlow · http://localhost:${port}/pos/`,
          ),
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
module.exports = { createService, clientAddress };
