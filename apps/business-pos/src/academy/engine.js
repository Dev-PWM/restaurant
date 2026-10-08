// @ts-check
"use strict";

import {
  MODULES,
  MODULE_ORDER,
  REQUIRED_MODULES,
  TOTAL_STEPS,
  getModule,
  resolveStep,
} from "./curriculum.js";

/**
 * The Academy state machine. It is a pure reducer: no React, no timers and no
 * storage, so every path through the curriculum can be replayed in a unit test and
 * nothing in here can ever reach the live ledger or the socket.
 *
 * @typedef {import("./curriculum.js").ModuleId} ModuleId
 * @typedef {import("./curriculum.js").AcademyEvent} AcademyEvent
 * @typedef {import("./curriculum.js").ResolvedStep} ResolvedStep
 * @typedef {import("./curriculum.js").Expectation} Expectation
 *
 * @typedef {"idle"|"menu"|"learning"|"quiz"|"recap"|"rush"|"graduation"} Phase
 *
 * @typedef {Object} AcademyState
 * @property {Phase} phase
 * @property {ModuleId | null} moduleId   The module in progress (or just finished, in recap).
 * @property {number} stepIndex
 * @property {number} runId              Bumps whenever a module (re)starts, so the board can reseed its practice tickets.
 * @property {ModuleId[]} completed
 * @property {boolean} rushPassed
 * @property {boolean} trained           Graduated: the live till is unlocked for good.
 * @property {number} quizWrong          Wrong answers on the current question.
 * @property {number | null} quizPick    Last wrong option, to show its explanation.
 *
 * @typedef {{type: "BEGIN"} | {type: "OPEN_MENU"} | {type: "RESUME"}
 *   | {type: "CLOSE"} | {type: "START_MODULE", moduleId: ModuleId} | {type: "RESET_MODULE"}
 *   | {type: "EVENT", event: AcademyEvent} | {type: "CONTINUE"}
 *   | {type: "ANSWER", index: number}
 *   | {type: "START_RUSH"} | {type: "RUSH_RESULT", passed: boolean}
 *   | {type: "GRADUATE"} | {type: "RESTART"}} AcademyAction
 */

export const STORAGE_KEYS = Object.freeze({
  /** «true» once the curriculum was passed. Kept as the documented flag. */
  trained: "masaflow_trained",
  progress: "masaflow_academy_progress",
  /** ISO date of an emergency skip. Never written as «trained». */
  skipped: "masaflow_training_skipped",
});

/** @typedef {{get: (key: string) => string | null, set: (key: string, value: string | null) => unknown}} Storage */

/**
 * @param {{completed?: unknown, rushPassed?: unknown, trained?: unknown}} [progress]
 * @returns {AcademyState}
 */
export function createState(progress = {}) {
  const completed = Array.isArray(progress.completed)
    ? /** @type {ModuleId[]} */ (
        progress.completed.filter((id) => MODULE_ORDER.includes(id))
      )
    : [];
  return {
    phase: "idle",
    moduleId: null,
    stepIndex: 0,
    runId: 0,
    completed,
    rushPassed: progress.rushPassed === true,
    trained: progress.trained === true,
    quizWrong: 0,
    quizPick: null,
  };
}

/** @param {AcademyState} state */
export function requiredDone(state) {
  return REQUIRED_MODULES.every((id) => state.completed.includes(id));
}

/**
 * Is the timed challenge on offer? As soon as the required modules are done, not only after every optional one:
 * the exam is what graduates a tablet, and the recap must not bury it behind a long chain of optional lessons.
 * @param {AcademyState} state
 */
export function rushOffered(state) {
  return requiredDone(state) && !state.rushPassed;
}

/**
 * A module is open when the tablet already graduated, or when every module before
 * it is finished. New staff therefore walk the curriculum in order; anyone who
 * graduated can replay any module.
 *
 * @param {AcademyState} state @param {ModuleId} moduleId
 */
