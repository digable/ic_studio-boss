// Loads the shared game rules (the same files the browser loads) into a vm context,
// so the server is the single authority for online games.
//
//   const { withState } = require("./_engine");
//   const result = withState(session.state, (g) => g.applyAction(pi, action));
//
// withState() swaps the given state in, runs fn, and returns fn's result. The state
// object is mutated in place; persist it afterwards.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

// Keep in sync with the logic <script> tags in index.html
const LOGIC_SCRIPTS = [
  "scripts/constants.js",
  "scripts/core.js",
  "scripts/data/names.js",
  "scripts/data/locations.js",
  "scripts/data/events.js",
  "scripts/data/scandals.js",
  "scripts/rules/appeal.js",
  "scripts/rules/quality.js",
  "scripts/rules/boxoffice.js",
  "scripts/actions/setup.js",
  "scripts/actions/planning.js",
  "scripts/actions/resolve.js",
  "scripts/actions/ai.js",
  "scripts/actions/engine.js"
];

function loadEngine() {
  const ctx = vm.createContext({ console });
  for (const file of LOGIC_SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx, { filename: file });
  }
  return ctx;
}

const engine = loadEngine();

function withState(gameState, fn) {
  engine.state = gameState;
  try {
    return fn(engine);
  } finally {
    engine.state = null;
  }
}

module.exports = { engine, withState, loadEngine, LOGIC_SCRIPTS };
