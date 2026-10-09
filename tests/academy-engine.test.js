"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const academy = "../apps/business-pos/src/academy";
const load = () =>
  Promise.all([
    import(`${academy}/engine.js`),
    import(`${academy}/curriculum.js`),
    import(`${academy}/glossary.js`),
  ]).then(([engine, curriculum, glossary]) => ({
    ...engine,
    ...curriculum,
    ...glossary,
  }));

/** Builds the UI event an act step is waiting for. */
function eventFor(expect) {
  const event = { type: expect.type };
  for (const [key, value] of Object.entries(expect))
    if (key !== "type" && key !== "test") event[key] = value;
  if (typeof expect.test === "function" && !expect.test(event))
    event.text = "ana";
  return event;
}

/** Plays one module the way a trainee would, and returns the final state. */
function playModule(lib, state, moduleId) {
  let next = lib.academyReducer(state, { type: "START_MODULE", moduleId });
  assert.equal(next.phase, "learning", `${moduleId} should be open`);
  let guard = 0;
  while (next.phase === "learning" && guard++ < 100) {
    const step = lib.currentStep(next);
    next = lib.academyReducer(
      next,
      step.kind === "info"
        ? { type: "CONTINUE" }
        : { type: "EVENT", event: eventFor(step.expect) },
    );
  }
  assert.equal(next.phase, "quiz", `${moduleId} should end in its question`);
  const quiz = lib.getModule(moduleId).quiz;
  return lib.academyReducer(next, {
    type: "ANSWER",
    index: quiz.options.findIndex((option) => option.correct),
  });
}

test("every module can be completed by doing exactly what its steps ask", async () => {
  const lib = await load();
  let state = lib.createState();
  for (const id of lib.MODULE_ORDER) {
    state = playModule(lib, state, id);
    assert.equal(state.phase, "recap");
    assert.ok(state.completed.includes(id));
  }
  assert.deepEqual(state.completed, lib.MODULE_ORDER);
  assert.equal(
    lib.progressPercent({ ...state, phase: "idle", moduleId: null }),
    100,
  );
});

test("a wrong tap never advances a step, and the state object is untouched", async () => {
  const lib = await load();
  let state = lib.academyReducer(lib.createState(), { type: "BEGIN" });
  // tablero-1 is an information step: tapping buttons cannot skip it.
  assert.equal(lib.currentStep(state).kind, "info");
  assert.equal(
    lib.academyReducer(state, { type: "EVENT", event: { type: "accept" } }),
    state,
  );
  while (lib.currentStep(state).kind === "info")
    state = lib.academyReducer(state, { type: "CONTINUE" });
  const step = lib.currentStep(state);
  assert.equal(step.kind, "act");
  const wrong = { type: step.expect.type === "accept" ? "ready" : "accept" };
  assert.equal(
    lib.academyReducer(state, { type: "EVENT", event: wrong }),
    state,
  );
  // Right event, wrong detail (the $500 bill when $200 is expected).
  const flujo = lib.academyReducer(
    { ...state, completed: ["tablero"] },
    { type: "START_MODULE", moduleId: "flujo" },
  );
  let at = flujo;
  for (const event of [
    { type: "accept" },
    { type: "ready" },
    { type: "open-pay" },
  ])
    at = lib.academyReducer(at, { type: "EVENT", event });
  assert.equal(lib.currentStep(at).id, "flujo-4");
  assert.equal(
    lib.academyReducer(at, {
      type: "EVENT",
      event: { type: "tender", cents: 50000 },
    }),
    at,
  );
  assert.equal(
    lib.currentStep(
      lib.academyReducer(at, {
        type: "EVENT",
        event: { type: "tender", cents: 20000 },
      }),
    ).id,
    "flujo-5",
  );
});

test("new staff walk the modules in order; graduates can replay any of them", async () => {
  const lib = await load();
  const fresh = lib.createState();
  assert.equal(
    lib.academyReducer(fresh, { type: "START_MODULE", moduleId: "flujo" }),
    fresh,
  );
  assert.equal(lib.nextModuleId(fresh), "tablero");
  const afterFirst = playModule(lib, fresh, "tablero");
  assert.equal(lib.nextModuleId(afterFirst), "flujo");
  assert.equal(
    lib.academyReducer(afterFirst, {
      type: "START_MODULE",
      moduleId: "cierre",
    }),
    afterFirst,
  );
  const graduate = lib.createState({ trained: true });
  assert.equal(
    lib.academyReducer(graduate, { type: "START_MODULE", moduleId: "cierre" })
      .phase,
    "learning",
  );
});

