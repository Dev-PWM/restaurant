#!/usr/bin/env node
"use strict";
/**
 * ReDoS scan. Parses every first-party JS/TS/TSX file into an AST, collects each
 * regular expression (literals and `new RegExp("…")`), and attacks it with
 * adversarial input under a hard time limit. A pattern that stalls is catastrophic
 * backtracking: a customer-controlled string could freeze the single-threaded server
 * in the middle of a lunch rush. Non-literal `new RegExp(x)` is flagged outright,
 * because the pattern itself may be attacker-supplied.
 *
 * Severity: EXPONENTIAL stalls on a 32-character input (always a bug). QUADRATIC only
 * stalls on tens of thousands of characters (a bug where input length is unbounded).
 * The gate is strict for code that touches customer input (STRICT_ROOTS) and
 * advisory for the internal analytics dashboard. Silence a reviewed line with a
 * `redos-scan-ignore` comment.
 *
 *   npm run scan:regex
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parse } = require("@babel/parser");

const root = path.join(__dirname, "..");
const ROOTS = [
  "server.js",
  "shared",
  "scripts",
  "artillery",
  "apps/business-pos/src",
  "apps/client-web/src",
  "apps/analytics/src",
];
/** Code reachable with customer-controlled strings: every finding here fails the scan. */
const STRICT_ROOTS = [
  "server.js",
  "shared/",
  "apps/business-pos/src/",
  "apps/client-web/src/",
];
const EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx"]);
const SKIP = new Set(["node_modules", "dist", "dist-realtime", "legacy"]);
const PROBE_TIMEOUT_MS = 150;

/** Group containing a quantifier that is itself quantified: (a+)+, (a|aa)*, (.*)* … */
const NESTED_QUANTIFIER =
  /\((?:[^()\\]|\\.)*(?:[+*]|\{\d+,\d*\})(?:[^()\\]|\\.)*\)(?:[+*]|\{\d+,\d*\})/;
const OVERLAPPING_ALTERNATION = /\(([^()|\\]+)\|\1[^()|]*\)[+*]/;

/**
 * @param {string} pattern @param {string} flags
 * @returns {{vulnerable: boolean, kind?: "exponential" | "quadratic", input?: string}}
 */
function probe(pattern, flags = "") {
  const safeFlags = flags.replace(/[gy]/g, "");
  let expression;
  try {
    expression = new RegExp(pattern, safeFlags); // redos-scan-ignore: the scanner's own probe
  } catch {
    return { vulnerable: false };
  }
  // Attack with every literal character the pattern mentions plus common separators.
  const alphabet = new Set(["a", "0", " ", "-", ".", "x", "A"]);
  for (const ch of pattern.replace(/\\./g, ""))
    if (/[\w\s.\-@/:]/.test(ch)) alphabet.add(ch);
  const stalls = (ch, length) => {
    const input = `${ch.repeat(length)}\u0001!`;
    const started = performance.now();
    try {
      vm.runInNewContext(
        "expression.test(input)",
        { expression, input },
        { timeout: PROBE_TIMEOUT_MS },
      );
    } catch (error) {
      if (error && error.code === "ERR_SCRIPT_EXECUTION_TIMEOUT") return true;
      throw error;
    }
    return performance.now() - started > PROBE_TIMEOUT_MS;
  };
  for (const [kind, length] of [
    ["exponential", 32],
    ["quadratic", 24000],
  ])
    for (const ch of alphabet)
      if (stalls(ch, length))
        return {
          vulnerable: true,
          kind,
          input: `${JSON.stringify(ch)} x ${length}`,
        };
  return { vulnerable: false };
}

/** Depth-first walk over a Babel AST. */
function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) for (const child of value) walk(child, visit);
    else if (value && typeof value === "object") walk(value, visit);
  }
}

