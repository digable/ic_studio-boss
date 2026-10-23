// Event wiring and boot. Buttons carry data-act="..." and are handled by one delegated listener.

function selectValue(attr, id) {
  return document.querySelector(`[${attr}="${id}"]`)?.value;
}

const UI_ACTIONS = {
  ready: () => act({ type: "READY", ready: !me().ready }),
  loan: () => act({ type: "LOAN" }),
  repay: () => act({ type: "REPAY" }),
  withdraw: (d) => act({ type: "WITHDRAW", offerId: d.offer }),
  attach: (d) => {
    const v = selectValue("data-attach-for", d.talent);
    if (!v) return;
    const [projectId, slot] = v.split("|");
    act({ type: "ATTACH", talentId: d.talent, projectId, slot: slot === "DIRECTOR" ? slot : Number(slot) });
  },
  "attach-direct": (d) => act({ type: "ATTACH", talentId: d.talent, projectId: client.cast.projectId, slot: client.cast.slot }),
  "play-card": (d) => act({ type: "PLAY_CARD", uid: d.uid, targetId: selectValue("data-target-for", d.uid) || null }),
  cast: (d) => openCastDialog(d.project, d.slot, d.focus || null),
  "cast-slot": (d) => { client.cast.slot = d.slot === "DIRECTOR" ? d.slot : Number(d.slot); client.cast.focusId = null; renderCastDialog(); },
  offer: (d) => act({
    type: "OFFER",
    talentId: d.talent,
    projectId: client.cast.projectId,
    slot: client.cast.slot,
    fee: Number(selectValue("data-fee-for", d.talent))
  }),
  scout: (d) => {
    const locationId = selectValue("data-scout-for", d.project);
    if (locationId) act({ type: "SCOUT", projectId: d.project, locationId });
  },
  greenlight: (d) => act({ type: "GREENLIGHT", projectId: d.project, budget: selectValue("data-budget-for", d.project) }),
  "cancel-greenlight": (d) => act({ type: "GREENLIGHT", projectId: d.project, cancel: true }),
  rewrite: (d) => act({ type: "REWRITE", projectId: d.project }),
  pitch: (d) => act({ type: "PITCH", projectId: d.project }),
  release: (d) => act({ type: "RELEASE", projectId: d.project }),
  market: (d) => act({ type: "MARKETING", projectId: d.project, size: d.size }),
  bid: (d) => act({ type: "BID_SCRIPT", scriptId: d.script, amount: Number(selectValue("data-bid-for", d.script)) }),
  "studio-view": (d) => { client.studioView = d.view; render(); },
  "agency-filter": (d) => { client.agencyFilter = d.role; render(); },
  "show-results": () => openResultsDialog(),
  "close-dialog": (d, el) => {
    const dlg = el.closest("dialog");
    dlg.close();
  },
  "pass-ready": () => { document.getElementById("passScreen").classList.add("hidden"); render(); },
  "new-game": () => {
    document.querySelectorAll("dialog[open]").forEach((dlg) => dlg.close());
    if (isOnline()) leaveOnlineGame(); else { clearLocal(); exitToTitle(); }
  }
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = UI_ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});

// Remember which sidebar sections are open across re-renders
document.addEventListener("toggle", (e) => {
  const key = e.target.dataset?.section;
  if (key) client.openSections[key] = e.target.open;
}, true);

document.addEventListener("input", (e) => {
  if (e.target.dataset.feeFor) updateAppealPreview(e.target);
});

// --- title screen --------------------------------------------------------------------

const localSetup = { players: [""] };

function fillSelect(id, options, selected) {
  const el = document.getElementById(id);
  el.innerHTML = options.map(([v, label]) => `<option value="${v}" ${String(v) === String(selected) ? "selected" : ""}>${h(label)}</option>`).join("");
}

