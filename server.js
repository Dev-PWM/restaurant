// @ts-check
"use strict";
const express = require("express");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { isIP } = require("node:net");
const { Server } = require("socket.io");
const { instrument } = require("@socket.io/admin-ui");
const { createLogger, createSilentLogger } = require("./shared/logger.js");
const realtime = require("./shared/realtime/engine.js");
const { createEngine, UUID } = realtime;
/** @type {typeof import("./shared/realtime/engine.js").ensure} */
const ensure = realtime.ensure;
const { acquireLock } = require("./shared/realtime/lock.js");
const {
  createMdnsAdvertiser,
  getNetworkInfo,
} = require("./shared/realtime/mdns.js");
const { toSvg, toDataUri } = require("./shared/qrcode.js");
/** @typedef {import('./shared/types/realtime').Snapshot} Snapshot */
/** @typedef {import('./shared/types/realtime').Command} Command */
/** @typedef {import('./shared/types/realtime').Reply} Reply */
/** @typedef {{sessionId: string, token: string}} SocketData */
/** @typedef {import('socket.io').Socket<import('./shared/types/realtime').ClientToServerEvents, import('./shared/types/realtime').ServerToClientEvents, Record<string, never>, SocketData>} AppSocket */
/** Trust the final forwarded hop only for the loopback Vite proxy or the isolated public Caddy service.
 * @param {string} peer @param {string | string[] | undefined} forwarded @param {boolean} [publicProxy] */
