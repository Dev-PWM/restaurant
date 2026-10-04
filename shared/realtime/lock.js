"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const heldLocks = new Map();
async function acquireLock(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(await fs.realpath(directory), ".writer-lock");
  const owner = {
    pid: process.pid,
    hostname: os.hostname(),
    token: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
  };
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await fs.mkdir(lock, { mode: 0o700 });
      heldLocks.set(lock, owner.token);
      try {
        await fs.writeFile(
          path.join(lock, "owner.json"),
          JSON.stringify(owner),
          { flag: "wx", mode: 0o600 },
        );
      } catch (error) {
        await fs.rm(lock, { recursive: true, force: true });
        if (heldLocks.get(lock) === owner.token) heldLocks.delete(lock);
        throw error;
      }
      let released = false;
      return async () => {
        if (released) return;
        const actual = JSON.parse(
          await fs.readFile(path.join(lock, "owner.json"), "utf8"),
        );
        if (actual.token !== owner.token)
          throw new Error("Data lock ownership changed.");
        await fs.rm(lock, { recursive: true });
        if (heldLocks.get(lock) === owner.token) heldLocks.delete(lock);
        released = true;
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    let existing;
    try {
      existing = JSON.parse(
        await fs.readFile(path.join(lock, "owner.json"), "utf8"),
      );
    } catch (error) {
      if (error.code === "ENOENT") {
        await wait(25);
        continue;
      }
      throw new Error(
        "Unreadable data lock. Inspect .writer-lock before restarting.",
      );
    }
    if (
      existing.hostname !== os.hostname() ||
      !Number.isInteger(existing.pid) ||
      !existing.token
    )
      throw new Error(
        "Unknown data lock owner. Inspect .writer-lock before restarting.",
      );
    let alive = true;
    try {
      process.kill(existing.pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") alive = false;
    }
    if (existing.pid === process.pid && !heldLocks.has(lock)) alive = false;
    if (alive) {
      const error = new Error(
        `MasaFlow data is in use by process ${existing.pid}. Stop that service before restoring or starting another writer.`,
      );
      error.code = "DATA_IN_USE";
      throw error;
    }
    // Only one stale-lock reclaimer proceeds. Re-read the ownership token after
    // taking the recovery mutex so another reclaimer cannot remove a fresh lock.
    let recovery;
    try {
      recovery = await fs.open(path.join(lock, "reclaim"), "wx", 0o600);
    } catch (error) {
      if (["EEXIST", "ENOENT"].includes(error.code)) {
        await wait(25);
        continue;
      }
      throw error;
    }
    try {
      const actual = JSON.parse(
        await fs.readFile(path.join(lock, "owner.json"), "utf8"),
      );
      if (actual.token === existing.token) {
        const abandoned = `${lock}.abandoned-${owner.token}`;
        await fs.rename(lock, abandoned);
        await fs.rm(abandoned, { recursive: true, force: true });
      } else await fs.rm(path.join(lock, "reclaim"), { force: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    } finally {
      await recovery.close();
    }
  }
  throw new Error(
    "Could not acquire the data lock. Inspect .writer-lock before restarting.",
  );
}
module.exports = { acquireLock };
