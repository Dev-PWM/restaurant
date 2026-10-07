// @ts-check
"use strict";
const path = require("node:path");
const pino = require("pino");

/** Restaurant-local calendar day, so a shift that ends after midnight UTC stays in one file. */
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** @param {Date} [date] @returns {string} YYYY-MM-DD */
function logDay(date = new Date()) {
  return dayFormat.format(date);
}

/**
 * Append-only stream that rolls to `server_YYYY-MM-DD.log` when the local day changes.
 * Writes are synchronous so the last lines before a crash are on disk, and a failing
 * disk is reported once on stderr instead of taking the point of sale down.
 * @param {string} directory
 * @param {() => Date} [now]
 */
function createDailyFileStream(directory, now = () => new Date()) {
  /** @type {string} */
  let currentDay = "";
  /** @type {ReturnType<typeof pino.destination> | undefined} */
  let destination;
  let retryAt = 0;
  /** @param {unknown} error */
  const report = (error) =>
    process.stderr.write(
      `No se pudo escribir el log: ${error instanceof Error ? error.message : error}\n`,
    );
  return {
    /** @param {string} line */
    write(line) {
      // A logging failure must never reach the caller: the command it describes has
      // already been applied, and a thrown error would be reported as a failed payment.
      try {
        const day = logDay(now());
        if (day !== currentDay || !destination) {
          if (!destination && now().getTime() < retryAt) return;
          destination?.end();
          destination = undefined;
          currentDay = day;
          const opened = pino.destination({
            dest: path.join(directory, `server_${day}.log`),
            mkdir: true,
            sync: true,
          });
          opened.on("error", report);
          destination = opened;
        }
        destination.write(line);
      } catch (error) {
        report(error);
        destination = undefined;
        currentDay = "";
        retryAt = now().getTime() + 30000;
      }
    },
    end() {
      destination?.end();
      destination = undefined;
      currentDay = "";
    },
  };
}

const guarded = new WeakSet();
/**
 * Wraps a console-like stream so a closed terminal or broken pipe can never crash
 * the server: pino writes to process.stdout directly, and an unhandled 'error'
 * event on it would become an uncaught exception.
 * @param {{write: (line: string) => unknown, on?: Function}} stream
 */
function guardStream(stream) {
  if (typeof stream.on === "function" && !guarded.has(stream)) {
    guarded.add(stream);
    stream.on("error", () => {});
  }
  return {
    /** @param {string} line */
    write(line) {
      try {
        stream.write(line);
      } catch {
        // Terminal closed or pipe broken: the daily file still has the line.
      }
    },
  };
}

/**
 * Structured JSON logger. PINs, staff tokens and auth headers are redacted wherever they appear.
 * @param {{directory?: string, level?: string, stdout?: boolean | {write: (line: string) => unknown}, now?: () => Date}} [options]
 */
function createLogger(options = {}) {
  const level = options.level || process.env.MASAFLOW_LOG_LEVEL || "info";
  const streams = [];
  if (options.directory)
    streams.push({
      level,
      stream: createDailyFileStream(options.directory, options.now),
    });
  // multistream defaults every stream to "info", which would hide debug output.
  if (options.stdout !== false)
    streams.push({
      level,
      stream: guardStream(
        typeof options.stdout === "object" ? options.stdout : process.stdout,
      ),
    });
  return pino(
    {
      level,
      base: { service: "masaflow" },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          "pin",
          "token",
          "*.pin",
          "*.token",
          "*.authorization",
          "*.headers.authorization",
        ],
        censor: "[redacted]",
      },
    },
    pino.multistream(streams),
  );
}

/** A logger that discards everything; the default for embedded and test services. */
function createSilentLogger() {
  return pino({ level: "silent" });
}

module.exports = {
  createLogger,
  createSilentLogger,
  createDailyFileStream,
  logDay,
};