function renderLocalPlayers() {
  const el = document.getElementById("localPlayers");
  el.innerHTML = localSetup.players.map((name, i) => `<div class="setup-row">
    <label>Player ${i + 1} <input type="text" maxlength="32" data-local-player="${i}" value="${h(name)}" placeholder="Name" /></label>
    ${localSetup.players.length > 1 ? `<button class="small" data-remove-player="${i}" title="Remove">✕</button>` : ""}
  </div>`).join("");
  const maxAi = MAX_PLAYERS - localSetup.players.length;
  const aiSel = document.getElementById("localAi");
  const current = Math.min(Number(aiSel.value || 3), maxAi);
  fillSelect("localAi", Array.from({ length: maxAi + 1 }, (_, i) => [i, String(i)]), current);
  document.getElementById("addLocalPlayer").disabled = localSetup.players.length >= MAX_PLAYERS;
}

function refreshTitleScreen() {
  document.getElementById("continueLocal").classList.toggle("hidden", !hasLocalSave());
  renderLocalPlayers();
}

function initTitleScreen() {
  const lengths = Object.entries(GAME_LENGTHS).map(([k, v]) => [k, v.label]);
  fillSelect("localLength", lengths, "STANDARD");
  fillSelect("onlineLength", lengths, "STANDARD");
  fillSelect("onlineTimer", TIMER_OPTIONS.map((s) => [s, s ? `${s} seconds` : "Off"]), 90);
  fillSelect("localAi", [[3, "3"]], 3);
  fillSelect("onlineAi", [[0, "0"]], 0);

  document.getElementById("localPlayers").addEventListener("input", (e) => {
    const i = e.target.dataset.localPlayer;
    if (i !== undefined) localSetup.players[i] = e.target.value;
  });
  document.getElementById("localPlayers").addEventListener("click", (e) => {
    const i = e.target.dataset.removePlayer;
    if (i !== undefined) { localSetup.players.splice(Number(i), 1); renderLocalPlayers(); }
  });
  document.getElementById("addLocalPlayer").addEventListener("click", () => {
    if (localSetup.players.length < MAX_PLAYERS) { localSetup.players.push(""); renderLocalPlayers(); }
  });

  document.getElementById("startLocal").addEventListener("click", () => {
    const humans = localSetup.players.map((n, i) => ({ name: n.trim() || `Player ${i + 1}` }));
    const aiCount = Number(document.getElementById("localAi").value) || 0;
    if (humans.length + aiCount < 2) return toast("Add an AI studio or another player.", true);
    startLocalGame({
      players: [...humans, ...Array.from({ length: aiCount }, (_, i) => ({ name: `AI ${i + 1}`, ai: true }))],
      length: document.getElementById("localLength").value,
      scandals: document.getElementById("localScandals").checked,
      timer: 0
    });
  });
  document.getElementById("continueLocal").addEventListener("click", () => {
    if (!loadLocal()) return toast("Couldn't load the saved game.", true);
    enterGameScreen();
    if (isHotSeat()) showPassScreen(client.viewer);
  });

  document.getElementById("createOnline").addEventListener("click", createOnlineGame);
  document.getElementById("joinOnline").addEventListener("click", joinOnlineGame);
  document.getElementById("startOnline").addEventListener("click", startOnlineGame);
  document.getElementById("leaveLobby").addEventListener("click", leaveOnlineGame);
  document.getElementById("copyInvite").addEventListener("click", () => {
    navigator.clipboard?.writeText(inviteUrl()).then(() => toast("Invite link copied."));
  });

  refreshTitleScreen();
}

function boot() {
  initTitleScreen();

  document.getElementById("rulesBtn").addEventListener("click", openRulesDialog);
  document.getElementById("quitBtn").addEventListener("click", () => {
    if (isOnline()) {
      if (confirm("Leave this game? An AI caretaker will run your studio.")) leaveOnlineGame();
    } else {
      saveLocal();
      exitToTitle();
    }
  });
  document.querySelectorAll(".mobile-tab-btn").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  document.getElementById("resultsDialog").addEventListener("close", afterResultsClosed);

  // Local games: the planning timer isn't used, but keep the countdown fresh online
  setInterval(updateTimer, 1000);

  tryAutoRejoin();
}

boot();