test("a wrong quiz answer teaches instead of blocking, and only the right one completes the module", async () => {
  const lib = await load();
  let state = lib.createState();
  state = lib.academyReducer(state, {
    type: "START_MODULE",
    moduleId: "tablero",
  });
  while (state.phase === "learning") {
    const step = lib.currentStep(state);
    state = lib.academyReducer(
      state,
      step.kind === "info"
        ? { type: "CONTINUE" }
        : { type: "EVENT", event: eventFor(step.expect) },
    );
  }
  const quiz = lib.getModule("tablero").quiz;
  const wrong = quiz.options.findIndex((option) => !option.correct);
  const missed = lib.academyReducer(state, { type: "ANSWER", index: wrong });
  assert.equal(missed.phase, "quiz");
  assert.equal(missed.quizWrong, 1);
  assert.equal(missed.quizPick, wrong);
  assert.deepEqual(missed.completed, []);
  const right = lib.academyReducer(missed, {
    type: "ANSWER",
    index: quiz.options.findIndex((option) => option.correct),
  });
  assert.equal(right.phase, "recap");
  assert.deepEqual(right.completed, ["tablero"]);
});

test("the timed challenge and graduation need the required modules first", async () => {
  const lib = await load();
  const fresh = lib.createState();
  assert.equal(lib.academyReducer(fresh, { type: "START_RUSH" }), fresh);

  let state = fresh;
  for (const id of lib.REQUIRED_MODULES) state = playModule(lib, state, id);
  assert.equal(lib.requiredDone(state), true);
  assert.deepEqual(lib.pendingModules(state).required, []);
  assert.ok(lib.pendingModules(state).recommended.length > 0);

  const rush = lib.academyReducer(state, { type: "START_RUSH" });
  assert.equal(rush.phase, "rush");
  const failed = lib.academyReducer(rush, {
    type: "RUSH_RESULT",
    passed: false,
  });
  assert.equal(failed.phase, "rush");
  assert.equal(failed.rushPassed, false);
  assert.equal(lib.academyReducer(failed, { type: "GRADUATE" }).trained, false);

  const passed = lib.academyReducer(rush, {
    type: "RUSH_RESULT",
    passed: true,
  });
  assert.equal(passed.phase, "graduation");
  const graduated = lib.academyReducer(passed, { type: "GRADUATE" });
  assert.equal(graduated.trained, true);
  assert.equal(graduated.phase, "idle");
});

test("progress survives a reload, ignores junk, and an emergency skip never counts as graduating", async () => {
  const lib = await load();
  const memory = new Map();
  const storage = {
    get: (key) => memory.get(key) ?? null,
    set: (key, value) => memory.set(key, value),
  };

  assert.equal(
    lib.gateLocked(lib.readProgress(storage)),
    true,
    "a brand-new tablet is gated",
  );

  const state = playModule(lib, lib.createState(), "tablero");
  lib.writeProgress(storage, state);
  const restored = lib.readProgress(storage);
  assert.deepEqual(restored.completed, ["tablero"]);
  assert.equal(restored.trained, false);

  lib.recordSkip(storage, new Date("2026-10-07T12:00:00Z"));
  const skipped = lib.readProgress(storage);
  assert.equal(skipped.skipped, true);
  assert.equal(
    skipped.trained,
    false,
    "a skip must not claim the curriculum was passed",
  );
  assert.equal(memory.get(lib.STORAGE_KEYS.trained), undefined);
  assert.equal(lib.gateLocked(skipped), false);

  memory.set(lib.STORAGE_KEYS.progress, "{not json");
  assert.deepEqual(lib.readProgress(storage).completed, []);

  // A tablet that graduated under the first Academy keeps its till and gets reminders, not a lock.
  const legacy = new Map([[lib.STORAGE_KEYS.trained, "true"]]);
  const old = lib.readProgress({
    get: (key) => legacy.get(key) ?? null,
    set: () => {},
  });
  assert.equal(old.trained, true);
  assert.equal(lib.gateLocked(old), false);
  const oldState = lib.createState(old);
  assert.deepEqual(lib.pendingModules(oldState).required, [
    "tablero",
    "cobros",
  ]);
  memory.set(
    lib.STORAGE_KEYS.progress,
    JSON.stringify({
      completed: ["tablero", "no-such-module", 7],
      rushPassed: "yes",
    }),
  );
  const junk = lib.readProgress(storage);
  assert.deepEqual(junk.completed, ["tablero"]);
  assert.equal(junk.rushPassed, false);

  const graduated = lib.createState({
    completed: lib.REQUIRED_MODULES,
    rushPassed: true,
    trained: true,
  });
  lib.writeProgress(storage, graduated);
  assert.equal(memory.get(lib.STORAGE_KEYS.trained), "true");
});

