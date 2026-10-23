// Render orchestrator: redraws every panel from `state`.

function render() {
  if (!state || !client.mode) return;
  renderTopbar();
  renderControls();
  renderStudio();
  renderSidebar();
  if (document.getElementById("castDialog").open) renderCastDialog();
  updateTimer();
}

function renderTopbar() {
  const p = me();
  const status = state.phase === "GAME_OVER"
    ? "Game over"
    : `${quarterLabel(state.quarter)} · ${p.studio} · ${fmtMoney(p.cash)} · ${p.ap} AP`;
  document.getElementById("topbarStatus").textContent = status;
  // Mobile: dot on the Plan tab while you still have planning to do
  const planBtn = document.querySelector('.mobile-tab-btn[data-tab="controls"]');
  if (planBtn) planBtn.innerHTML = `Plan${state.phase === "PLANNING" && !p.ready ? `<span class="tab-dot"></span>` : ""}`;
}

function updateTimer() {
  const el = document.getElementById("planTimer");
  if (!el || !state?.planningDeadline) return;
  const left = Math.max(0, Math.ceil((state.planningDeadline - Date.now()) / 1000));
  el.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  el.classList.toggle("timer--low", left <= 15);
}
