// Browser session: who is viewing, and how actions are sent.
//   local  — the engine runs in this tab (solo vs AI, or hot-seat with a pass screen)
//   online — actions go to the server, which owns the state (multiplayer.js)

const client = {
  mode: null,              // "local" | "online"
  viewer: 0,               // player index whose studio this screen shows
  lastReportQuarter: null, // last quarter report shown in the results dialog
  busy: false,
  studioView: "active",    // "active" | "library"
  tab: "studio"
};

function me() { return state ? state.players[client.viewer] : null; }
function isOnline() { return client.mode === "online"; }
function humanIndexes() { return state.players.map((p, i) => (p.ai ? -1 : i)).filter((i) => i >= 0); }
function isHotSeat() { return client.mode === "local" && humanIndexes().length > 1; }

let toastTimer = null;
function toast(msg, isError = false) {
  const el = document.getElementById("toast");
  if (!el || !msg) return;
  el.textContent = msg;
  el.classList.toggle("toast--error", isError);
  el.classList.add("toast--visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("toast--visible"), isError ? 4500 : 3000);
}

async function act(action) {
  if (!state || client.busy) return;
  if (isOnline()) {
    client.busy = true;
    try {
      const r = await mpSendAction(action);
      if (r.state) applyServerState(r.state, true);
      toast(r.msg, !r.ok);
    } catch (e) {
      toast(e.message || "Couldn't reach the server.", true);
    } finally {
      client.busy = false;
    }
  } else {
    const quarterBefore = state.quarter;
    const r = applyAction(client.viewer, action);
    toast(r.ok && state.quarter !== quarterBefore ? `${quarterLabel(state.quarter)} begins.` : r.msg, !r.ok);
    if (r.ok) afterLocalChange(quarterBefore);
  }
  render();
}

function afterLocalChange(quarterBefore) {
  saveLocal();
  const newQuarter = state.quarter !== quarterBefore || state.phase === "GAME_OVER";
  if (newQuarter) {
    client.viewer = humanIndexes()[0] ?? 0;
    maybeShowResults();
    return;
  }
  // Hot-seat: once this player is ready, hand the device to the next human still planning
  if (me().ready) {
    const next = humanIndexes().find((i) => !state.players[i].ready);
    if (next !== undefined && next !== client.viewer) {
      client.viewer = next;
      showPassScreen(next);
    }
  }
}

function maybeShowResults() {
  const r = state?.lastReport;
  if (!r || r.quarter === client.lastReportQuarter) return;
  client.lastReportQuarter = r.quarter;
  client.passAfterResults = true;
  openResultsDialog();
}

// Called when the results dialog closes
function afterResultsClosed() {
  if (!client.passAfterResults) return;
  client.passAfterResults = false;
  if (isHotSeat() && state.phase === "PLANNING") showPassScreen(client.viewer);
}

function startLocalGame(config) {
  createGame(config);
  client.mode = "local";
  client.viewer = humanIndexes()[0] ?? 0;
  client.lastReportQuarter = null;
  saveLocal();
  enterGameScreen();
  if (isHotSeat()) showPassScreen(client.viewer);
}

function enterGameScreen() {
  document.getElementById("titleScreen").classList.add("hidden");
  document.getElementById("gameScreen").classList.remove("hidden");
  document.getElementById("mobileTabs").classList.remove("hidden");
  document.getElementById("quitBtn").classList.remove("hidden");
  setTab("studio");
  render();
}

function exitToTitle() {
  state = null;
  client.mode = null;
  document.getElementById("gameScreen").classList.add("hidden");
  document.getElementById("mobileTabs").classList.add("hidden");
  document.getElementById("quitBtn").classList.add("hidden");
  document.getElementById("roomCode").classList.add("hidden");
  document.getElementById("titleScreen").classList.remove("hidden");
  document.getElementById("topbarStatus").textContent = "Run a movie studio. Out-deal your rivals.";
  refreshTitleScreen();
}

function setTab(tab) {
  client.tab = tab;
  document.body.dataset.tab = tab;
  document.querySelectorAll(".mobile-tab-btn").forEach((b) => b.classList.toggle("mobile-tab-btn--active", b.dataset.tab === tab));
}
