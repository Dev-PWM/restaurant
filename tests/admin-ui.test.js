"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const { createService } = require("../server.js");

const dataDirectory = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-admin-"));

test("the Admin UI is off unless a bcrypt password hash is configured", async () => {
  const service = await createService({
    dataDirectory: dataDirectory(),
    pin: "1234",
    adminPasswordHash: "",
  });
  try {
    assert.equal(service.io._nsps.has("/admin"), false);
  } finally {
    await service.close();
  }
});

test("a malformed Admin UI hash stops startup instead of exposing an unprotected dashboard", async () => {
  await assert.rejects(
    createService({
      dataDirectory: dataDirectory(),
      pin: "1234",
      adminPasswordHash: "changeit",
    }),
    /hash bcrypt/,
  );
});

test("a valid hash enables the read-only /admin namespace", async () => {
  const service = await createService({
    dataDirectory: dataDirectory(),
    pin: "1234",
    adminPasswordHash: bcrypt.hashSync("local-only-password", 4),
  });
  try {
    assert.equal(service.io._nsps.has("/admin"), true);
  } finally {
    await service.close();
  }
});
