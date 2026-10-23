// Engine API shared by the browser (local games) and the server (online games).
// Everything here works on the global `state`.

function createGame(config) {
  newGameState(config);
  beginQuarter();
  settle();
  return state;
}

function allReady() { return state.players.every((p) => p.ready); }

// Resolve quarters for as long as everyone is ready (all-AI tables chain straight through)
function settle() {
  for (let n = 0; n < 100 && state.phase === "PLANNING" && allReady(); n++) resolveQuarter();
}

function applyAction(pi, action) {
  const result = performAction(pi, action);
  if (result.ok) settle();
  return result;
}

// Planning timer: when it runs out, everyone still planning is marked ready
function checkTimer(now) {
  if (state.phase !== "PLANNING" || !state.planningDeadline || now < state.planningDeadline) return false;
  state.players.forEach((p) => { if (!p.ready) { p.ready = true; logLine(`Time's up for ${p.studio}.`, p.index); } });
  state.version++;
  settle();
  return true;
}

function playerIndexBySession(sessionId) {
  return state.players.findIndex((p) => p.sessionId && p.sessionId === sessionId);
}

// A player left: their studio is run by the AI from now on
function aiTakeOver(pi) {
  const p = state.players[pi];
  if (!p || p.ai) return;
  p.ai = true;
  p.left = true;
  p.aiStyle = p.aiStyle || "BALANCED";
  logLine(`${p.name} left. The board installs an AI caretaker at ${p.studio}.`, pi, "warn");
  if (state.phase === "PLANNING" && !p.ready) aiPlan(pi);
  state.version++;
  settle();
}

function humanReturns(pi) {
  const p = state.players[pi];
  if (!p || !p.left) return;
  p.ai = false;
  p.left = false;
  logLine(`${p.name} is back in charge of ${p.studio}.`, pi);
  state.version++;
}

// What a given player is allowed to see: their own sealed offers and hand only
function redactStateFor(pi) {
  const s = JSON.parse(JSON.stringify(state));
  s.offers = s.offers.filter((o) => o.pi === pi);
  s.players.forEach((p, i) => {
    p.handCount = p.hand.length;
    if (i !== pi) {
      p.hand = [];
      if (p.sessionId) p.sessionId = "hidden"; // session ids authorize actions; never share them
    }
  });
  if (s.lastReport) s.lastReport.deals = s.lastReport.deals.filter((d) => d.pi === pi);
  delete s.scandalDeck;
  return s;
}