test("the curriculum is well formed", async () => {
  const lib = await load();
  const ids = new Set();
  for (const module of lib.MODULES) {
    assert.ok(!ids.has(module.id), `duplicate module ${module.id}`);
    ids.add(module.id);
    assert.equal(
      module.quiz.options.filter((option) => option.correct).length,
      1,
      `${module.id} needs exactly one right answer`,
    );
    for (const option of module.quiz.options)
      assert.ok(option.explain.length > 10);
    assert.equal(module.takeaways.length, 3);
    module.steps.forEach((step, index) => {
      const resolved = lib.resolveStep(step, module, index, {
        item: "Huarache de Bistec",
      });
      assert.ok(resolved.target, `${step.id} has no target`);
      assert.ok(
        resolved.title && resolved.instruction,
        `${step.id} is missing text`,
      );
      assert.ok(
        resolved.consequence.length > 0,
        `${step.id} does not say what happens in the system`,
      );
      assert.ok(
        resolved.why.length > 0,
        `${step.id} does not say why it matters`,
      );
      assert.ok(
        !/\{item\}/.test(resolved.instruction),
        `${step.id} left a placeholder`,
      );
      if (step.kind === "act")
        assert.ok(
          step.expect,
          `${step.id} is an action step with no expected event`,
        );
      if (step.control)
        assert.ok(
          lib.glossaryEntry(step.control),
          `${step.id} points at a missing glossary entry`,
        );
    });
  }
  // Required modules come first, so the gate never makes anyone skip over a required one.
  const firstOptional = lib.MODULES.findIndex((module) => !module.required);
  assert.ok(
    lib.MODULES.slice(firstOptional).every((module) => !module.required),
  );
});

/** Every file whose strings a trainee could actually see on a screen. */
function sourceText() {
  const roots = [
    "apps/business-pos/src",
    "apps/client-web/src",
    "apps/analytics/src/content/realtime",
    "shared/ui",
    "shared/types",
  ];
  const chunks = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (
        /\.(tsx|ts|js)$/.test(entry.name) &&
        !full.includes(`${path.sep}academy${path.sep}`)
      )
        chunks.push(fs.readFileSync(full, "utf8"));
    }
  };
  roots.forEach((entry) => walk(path.join(root, entry)));
  return chunks.join("\n");
}

const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[….]+$/u, "")
    .trim();

test("every button label and customer message quoted in the training text exists in the app", async () => {
  const lib = await load();
  const source = normalize(sourceText());
  const texts = [];
  for (const entry of lib.GLOSSARY)
    texts.push(
      entry.purpose,
      entry.effect,
      entry.why,
      entry.watch ?? "",
      entry.label,
    );
  for (const module of lib.MODULES) {
    texts.push(
      module.subtitle,
      module.description,
      ...module.takeaways,
      module.quiz.question,
    );
    for (const option of module.quiz.options)
      texts.push(option.text, option.explain);
    for (const step of module.steps)
      texts.push(
        step.title,
        step.instruction,
        step.consequence ?? "",
        step.why ?? "",
      );
  }
  // Things staff type or customers say; they are quoted but are not on a screen.
  // «{item}» is the practice dish, checked against the real menu in the scenario tests.
  const spoken = new Set(["ana", "yo ya pagué", "{item}"]);
  const missing = new Set();
  for (const text of texts)
    for (const [, quoted] of text.matchAll(/«([^»]+)»/g)) {
      // Amounts are computed at runtime; check the wording that comes before them.
      const wording = normalize(
        quoted.split(/\$\d/)[0].replace(/ \/ /g, " / "),
      );
      if (!wording || spoken.has(wording) || /^\d/.test(wording)) continue;
      if (!source.includes(wording)) missing.add(quoted);
    }
  assert.deepEqual(
    [...missing],
    [],
    "training text quotes labels that no screen shows",
  );
});

