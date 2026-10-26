// Runtime game state and shared helpers (browser and server engine).
// `state` is a var so the server engine can swap it per request (ctx.state = ...).

var state = null;

function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function randRange(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(p) { return Math.random() < p; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
// Money is kept to the nearest $1K (engine amounts are $M) so 1930s-sized sums stay exact
function roundMoney(n) { return Math.round(n * 1000) / 1000; }
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

// --- calendar & inflation ---------------------------------------------------------------------
// Fictional games run in today's dollars. Real-history games start in settings.startYear and walk
// through real calendar quarters; money is shown in that quarter's dollars using the BLS CPI-U.

function isHistorical() { return !!(state && state.settings && state.settings.startYear); }

function calendarOf(q = state.quarter) {
  const year = state.settings.startYear + Math.floor(q / 4);
  return { year, qtr: q % 4, key: `${year}-Q${(q % 4) + 1}` };
}

function quarterIndexOfKey(key) {
  const [y, qn] = key.split("-Q");
  return Number(y) * 4 + Number(qn) - 1;
}

// CPI for a calendar quarter. After the last published quarter it is projected forward at the
// average quarterly rate of the previous ten years; before 1913 it is held at the first value.
function cpiForKey(key) {
  if (CPI_QUARTERLY[key] !== undefined) return CPI_QUARTERLY[key];
  const idx = quarterIndexOfKey(key);
  const last = quarterIndexOfKey(CPI_LAST);
  if (idx < quarterIndexOfKey(CPI_FIRST)) return CPI_QUARTERLY[CPI_FIRST];
  const base = CPI_QUARTERLY[CPI_LAST];
  const tenYearsBack = `${Math.floor((last - 40) / 4)}-Q${((last - 40) % 4) + 1}`;
  const perQuarter = Math.pow(base / CPI_QUARTERLY[tenYearsBack], 1 / 40);
  return base * Math.pow(perQuarter, idx - last);
}
function isProjectedCpi(q = state.quarter) {
  return isHistorical() && quarterIndexOfKey(calendarOf(q).key) > quarterIndexOfKey(CPI_LAST);
}

// Multiply today's dollars by this to get the dollars of quarter q
function priceLevel(q = state ? state.quarter : 0) {
  if (!isHistorical()) return 1;
  return cpiForKey(calendarOf(q).key) / CPI_QUARTERLY[CPI_LAST];
}

// Engine amounts are $M in today's dollars; shown in the dollars of the quarter being played.
// opts.today: show in today's dollars instead.
function fmtMoney(n, opts = {}) {
  const v = n * (opts.today ? 1 : priceLevel());
  const abs = Math.abs(v);
  const trim = (s) => s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  let s;
  if (abs >= 1000) s = `$${trim((abs / 1000).toFixed(2))}B`;
  else if (abs >= 100) s = `$${Math.round(abs)}M`;
  else if (abs >= 1) s = `$${trim(abs.toFixed(1))}M`;
  else if (abs >= 0.001) s = `$${Math.round(abs * 1000)}K`;
  else s = `$${Math.round(abs * 1e6).toLocaleString("en-US")}`;
  return (v < 0 && s !== "$0" ? "-" : "") + s;
}

function newId(prefix) { return `${prefix}${state.nextId++}`; }

function quarterLabel(q) {
  if (isHistorical()) return `${calendarOf(q).year} ${QUARTERS[q % 4].short} ${QUARTERS[q % 4].name}`;
  return `Y${Math.floor(q / 4) + 1} ${QUARTERS[q % 4].short} ${QUARTERS[q % 4].name}`;
}
function seasonOf(q) { return q % 4; }
// Endless games have no last quarter (totalQuarters is null)
function isEndless() { return state.totalQuarters == null; }
function quartersRemaining() { return isEndless() ? 99 : state.totalQuarters - 1 - state.quarter; }
function isLastQuarter(q = state.quarter) { return !isEndless() && q >= state.totalQuarters - 1; }

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
  return roundMoney(p.cash - p.debt + p.prestige * PRESTIGE_VALUE + p.lifetimeGross * LIBRARY_RATE);
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
