"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLogger, logDay } = require("../shared/logger.js");

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-logs-"));
}
const lines = (file) =>
  fs
    .readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

test("log days follow the restaurant's timezone, not UTC", () => {
  // 22:00 on Oct 7 in Mexico City is already Oct 8 in UTC.
  assert.equal(logDay(new Date("2026-10-08T04:00:00Z")), "2026-10-07");
  assert.equal(logDay(new Date("2026-10-08T07:00:00Z")), "2026-10-08");
});

test("logs roll to logs/server_YYYY-MM-DD.log at local midnight and only ever append", () => {
  const directory = temporaryDirectory();
  let clock = new Date("2026-10-08T04:00:00Z");
  const logger = createLogger({ directory, stdout: false, now: () => clock });
  logger.info({ event: "pos_order_paid" }, "before midnight");
  clock = new Date("2026-10-08T07:00:00Z");
  logger.info({ event: "pos_order_paid" }, "after midnight");

  assert.deepEqual(fs.readdirSync(directory).sort(), [
    "server_2026-10-07.log",
    "server_2026-10-08.log",
  ]);
  const first = lines(path.join(directory, "server_2026-10-07.log"));
  assert.equal(first.length, 1);
  assert.equal(first[0].msg, "before midnight");
  assert.equal(first[0].service, "masaflow");

  // A restart on the same day must extend the file, never truncate it.
  createLogger({ directory, stdout: false, now: () => clock }).info(
    "restarted",
  );
  assert.deepEqual(
    lines(path.join(directory, "server_2026-10-08.log")).map((l) => l.msg),
    ["after midnight", "restarted"],
  );
});

test("PINs, staff tokens and auth headers never reach the log file", () => {
  const directory = temporaryDirectory();
  const logger = createLogger({
    directory,
    stdout: false,
    now: () => new Date("2026-10-08T12:00:00Z"),
  });
  logger.info(
    {
      pin: "4321",
      token: "staff-token-secret",
      request: {
        token: "nested-secret",
        headers: { authorization: "Basic abc" },
      },
    },
    "login",
  );
  const text = fs.readFileSync(
    path.join(directory, "server_2026-10-08.log"),
    "utf8",
  );
  for (const secret of [
    "4321",
    "staff-token-secret",
    "nested-secret",
    "Basic abc",
  ])
    assert.ok(!text.includes(secret), `${secret} leaked into the log`);
  assert.ok(text.includes("[redacted]"));
});

test("the configured level applies to the file stream too", () => {
  const directory = temporaryDirectory();
  const logger = createLogger({
    directory,
    stdout: false,
    level: "debug",
    now: () => new Date("2026-10-08T12:00:00Z"),
  });
  logger.debug("socket connected");
  assert.equal(
    lines(path.join(directory, "server_2026-10-08.log"))[0].msg,
    "socket connected",
  );
});

test("an unwritable log folder never throws into the caller", () => {
  const blocker = path.join(temporaryDirectory(), "not-a-folder");
  fs.writeFileSync(blocker, "a file where the log folder should be");
  const messages = [];
  const write = process.stderr.write;
  process.stderr.write = (chunk) => (messages.push(String(chunk)), true);
  try {
    const logger = createLogger({
      directory: path.join(blocker, "logs"),
      stdout: false,
      now: () => new Date("2026-10-08T12:00:00Z"),
    });
    assert.doesNotThrow(() => logger.info("payment applied"));
    assert.doesNotThrow(() =>
      logger.info("second line, within the retry backoff"),
    );
  } finally {
    process.stderr.write = write;
  }
  assert.equal(
    messages.length,
    1,
    "the failure is reported once, not per line",
  );
  assert.match(messages[0], /No se pudo escribir el log/);
});

test("a closed terminal or broken pipe on stdout cannot crash the process", () => {
  const { EventEmitter } = require("node:events");
  class BrokenPipe extends EventEmitter {
    write() {
      // process.stdout reports a closed terminal asynchronously, as an 'error' event.
      setImmediate(() => this.emit("error", new Error("write EPIPE")));
      return true;
    }
  }
  const stdout = new BrokenPipe();
  const logger = createLogger({ stdout });
  assert.doesNotThrow(() => logger.info("shutting down"));
  // An unguarded emitter would throw here (an unhandled 'error' event).
  assert.doesNotThrow(() => stdout.emit("error", new Error("write EPIPE")));

  const throwing = {
    write() {
      throw new Error("EIO");
    },
  };
  assert.doesNotThrow(() =>
    createLogger({ stdout: throwing }).info("still fine"),
  );
});
