// Render orchestrator: redraws every panel from `state`.

function render() {
  if (!state || !client.mode) return;
  renderTopbar();
  renderMoneyBar();
  renderControls();
  renderStudio();
  renderSidebar();
  if (document.getElementById("castDialog").open) renderCastDialog();
  if (document.getElementById("financeDialog").open) renderFinanceDialog();
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

// Always-visible finances so every spending decision can be made with the numbers in view
function renderMoneyBar() {
  const p = me();
  const held = committedCash(p.index);
  const canPlan = state.phase === "PLANNING" && !p.ready;
  document.getElementById("moneyBar").innerHTML = `
    ${isHistorical() ? `<span class="mb-item mb-era" title="All prices are in ${calendarOf().year} dollars, from the BLS Consumer Price Index (CPI-U)${isProjectedCpi() ? " — projected past the last published CPI" : ""}. $1 then is worth about $${(1 / priceLevel()).toFixed(2)} today.">🗓 ${calendarOf().year} dollars${isProjectedCpi() ? "*" : ""}</span>` : ""}
    <span class="mb-item mb-cash ${p.cash < upkeepDue(p) ? "mb-warn" : ""}" title="Cash you can spend right now${isHistorical() ? ` — about ${fmtMoney(p.cash, { today: true })} in today's dollars` : ""}">🏦 Bank <strong>${fmtMoney(p.cash)}</strong></span>
    ${held ? `<span class="mb-item" title="Held for your sealed offers and greenlights — refunded if they fall through">⏳ Held <strong>${fmtMoney(held)}</strong></span>` : ""}
    <span class="mb-item" title="Loans: about ${loanRatePerYear().toFixed(1)}% a year right now">💳 Debt <strong>${fmtMoney(p.debt)}</strong> <span class="muted">/ ${fmtMoney(MAX_DEBT)}</span></span>
    <span class="mb-item" title="Overhead plus loan interest, paid at the end of the quarter">📉 Upkeep <strong>${fmtMoney(upkeepDue(p))}</strong>/qtr</span>
    <span class="mb-item mb-hide-sm" title="Prestige from awards — worth ${PRESTIGE_VALUE}M each and attracts talent">🌽 Prestige <strong>${p.prestige}</strong></span>
    <span class="mb-item mb-hide-sm" title="Studio value — what wins the game">⭐ Value <strong>${fmtMoney(studioValue(p))}</strong></span>
    <span class="mb-actions">
      <button class="small" data-act="loan" ${canPlan && loanRoom(p) >= LOAN_SIZE ? "" : "disabled"}>Borrow ${fmtMoney(LOAN_SIZE)}</button>
      ${p.debt > 0 ? `<button class="small" data-act="repay" ${canPlan && p.cash >= Math.min(REPAY_SIZE, p.debt) ? "" : "disabled"}>Repay ${fmtMoney(Math.min(REPAY_SIZE, p.debt))}</button>` : ""}
      <button class="small primary" data-act="open-finance">Financing</button>
    </span>`;
}

function updateTimer() {
  const el = document.getElementById("planTimer");
  if (!el || !state?.planningDeadline) return;
  const left = Math.max(0, Math.ceil((state.planningDeadline - Date.now()) / 1000));
  el.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  el.classList.toggle("timer--low", left <= 15);
}
