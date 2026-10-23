// Runtime game state and shared helpers (browser and server engine).
// `state` is a var so the server engine can swap it per request (ctx.state = ...).

var state = null;

function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function randRange(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(p) { return Math.random() < p; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function round1(n) { return Math.round(n * 10) / 10; }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function weightedPick(items, weightOf) {
  const total = items.reduce((n, it) => n + weightOf(it), 0);
  let r = Math.random() * total;
  for (const it of items) { r -= weightOf(it); if (r <= 0) return it; }
  return items[items.length - 1];
}

function fmtMoney(n) {
  const v = round1(n);
  const abs = Math.abs(v);
  const s = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${v < 0 ? "-" : ""}$${s}M`;
}

function newId(prefix) { return `${prefix}${state.nextId++}`; }

function quarterLabel(q) {
  return `Y${Math.floor(q / 4) + 1} ${QUARTERS[q % 4].short} ${QUARTERS[q % 4].name}`;
}
function seasonOf(q) { return q % 4; }
function quartersRemaining() { return state.totalQuarters - 1 - state.quarter; }

function logLine(text, pi = null, cls = "") {
  state.log.push({ q: state.quarter, text, pi, cls });
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}

// --- lookups -----------------------------------------------------------------

function talentById(id) { return id ? state.talent[id] : null; }
function writerById(id) { return id ? state.writers[id] : null; }
function locationById(id) { return id ? LOCATIONS.find((l) => l.id === id) || null : null; }

function findProject(id) {
  for (let pi = 0; pi < state.players.length; pi++) {
    const f = state.players[pi].projects.find((p) => p.id === id);
    if (f) return { project: f, pi };
  }
  return null;
}

function allProjects() {
  const out = [];
  state.players.forEach((p, pi) => p.projects.forEach((f) => out.push({ project: f, pi })));
  return out;
}

// Talent ids attached to a project, director first
function attachedTalentIds(f) {
  return [f.director, ...f.cast].filter(Boolean);
}

function isActive(f) { return f.status !== STATUS.LIBRARY; }

function studioValue(p) {
  return round1(p.cash - p.debt + p.prestige * PRESTIGE_VALUE + p.lifetimeGross * LIBRARY_RATE);
}

function apFor(pi) {
  const p = state.players[pi];
  const stars = new Set(p.roster.filter((id) => talentById(id)?.role === "STAR"));
  for (const f of p.projects) {
    if (f.status === STATUS.DEV || f.status === STATUS.FILMING) f.cast.forEach((id) => id && stars.add(id));
  }
  const aList = [...stars].filter((id) => talentById(id).fame >= A_LIST_FAME).length;
  return BASE_AP + Math.min(MAX_BONUS_AP, aList);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