/**
 * Source a trainee interacts with: every app file, including the practice board and the practice screens, but
 * never the three files that DEFINE the lessons (their `type: "…"` and ids would satisfy these checks trivially).
 */
function boardSource() {
  const definitions = new Set(["curriculum.js", "engine.js", "glossary.js"]);
  const chunks = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx|ts|js)$/.test(entry.name) && !definitions.has(entry.name))
        chunks.push(fs.readFileSync(full, "utf8"));
    }
  };
  for (const entry of [
    "apps/business-pos/src",
    "apps/client-web/src",
    "apps/analytics/src/content/realtime",
    "shared/ui",
  ])
    walk(path.join(root, entry));
  return chunks.join("\n");
}

test("every step spotlights a target the board really renders", async () => {
  const lib = await load();
  const source = boardSource();
  const exact = new Set();
  for (const [, value] of source.matchAll(/["'`]([a-z][a-z0-9-]*)["'`]/g))
    exact.add(value);
  // Targets built per item, like `tender-${preset}` or `table-card-${number}`.
  const prefixes = [...source.matchAll(/`([a-z][a-z0-9-]*-)\$\{/g)].map(
    (match) => match[1],
  );
  const missing = [];
  for (const module of lib.MODULES)
    for (const step of module.steps)
      if (
        !exact.has(step.target) &&
        !prefixes.some((prefix) => step.target.startsWith(prefix))
      )
        missing.push(`${step.id} → ${step.target}`);
  assert.deepEqual(
    missing,
    [],
    "these steps would spotlight nothing and strand the trainee",
  );
});

test("every event a step waits for is emitted somewhere in the app", async () => {
  const lib = await load();
  const source = boardSource();
  const missing = [];
  for (const module of lib.MODULES)
    for (const step of module.steps)
      if (
        step.kind === "act" &&
        // `type: "x"`, or a conditional such as `type: review ? "accept" : "ready"` (stops at the closing brace).
        !new RegExp(`type:[^}]*?["']${step.expect.type}["']`).test(source)
      )
        missing.push(`${step.id} waits for «${step.expect.type}»`);
  assert.deepEqual(missing, [], "these steps can never be completed");
});

test("every control marked data-help has a glossary entry, so explore mode can explain it", async () => {
  const lib = await load();
  const source = boardSource();
  const missing = [
    ...new Set(
      [...source.matchAll(/data-help="([^"]+)"/g)].map((match) => match[1]),
    ),
  ].filter((id) => !lib.glossaryEntry(id));
  assert.deepEqual(missing, [], "explore mode would show nothing for these");
});

test("the exam is offered as soon as the required modules are done, not after every optional one", async () => {
  const lib = await load();
  let state = lib.createState();
  assert.equal(lib.rushOffered(state), false);
  for (const id of lib.REQUIRED_MODULES) {
    assert.equal(lib.rushOffered(state), false, `not before ${id}`);
    state = playModule(lib, state, id);
  }
  // Optional modules are still pending, yet the recap must already be able to offer the Reto Almuerzo.
  assert.ok(lib.nextModuleId(state) !== null, "optional modules remain");
  assert.equal(lib.rushOffered(state), true);
  // Passing it ends the offer; it is never offered to a tablet that already passed.
  assert.equal(lib.rushOffered({ ...state, rushPassed: true }), false);
  assert.equal(lib.rushOffered(lib.createState({ completed: lib.REQUIRED_MODULES.slice(0, -1) })), false);
});