function clientAddress(peer, forwarded, publicProxy = false) {
  if (
    (!publicProxy && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer)) ||
    typeof forwarded !== "string"
  )
    return peer;
  const address = forwarded.split(",").at(-1)?.trim() || "";
  return isIP(address) ? address : peer;
}
const LOOPBACK = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
/** Logging is observability only; it must never change the outcome of a command already applied. */
const quietly = (/** @type {() => void} */ write) => {
  try {
    write();
  } catch {
    // The log stream reports its own failures on stderr.
  }
};
/** @param {{dataDirectory?: string, pin?: string, staffPassword?: string, publicOrigin?: string, sessionMs?: number, logger?: import("pino").Logger, adminPasswordHash?: string, port?: number, enableMdns?: boolean}} [options] */
async function createService(options = {}) {
  const log = (options.logger ?? createSilentLogger()).child({
    component: "server",
  });
  const dataDirectory =
    options.dataDirectory ||
    process.env.MASAFLOW_DATA_DIR ||
    path.join(__dirname, ".masaflow-realtime");
  const publicOrigin = options.publicOrigin ?? process.env.MASAFLOW_PUBLIC_ORIGIN ?? "";
  if (publicOrigin) {
    const parsed = new URL(publicOrigin);
    ensure(
      parsed.protocol === "https:" &&
        parsed.origin === publicOrigin &&
        parsed.username === "" &&
        parsed.password === "" &&
        parsed.pathname === "/" &&
        parsed.search === "" &&
        parsed.hash === "",
      "MASAFLOW_PUBLIC_ORIGIN debe ser un origen HTTPS sin ruta.",
    );
  }
  const staffPassword = options.staffPassword ?? process.env.MASAFLOW_STAFF_PASSWORD ?? "";
  ensure(
    (!publicOrigin || staffPassword.length >= 12) &&
      (!staffPassword || (staffPassword.length >= 12 && staffPassword.length <= 256)),
    "Configura MASAFLOW_STAFF_PASSWORD con 12 a 256 caracteres para publicar el sitio.",
  );
  const authMode = staffPassword ? "password" : "pin";
  const pin = authMode === "password" ? "" : options.pin ?? process.env.MASAFLOW_STAFF_PIN ?? "";
  const sessionMs = options.sessionMs ?? 12 * 60 * 60 * 1000;
  if (authMode === "pin")
    ensure(
      /^\d{4}$/.test(pin),
      "Configura MASAFLOW_STAFF_PIN con 4 dígitos antes de iniciar.",
    );
  const effectivePort =
    options.port ||
    Number(
      process.env.PORT && process.env.PORT !== "8080"
        ? process.env.PORT
        : 3000,
    );
  /** @type {ReturnType<typeof createMdnsAdvertiser> | null} */
  let mdns = null;
  const release = await acquireLock(dataDirectory);
  try {
    const engine = createEngine({ directory: dataDirectory });
    if (engine.menuBackup)
      log.info(
        { backup: engine.menuBackup },
        "Menú actualizado a Los Huaraches de Zapata",
      );
    const app = express();
    app.disable("x-powered-by");
    app.use((_req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Frame-Options", "DENY");
      next();
    });
    const server = http.createServer(app);
    /** @type {Server<import('./shared/types/realtime').ClientToServerEvents, import('./shared/types/realtime').ServerToClientEvents, Record<string, never>, SocketData>} */
    const io = new Server(server, {
      cors: { origin: publicOrigin || "*" },
      allowRequest: (req, callback) => {
        // Browsers omit Origin on the initial same-origin polling GET, but
        // supply it on polling POSTs and WebSocket handshakes.
        const sameOriginPoll =
          req.method === "GET" &&
          req.headers.origin === undefined &&
          req.headers["sec-fetch-site"] === "same-origin";
        callback(null, !publicOrigin || req.headers.origin === publicOrigin || sameOriginPoll);
      },
      maxHttpBufferSize: 65536,
    });
    /** @type {Map<string, number>} */
    const sessions = new Map();
    /** @type {Map<string, {count: number, until: number}>} */
    const limits = new Map();
    const credentialHash = crypto.createHash("sha256").update(staffPassword || pin).digest();
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
        tables: s.tables,
        queueNumbers: s.activeOrders
          .filter((o) => o.status === "review" || o.status === "cooking")
          .map((o) => o.number),
        staffAuthMode: authMode,
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
      if (event === "admin_toggle_stock" || event === "admin_add_menu_item")
        io.emit("menu_updated", {
          menuItems: s.menuItems,
          modifiers: s.modifiers,
          revision: s.revision,
        });
    }
    io.use((socket, next) => {
      try {
        limit(
          `connect:${clientAddress(socket.handshake.address, socket.handshake.headers["x-forwarded-for"], Boolean(publicOrigin))}`,
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
        log.warn(
          {
            address: clientAddress(
              socket.handshake.address,
              socket.handshake.headers["x-forwarded-for"],
              Boolean(publicOrigin),
            ),
            reason: error instanceof Error ? error.message : "unknown",
          },
          "socket rejected",
        );
        next(error instanceof Error ? error : new Error("Sesión inválida."));
      }
    });
    io.on("connection", (socket) => {
      log.debug({ socket: socket.id }, "socket connected");
      socket.on("disconnect", (reason) =>
        log.debug({ socket: socket.id, reason }, "socket disconnected"),
      );
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
          const key = `pin:${clientAddress(socket.handshake.address, socket.handshake.headers["x-forwarded-for"], Boolean(publicOrigin))}`;
          const failures = limits.get(key);
          ensure(
            !failures || failures.until <= Date.now() || failures.count < 8,
            "Demasiados intentos. Intenta más tarde.",
            "RATE_LIMITED",
          );
          const correct =
            typeof value === "string" &&
            (authMode === "password"
              ? value.length >= 12 && value.length <= 256
              : /^\d{4}$/.test(value)) &&
            crypto.timingSafeEqual(
              crypto.createHash("sha256").update(value).digest(),
              credentialHash,
            );
          if (!correct) {
            limit(key, 8, 15 * 60000);
            log.warn({ socket: socket.id, key }, "staff login failed");
            ensure(false, authMode === "password" ? "Contraseña incorrecta." : "PIN incorrecto.", "INVALID_PIN");
          }
          limits.delete(key);
          for (const [id, until] of sessions)
            if (until <= Date.now()) sessions.delete(id);
          ensure(sessions.size < 1000, "Demasiadas sesiones.");
          sessions.delete(socket.data.token);
          socket.data.token = crypto.randomBytes(32).toString("base64url");
          sessions.set(socket.data.token, Date.now() + sessionMs);
          socket.emit("init_data", snapshot(socket));
          log.info({ socket: socket.id }, "staff login");
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
        "admin_add_menu_item",
        "pos_toggle_accepting_orders",
        "pos_set_table",
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
                  `orders:${clientAddress(socket.handshake.address, socket.handshake.headers["x-forwarded-for"], Boolean(publicOrigin))}`,
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
              // Reply first: nothing about logging may change what the cashier sees.
              ack(result);
              quietly(() =>
                log.info(
                  {
                    event,
                    socket: socket.id,
                    orderId:
                      result.ok && result.orderId
                        ? result.orderId
                        : input && "orderId" in input
                          ? input.orderId
                          : undefined,
                    bytes: Buffer.byteLength(JSON.stringify(input) ?? ""),
                  },
                  "command applied",
                ),
              );
            } catch (error) {
              const reply = failure(error);
              ack(reply);
              if (!reply.ok)
                quietly(() => {
                  const persistence = reply.code === "PERSISTENCE_FAILED";
                  log[persistence ? "error" : "warn"](
                    {
                      event,
                      socket: socket.id,
                      code: reply.code,
                      reason: reply.error,
                      err: persistence ? error : undefined,
                    },
                    "command rejected",
                  );
                });
            }
          },
        );
    });
    const expiry = setInterval(() => {
      const at = Date.now();
      for (const [token, until] of sessions)
        if (until <= at) sessions.delete(token);
      for (const socket of io.sockets.sockets.values())
        if (socket.data.token && !staff(socket)) {
          socket.data.token = "";
          socket.emit("staff_expired");
          socket.emit("init_data", snapshot(socket));
        }
    }, 10000);
    expiry.unref();
    const adminHash =
      options.adminPasswordHash ??
      process.env.MASAFLOW_ADMIN_PASSWORD_HASH ??
      "";
    if (adminHash) {
      ensure(
        /^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(adminHash),
        "MASAFLOW_ADMIN_PASSWORD_HASH debe ser un hash bcrypt. Genera uno con npm run admin:hash.",
      );
      /** @param {string} peer @param {string | string[] | undefined} forwarded */
      const local = (peer, forwarded) =>
        LOOPBACK.includes(clientAddress(peer, forwarded, Boolean(publicOrigin)));
      // Registered before instrument(), so this runs ahead of the Admin UI's own password check
      // (a bcrypt compare on the main thread), and caps how often anyone can trigger it.
      io.of("/admin").use((socket, next) => {
        const forwarded = socket.handshake.headers["x-forwarded-for"];
        if (!local(socket.handshake.address, forwarded))
          return next(new Error("Solo disponible desde este equipo."));
        try {
          limit(
            `admin:${clientAddress(socket.handshake.address, forwarded, Boolean(publicOrigin))}`,
            20,
            60000,
          );
          next();
        } catch (error) {
          next(
            error instanceof Error ? error : new Error("Intenta más tarde."),
          );
        }
      });
      instrument(io, {
        auth: { type: "basic", username: "admin", password: adminHash },
        namespaceName: "/admin",
        readonly: true,
        // "development" would stream every socket's data (including the staff token)
        // and the arguments of every event (including the PIN in staff_login) to the
        // dashboard. Production mode shows connections, transports and aggregated
        // event counts only; per-command payload sizes are in the log instead.
        mode: "production",
        serverId: "masaflow",
      });
      app.use(
        "/admin-ui",
        (req, res, next) =>
          local(req.socket.remoteAddress ?? "", req.headers["x-forwarded-for"])
            ? next()
            : res.status(403).send("Solo disponible desde este equipo."),
        express.static(
          path.join(
            path.dirname(require.resolve("@socket.io/admin-ui")),
            "..",
            "ui",
            "dist",
          ),
        ),
      );
      log.warn(
        "Socket.io Admin UI habilitada en /admin-ui/ (solo este equipo, solo lectura)",
      );
    }
    app.get("/api/health", (_req, res) =>
      res.json({ service: "masaflow", version: "0.3.0", status: "ready" }),
    );
    if (!publicOrigin) app.get("/api/network", (_req, res) => {
      const addr = server.address();
      const currentPort =
        (addr && typeof addr === "object" ? addr.port : null) || effectivePort;
      res.json(getNetworkInfo(currentPort));
    });
    if (!publicOrigin) app.get("/api/network/qr", (req, res) => {
      const addr = server.address();
      const currentPort =
        (addr && typeof addr === "object" ? addr.port : null) || effectivePort;
      const info = getNetworkInfo(currentPort);
      const target = String(req.query.target || "order");
      if (req.query.url !== undefined || !Object.hasOwn(info.urls, target))
        return res.status(400).json({ error: "Elige un destino local válido." });
      const targetUrl = /** @type {Record<string, string>} */ (info.urls)[target];
      if (Buffer.byteLength(targetUrl, "utf8") > 200)
        return res.status(400).json({ error: "La dirección es demasiado larga para el código QR." });

      if (req.query.format === "json" || req.query.format === "datauri") {
        return res.json({
          url: targetUrl,
          dataUri: toDataUri(targetUrl, { size: 256, color: "#1c1917" }),
        });
      }

      const svg = toSvg(targetUrl, { size: 256, color: "#1c1917" });
      res.setHeader("Cache-Control", "no-cache");
      res.type("image/svg+xml").send(svg);
    });
    app.use("/assets", express.static(path.join(__dirname, "assets")));
    app.get("/manifest.webmanifest", (_req, res) =>
      res.sendFile("manifest.webmanifest", { root: path.join(__dirname, "assets") }),
    );
    app.get("/sw.js", (_req, res) =>
      res
        .type("text/javascript")
        .sendFile("sw.js", { root: path.join(__dirname, "assets") }),
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
    // Announce only after the writer lock, ledger and routes are ready. A failed
    // startup must never leave a stale network service running.
    if (options.enableMdns && !publicOrigin) {
      try {
        mdns = createMdnsAdvertiser({ port: effectivePort, logger: log });
      } catch (err) {
        log.warn(
          { err: /** @type {Error} */ (err).message },
          "No se pudo iniciar el anunciador mDNS",
        );
      }
    }
    return {
      server,
      io,
      engine,
      mdns,
      getNetworkInfo: () => {
        const addr = server.address();
        const currentPort =
          (addr && typeof addr === "object" ? addr.port : null) ||
          effectivePort;
        return getNetworkInfo(currentPort);
      },
      close: () => {
        if (!closing)
          closing = new Promise((resolve, reject) => {
            log.info("shutting down");
            clearInterval(expiry);
            const stopMdns = mdns ? mdns.close() : Promise.resolve();
            stopMdns.finally(() => {
              io.close(() => {
                release().then(() => resolve(undefined), reject);
              });
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
  const logger = createLogger({
    directory: process.env.MASAFLOW_LOG_DIR || path.join(__dirname, "logs"),
  });
  // A crash leaves its last words in logs/server_YYYY-MM-DD.log for the post-mortem.
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "uncaughtException");
    process.exit(1);
  });
  const port = Number(
    process.env.PORT && process.env.PORT !== "8080"
      ? process.env.PORT
      : 3000,
  );
  const publicOrigin = process.env.MASAFLOW_PUBLIC_ORIGIN || "";
  createService({ logger, port, enableMdns: !publicOrigin })
    .then((service) => {
      const stop = () => {
        void service.close();
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      process.once("SIGHUP", stop);
      service.server.once("error", async (error) => {
        logger.error({ err: error }, "server error");
        await service.close();
        process.exitCode = 1;
      });
      service.server.listen(port, process.env.MASAFLOW_HOST || "0.0.0.0", () => {
        if (publicOrigin) {
          logger.info({ port, url: `${publicOrigin}/pos/` }, "MasaFlow público listo");
          return;
        }
        const netInfo = getNetworkInfo(port);
        logger.info(
          {
            port,
            url: `http://localhost:${port}/pos/`,
            bonjour: netInfo.urls.bonjour,
            mdns: netInfo.urls.mdns,
            lan: netInfo.urls.lan,
          },
          "MasaFlow listo con auto-descubrimiento mDNS/Bonjour",
        );
      });
    })
    .catch((error) => {
      logger.fatal({ err: error }, "no se pudo iniciar MasaFlow");
      process.exitCode = 1;
    });
}
module.exports = { createService, clientAddress };