/** @param {string} source @param {string} file @returns {{file: string, line: number, pattern: string, status: string, detail?: string}[]} */
function scanSource(source, file) {
  const ast = parse(source, {
    sourceType: "unambiguous",
    errorRecovery: true,
    plugins: ["typescript", "jsx"],
  });
  const findings = [];
  /** A `redos-scan-ignore` comment on or just above the statement marks a reviewed line. */
  const comments = (ast.comments || []).filter((c) =>
    c.value.includes("redos-scan-ignore"),
  );
  const ignored = (node) =>
    comments.some(
      (c) =>
        c.loc.end.line >= (node.loc?.start.line ?? 0) - 1 &&
        c.loc.start.line <= (node.loc?.end.line ?? 0),
    );
  const record = (node, pattern, flags) => {
    if (ignored(node)) return;
    const suspect =
      NESTED_QUANTIFIER.test(pattern) || OVERLAPPING_ALTERNATION.test(pattern);
    const attack = probe(pattern, flags);
    findings.push({
      file,
      line: node.loc?.start.line ?? 0,
      pattern: `/${pattern}/${flags}`,
      status: attack.vulnerable
        ? attack.kind.toUpperCase()
        : suspect
          ? "SUSPECT"
          : "ok",
      detail: attack.vulnerable
        ? `stalled >${PROBE_TIMEOUT_MS} ms on ${attack.input}`
        : undefined,
    });
  };
  walk(ast.program, (node) => {
    if (node.type === "RegExpLiteral") record(node, node.pattern, node.flags);
    const isRegExpCall =
      (node.type === "NewExpression" || node.type === "CallExpression") &&
      node.callee.type === "Identifier" &&
      node.callee.name === "RegExp";
    if (isRegExpCall && !ignored(node)) {
      const [pattern, flags] = node.arguments;
      if (pattern?.type === "StringLiteral")
        record(
          node,
          pattern.value,
          flags?.type === "StringLiteral" ? flags.value : "",
        );
      else
        findings.push({
          file,
          line: node.loc?.start.line ?? 0,
          pattern: "new RegExp(<dynamic>)",
          status: "DYNAMIC",
          detail:
            "pattern is not a literal; untrusted input could make it catastrophic",
        });
    }
  });
  return findings;
}

function sourceFiles(entry) {
  const full = path.join(root, entry);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [full];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((item) => {
    if (SKIP.has(item.name)) return [];
    const child = path.join(entry, item.name);
    return item.isDirectory()
      ? sourceFiles(child)
      : EXTENSIONS.has(path.extname(item.name))
        ? [path.join(root, child)]
        : [];
  });
}

const isStrict = (file) =>
  STRICT_ROOTS.some((entry) => file === entry || file.startsWith(entry));
/** The findings that must fail the build. */
const gating = (finding) =>
  finding.status === "EXPONENTIAL" ||
  (isStrict(finding.file) && ["QUADRATIC", "DYNAMIC"].includes(finding.status));

function scanProject(roots = ROOTS) {
  const findings = [];
  const unparsed = [];
  for (const file of roots.flatMap(sourceFiles)) {
    const relative = path.relative(root, file);
    try {
      findings.push(...scanSource(fs.readFileSync(file, "utf8"), relative));
    } catch (error) {
      unparsed.push(`${relative}: ${error.message}`);
    }
  }
  return { findings, unparsed };
}

if (require.main === module) {
  const { findings, unparsed } = scanProject();
  for (const finding of findings.filter((item) => item.status !== "ok"))
    console.log(
      `${gating(finding) ? "FAIL" : "warn"}  ${finding.status.padEnd(11)} ${finding.file}:${finding.line}  ${finding.pattern}  ${finding.detail ?? ""}`,
    );
  for (const message of unparsed) console.log(`UNPARSED   ${message}`);
  const bad = findings.filter(gating);
  const count = (status) =>
    findings.filter((item) => item.status === status).length;
  console.log(
    `\n${findings.length} regular expressions scanned: ${count("EXPONENTIAL")} exponential, ${count("QUADRATIC")} quadratic, ${count("DYNAMIC")} dynamic, ${count("SUSPECT")} suspect. ${bad.length} gating failure(s).`,
  );
  process.exitCode = bad.length ? 1 : 0;
}

module.exports = { probe, scanSource, scanProject, gating, STRICT_ROOTS };