export function isAvailable(state, moduleId) {
  if (state.trained) return true;
  const index = MODULE_ORDER.indexOf(moduleId);
  if (index < 0) return false;
  return MODULE_ORDER.slice(0, index).every((id) =>
    state.completed.includes(id),
  );
}

/** First module that is still to do and open, or null. @param {AcademyState} state @returns {ModuleId | null} */
export function nextModuleId(state) {
  return (
    MODULE_ORDER.find(
      (id) => !state.completed.includes(id) && isAvailable(state, id),
    ) ?? null
  );
}

/**
 * Does a UI event satisfy an expectation? Every key must match; a `test`
 * function can add a condition the keys cannot express (e.g. «typed at least 2 letters»).
 *
 * @param {Expectation | undefined} expect @param {AcademyEvent} event
 */
export function eventMatches(expect, event) {
  if (!expect || expect.type !== event.type) return false;
  for (const [key, value] of Object.entries(expect)) {
    if (key === "type" || key === "test") continue;
    if (event[key] !== value) return false;
  }
  return typeof expect.test === "function" ? expect.test(event) : true;
}

/** @param {AcademyState} state @param {{item?: string}} [context] @returns {ResolvedStep | null} */
export function currentStep(state, context) {
  if (state.phase !== "learning" || !state.moduleId) return null;
  const module = getModule(state.moduleId);
  const step = module?.steps[state.stepIndex];
  return module && step
    ? resolveStep(step, module, state.stepIndex, context)
    : null;
}

/** Share of all steps done, 0–100. @param {AcademyState} state */
export function progressPercent(state) {
  let done = 0;
  for (const module of MODULES) {
    if (state.completed.includes(module.id)) done += module.steps.length;
    else if (module.id === state.moduleId && state.phase !== "idle")
      done += state.stepIndex;
  }
  return Math.round((done / TOTAL_STEPS) * 100);
}

/** @param {AcademyState} state */
export function pendingModules(state) {
  const todo = MODULES.filter((module) => !state.completed.includes(module.id));
  return {
    required: todo
      .filter((module) => module.required)
      .map((module) => module.id),
    recommended: todo
      .filter((module) => !module.required)
      .map((module) => module.id),
  };
}

/** @param {AcademyState} state @returns {AcademyState} */
function finishSteps(state) {
  return { ...state, phase: "quiz", quizWrong: 0, quizPick: null };
}

/** @param {AcademyState} state @returns {AcademyState} */
function completeModule(state) {
  const completed =
    state.moduleId && !state.completed.includes(state.moduleId)
      ? [...state.completed, state.moduleId]
      : state.completed;
  return { ...state, phase: "recap", completed, quizWrong: 0, quizPick: null };
}

/** @param {AcademyState} state @returns {AcademyState} */
function advance(state) {
  const module = state.moduleId ? getModule(state.moduleId) : undefined;
  if (!module) return state;
  return state.stepIndex + 1 < module.steps.length
    ? { ...state, stepIndex: state.stepIndex + 1 }
    : finishSteps(state);
}

/** @param {AcademyState} state @param {ModuleId} moduleId @returns {AcademyState} */
function startModule(state, moduleId) {
  if (!isAvailable(state, moduleId) || !getModule(moduleId)) return state;
  return {
    ...state,
    phase: "learning",
    moduleId,
    stepIndex: 0,
    runId: state.runId + 1,
    quizWrong: 0,
    quizPick: null,
  };
}

/**
 * @param {AcademyState} state
 * @param {AcademyAction} action
 * @returns {AcademyState} The same object when the action changes nothing.
 */
