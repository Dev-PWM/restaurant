"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  gating,
  probe,
  scanProject,
  scanSource,
  STRICT_ROOTS,
} = require("../scripts/scan-regex.cjs");

test("the probe catches exponential patterns and passes safe ones", () => {
  // Exponential blow-up needs seconds even on a very fast CPU, so these never flake.
  // Quadratic stalls depend on CPU speed, so only `npm run scan:regex` reports them.
  assert.equal(probe("^(a+)+$").kind, "exponential");
  assert.equal(probe("^(\\w+\\s?)*$").kind, "exponential");
  assert.equal(probe("^\\d{4}$").vulnerable, false);
  assert.equal(probe("^[0-9a-f-]{36}$", "i").vulnerable, false);
});

test("a RegExp built from a variable is flagged in customer-facing code", () => {
  const [finding] = scanSource(
    "const re = new RegExp(customerName);",
    "server.js",
  );
  assert.equal(finding.status, "DYNAMIC");
  assert.equal(gating(finding), true);

  const [reviewed] = scanSource(
    "// redos-scan-ignore: escaped and length-capped upstream\nconst re = new RegExp(escaped);",
    "server.js",
  );
  assert.equal(reviewed, undefined);
});

test("no regular expression reachable with customer input can backtrack catastrophically", () => {
  const { findings, unparsed } = scanProject(
    STRICT_ROOTS.map((root) => root.replace(/\/$/, "")),
  );
  assert.deepEqual(unparsed, []);
  assert.ok(
    findings.length > 10,
    "the scan should find the first-party regexes",
  );
  const failures = findings.filter(gating);
  assert.deepEqual(
    failures.map((f) => `${f.status} ${f.file}:${f.line} ${f.pattern}`),
    [],
  );
});
