"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  vm = require("node:vm");
test("bank overrides reach a browser build that has no Node process global", async () => {
  const vars = {
    VITE_BANK_NAME: "QA Override Bank",
    VITE_BANK_CLABE: " 123456789012345678 ",
    VITE_BANK_BENEFICIARY: "QA Fixture Owner",
    VITE_BANK_CONCEPT_PREFIX: "QA-",
  };
  const previous = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    const { build } = await import("vite");
    const result = await build({
      configFile: path.join(__dirname, "../vite.realtime.config.mts"),
      mode: "client-web",
      logLevel: "silent",
      build: {
        write: false,
        minify: false,
        rollupOptions: {
          input: path.join(__dirname, "../shared/types/zapata.ts"),
        },
        lib: {
          entry: path.join(__dirname, "../shared/types/zapata.ts"),
          name: "BankAudit",
          formats: ["iife"],
        },
      },
    });
    const output = (Array.isArray(result) ? result[0] : result).output;
    const sandbox = { window: {} };
    vm.runInNewContext(output.find((o) => o.type === "chunk").code, sandbox);
    assert.deepEqual(
      JSON.parse(JSON.stringify(sandbox.BankAudit.BBVA_BANK_INFO)),
      {
        bank: vars.VITE_BANK_NAME,
        clabe: vars.VITE_BANK_CLABE.trim(),
        beneficiary: vars.VITE_BANK_BENEFICIARY,
        conceptPrefix: vars.VITE_BANK_CONCEPT_PREFIX,
      },
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("workspace builds reject incomplete or malformed customized bank identities", async () => {
  const keys = ["VITE_BANK_NAME", "VITE_BANK_CLABE", "VITE_BANK_BENEFICIARY"],
    previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const { loadConfigFromFile } = await import("vite");
  const load = () =>
    loadConfigFromFile(
      { command: "build", mode: "client-web" },
      path.join(__dirname, "../vite.realtime.config.mts"),
      undefined,
      "silent",
    );
  try {
    for (const values of [
      { VITE_BANK_NAME: "QA Bank" },
      { VITE_BANK_CLABE: "123456789012345678" },
      { VITE_BANK_BENEFICIARY: "QA Owner" },
    ]) {
      for (const key of keys) process.env[key] = values[key] ?? "";
      await assert.rejects(load(), /Configura juntos/);
    }
    Object.assign(process.env, {
      VITE_BANK_NAME: "QA Bank",
      VITE_BANK_BENEFICIARY: "QA Owner",
      VITE_BANK_CLABE: "invalid",
    });
    await assert.rejects(load(), /18 dígitos/);
    process.env.VITE_BANK_CLABE = "123456789012345678";
    assert.ok(await load());
    for (const key of keys) process.env[key] = "";
    assert.ok(await load());
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