export function academyReducer(state, action) {
  switch (action.type) {
    case "BEGIN": {
      const next = nextModuleId(state) ?? MODULE_ORDER[0];
      return startModule(state, next);
    }
    case "OPEN_MENU":
      return state.phase === "menu" ? state : { ...state, phase: "menu" };
    case "CLOSE":
      return state.phase === "idle"
        ? state
        : {
            ...state,
            phase: "idle",
            moduleId: null,
            stepIndex: 0,
            quizWrong: 0,
            quizPick: null,
          };
    case "RESUME":
      return state.phase === "menu" && state.moduleId
        ? { ...state, phase: "learning" }
        : state;
    case "START_MODULE":
      return startModule(state, action.moduleId);
    case "RESET_MODULE":
      return state.moduleId ? startModule(state, state.moduleId) : state;
    case "EVENT": {
      if (state.phase !== "learning") return state;
      const step = currentStep(state);
      if (
        !step ||
        step.kind !== "act" ||
        !eventMatches(step.expect, action.event)
      )
        return state;
      return advance(state);
    }
    case "CONTINUE": {
      if (state.phase === "learning") {
        const step = currentStep(state);
        return step?.kind === "info" ? advance(state) : state;
      }
      if (state.phase === "recap") {
        const next = nextModuleId(state);
        return next ? startModule(state, next) : { ...state, phase: "menu" };
      }
      return state;
    }
    case "ANSWER": {
      if (state.phase !== "quiz" || !state.moduleId) return state;
      const option = getModule(state.moduleId)?.quiz.options[action.index];
      if (!option) return state;
      return option.correct
        ? completeModule(state)
        : { ...state, quizWrong: state.quizWrong + 1, quizPick: action.index };
    }
    case "START_RUSH":
      return requiredDone(state)
        ? { ...state, phase: "rush", runId: state.runId + 1 }
        : state;
    case "RUSH_RESULT":
      if (state.phase !== "rush") return state;
      return action.passed
        ? { ...state, rushPassed: true, phase: "graduation" }
        : state;
    case "GRADUATE":
      return state.rushPassed && requiredDone(state)
        ? { ...state, trained: true, phase: "idle", moduleId: null }
        : state;
    case "RESTART":
      return startModule(
        { ...state, completed: [], rushPassed: false },
        MODULE_ORDER[0],
      );
    default:
      return state;
  }
}

/**
 * Tablets that graduated under the first Academy only have the «trained» flag. They keep
 * the live till, and are credited with the modules that existed then; the modules added
 * since show up as pending reminders instead of locking anyone out.
 * @type {ModuleId[]}
 */
const FIRST_ACADEMY_MODULES = [
  "flujo",
  "exigente",
  "errores",
  "panico",
  "cierre",
];

/** @param {Storage} storage @returns {{completed: ModuleId[], rushPassed: boolean, trained: boolean, skipped: boolean}} */
export function readProgress(storage) {
  /** @type {{completed?: unknown, rushPassed?: unknown}} */
  let saved = {};
  let hasProgress = false;
  try {
    const raw = storage.get(STORAGE_KEYS.progress);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        saved = parsed;
        hasProgress = true;
      }
    }
  } catch {
    saved = {};
  }
  const trained = storage.get(STORAGE_KEYS.trained) === "true";
  const state = createState(
    trained && !hasProgress
      ? { completed: FIRST_ACADEMY_MODULES, rushPassed: true, trained }
      : { ...saved, trained },
  );
  return {
    completed: state.completed,
    rushPassed: state.rushPassed,
    trained: state.trained,
    skipped: Boolean(storage.get(STORAGE_KEYS.skipped)),
  };
}

/** Persists what must survive a reload. @param {Storage} storage @param {AcademyState} state */
export function writeProgress(storage, state) {
  storage.set(
    STORAGE_KEYS.progress,
    JSON.stringify({
      v: 1,
      completed: state.completed,
      rushPassed: state.rushPassed,
    }),
  );
  if (state.trained) storage.set(STORAGE_KEYS.trained, "true");
}

/** Records an emergency skip without ever claiming the curriculum was passed. @param {Storage} storage @param {Date} [now] */
export function recordSkip(storage, now = new Date()) {
  storage.set(STORAGE_KEYS.skipped, now.toISOString());
}

/**
 * Is the live till locked behind training on this tablet? Graduating or an emergency
 * skip both open it; the skip leaves a reminder instead of a graduation.
 *
 * @param {{trained: boolean, skipped: boolean}} progress
 */
export function gateLocked(progress) {
  return !progress.trained && !progress.skipped;
}
