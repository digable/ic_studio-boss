// ---------------------------------------------------------------------------
// Online multiplayer — the server owns the game state.
// Clients send actions (POST /action) and poll for everyone else's changes.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 1500;
const API_BASE = "/api/games";

const mp = {
  code: null,
  playerId: null,
  hostId: null,
  isHost: false,
  pollInterval: null,
  inGame: false
};

function getOrCreateDeviceId() {
  let id = sessionStorage.getItem("sb_deviceId");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("sb_deviceId", id);
  }
  return id;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw Object.assign(new Error("Online play needs the game server (npm start)."), { status: 404 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: res.status, data });
  return data;
}

function setOnlineStatus(msg, isError = false) {
  const el = document.getElementById("onlineStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("bad", isError);
}

function inviteUrl() {
  return `${location.origin}${location.pathname}?game=${encodeURIComponent(mp.code)}`;
}

function rememberSession() {
  sessionStorage.setItem("sb_mp_code", mp.code);
  sessionStorage.setItem("sb_mp_playerId", mp.playerId);
  if (mp.hostId) sessionStorage.setItem("sb_mp_hostId", mp.hostId);
}
function forgetSession() {
  ["sb_mp_code", "sb_mp_playerId", "sb_mp_hostId"].forEach((k) => sessionStorage.removeItem(k));
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

function showLobby() {
  document.getElementById("onlineMenu").classList.add("hidden");
  document.getElementById("lobby").classList.remove("hidden");
  document.getElementById("lobbyCode").textContent = mp.code;
  document.getElementById("lobbyHostSettings").classList.toggle("hidden", !mp.isHost);
  document.getElementById("lobbyWaiting").classList.toggle("hidden", mp.isHost);
}

function showOnlineMenu() {
  document.getElementById("onlineMenu").classList.remove("hidden");
  document.getElementById("lobby").classList.add("hidden");
}

function renderLobby(session) {
  const list = document.getElementById("lobbyPlayers");
  list.innerHTML = session.players.length
    ? session.players.map((p) => `<li>${escapeHtml(p.name)}${p.you ? " <span class=\"muted\">(you)</span>" : ""}</li>`).join("")
    : "<li class=\"muted\">Waiting for players…</li>";
  const aiSel = document.getElementById("onlineAi");
  const max = MAX_PLAYERS - session.players.length;
  const current = Math.min(Number(aiSel.value) || 0, max);
  aiSel.innerHTML = Array.from({ length: max + 1 }, (_, i) => `<option value="${i}" ${i === current ? "selected" : ""}>${i}</option>`).join("");
}

async function createOnlineGame() {
  const displayName = document.getElementById("hostName").value.trim();
  if (!displayName) return setOnlineStatus("Enter your name first.", true);
  const btn = document.getElementById("createOnline");
  btn.disabled = true;
  setOnlineStatus("Creating game…");
  try {
    const deviceId = getOrCreateDeviceId();
    const { code, hostId } = await apiFetch(API_BASE, { method: "POST" });
    const { playerId } = await apiFetch(`${API_BASE}/${code}/join`, { method: "POST", body: { displayName, deviceId } });
    Object.assign(mp, { code, playerId, hostId, isHost: true, inGame: false });
    rememberSession();
    showLobby();
    setOnlineStatus("Share the code or invite link with your rivals.");
    renderLobby({ players: [{ name: displayName, you: true }] });
    startPolling();
  } catch (e) {
    setOnlineStatus(e.message || "Failed to create game.", true);
  } finally {
    btn.disabled = false;
  }
}

async function joinOnlineGame() {
  const code = document.getElementById("joinCode").value.trim().toUpperCase();
  const displayName = document.getElementById("joinName").value.trim();
  if (code.length !== 4) return setOnlineStatus("Enter the 4-character game code.", true);
  if (!displayName) return setOnlineStatus("Enter your name first.", true);
  const btn = document.getElementById("joinOnline");
  btn.disabled = true;
  setOnlineStatus("Joining…");
  try {
    const deviceId = getOrCreateDeviceId();
    const { playerId, rejoined } = await apiFetch(`${API_BASE}/${code}/join`, { method: "POST", body: { displayName, deviceId } });
    const savedHost = sessionStorage.getItem("sb_mp_code") === code ? sessionStorage.getItem("sb_mp_hostId") : null;
    Object.assign(mp, { code, playerId, hostId: savedHost, isHost: !!savedHost, inGame: false });
    rememberSession();
    showLobby();
    setOnlineStatus(rejoined ? "Rejoined." : "Joined! Waiting for the host to start.");
    await pollOnce();
    startPolling();
  } catch (e) {
    setOnlineStatus(e.message || "Failed to join.", true);
  } finally {
    btn.disabled = false;
  }
}

async function startOnlineGame() {
  if (!mp.isHost) return;
  const btn = document.getElementById("startOnline");
  btn.disabled = true;
  setOnlineStatus("Starting…");
  try {
    await apiFetch(`${API_BASE}/${mp.code}/start`, {
      method: "POST",
      body: {
        hostId: mp.hostId,
        settings: {
          aiCount: Number(document.getElementById("onlineAi").value) || 0,
          length: document.getElementById("onlineLength").value,
          timer: Number(document.getElementById("onlineTimer").value) || 0,
          scandals: document.getElementById("onlineScandals").checked,
          startYear: eraStartYear("online")
        }
      }
    });
    await pollOnce();
  } catch (e) {
    setOnlineStatus(e.message || "Failed to start.", true);
  } finally {
    btn.disabled = false;
  }
}

async function leaveOnlineGame() {
  stopPolling();
  if (mp.code) {
    try { await apiFetch(`${API_BASE}/${mp.code}/leave`, { method: "POST", body: { playerId: mp.playerId } }); }
    catch { /* best-effort */ }
  }
  forgetSession();
  Object.assign(mp, { code: null, playerId: null, hostId: null, isHost: false, inGame: false });
  showOnlineMenu();
  setOnlineStatus("");
  if (state) exitToTitle();
}

// ---------------------------------------------------------------------------
// In game
// ---------------------------------------------------------------------------

async function mpSendAction(action) {
  return apiFetch(`${API_BASE}/${mp.code}/action`, { method: "POST", body: { playerId: mp.playerId, action } });
}

// Take the server's view if it's newer than ours
function applyServerState(s, force = false) {
  if (!s) return;
  if (!force && state && s.version <= state.version && s.quarter === state.quarter) return;
  state = s;
  const pi = state.players.findIndex((p) => p.sessionId === mp.playerId);
  client.viewer = pi >= 0 ? pi : 0;
  if (!mp.inGame) {
    mp.inGame = true;
    client.mode = "online";
    client.lastReportQuarter = state.lastReport?.quarter ?? null;
    client.shownFinal = false;
    const rc = document.getElementById("roomCode");
    rc.textContent = `Room ${mp.code}`;
    rc.classList.remove("hidden");
    enterGameScreen();
  }
  maybeShowResults();
}

function startPolling() {
  stopPolling();
  mp.pollInterval = setInterval(pollOnce, POLL_INTERVAL_MS);
}
function stopPolling() {
  if (mp.pollInterval) clearInterval(mp.pollInterval);
  mp.pollInterval = null;
}

async function pollOnce() {
  if (!mp.code) return;
  try {
    const session = await apiFetch(`${API_BASE}/${mp.code}?playerId=${encodeURIComponent(mp.playerId)}`);
    if (session.status === "lobby") {
      renderLobby(session);
      return;
    }
    if (!session.state) return;
    if (client.busy) return; // our own action is in flight; its response carries the state
    const before = state?.version;
    applyServerState(session.state);
    if (state && state.version !== before) render();
    if (session.status === "done") stopPolling();
  } catch (e) {
    if (e.status === 404) {
      stopPolling();
      setOnlineStatus("That game no longer exists.", true);
      forgetSession();
    } else {
      console.warn("poll failed:", e.message);
    }
  }
}

// Invite links (?game=CODE) and page reloads go straight back to the game
function tryAutoRejoin() {
  const urlCode = new URLSearchParams(location.search).get("game")?.toUpperCase();
  const savedCode = sessionStorage.getItem("sb_mp_code");
  const code = urlCode || savedCode;
  if (!code) return;

  document.getElementById("joinCode").value = code;
  if (urlCode) {
    document.getElementById("createSection").classList.add("hidden");
    document.getElementById("joinCodeRow").classList.add("hidden");
    const note = document.getElementById("inviteNote");
    note.textContent = `You've been invited to game ${code}. Enter your name to join.`;
    note.classList.remove("hidden");
    document.getElementById("joinName").focus();
  }
  // Same tab reloaded: we still hold our player id, so resume without re-entering a name
  if (savedCode === code && sessionStorage.getItem("sb_mp_playerId")) {
    Object.assign(mp, {
      code,
      playerId: sessionStorage.getItem("sb_mp_playerId"),
      hostId: sessionStorage.getItem("sb_mp_hostId"),
      isHost: !!sessionStorage.getItem("sb_mp_hostId"),
      inGame: false
    });
    showLobby();
    setOnlineStatus("Reconnecting…");
    pollOnce().then(startPolling);
  }
}
