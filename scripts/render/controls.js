// Controls panel: quarter, AP, ready-up, news, finances, sealed offers, contracts, scandal hand.

function renderControls() {
  const el = document.getElementById("controlsPanel");
  const p = me();
  if (state.phase === "GAME_OVER") { el.innerHTML = renderFinalStandings(); return; }

  el.innerHTML = [
    renderQuarterBox(p),
    renderStudiosStatus(),
    renderNews(),
    renderFinances(p),
    renderMyOffers(),
    renderRoster(p),
    scandalsOn() ? renderHand(p) : ""
  ].join("");
}

function renderQuarterBox(p) {
  const timer = state.planningDeadline ? `<span class="timer" id="planTimer"></span>` : "";
  return `<div class="box quarter-box">
    <div class="quarter-head">
      <h2>${h(quarterLabel(state.quarter))}</h2>
      <span class="muted small">Quarter ${state.quarter + 1} of ${state.totalQuarters}</span>
    </div>
    <div class="small muted">${h(seasonNote(state.quarter))}</div>
    <div class="ap-row">
      <span class="stat-label">Action points</span> ${apPips(p)}
      <span class="small muted">${p.ap} left</span>${timer}
    </div>
    <button class="primary ready-btn ${p.ready ? "ready-btn--on" : ""}" data-act="ready">
      ${p.ready ? "✓ Ready — click to keep planning" : "I'm done planning — Ready"}
    </button>
    <div class="small muted">Free anytime: marketing, loans, pitching investors, attaching contracted talent.</div>
  </div>`;
}

function renderStudiosStatus() {
  const rows = state.initiative.map((pi, rank) => {
    const p = state.players[pi];
    return `<li class="${pi === client.viewer ? "me" : ""}">
      <span class="init-rank" title="Initiative card — breaks ties in bidding and greenlights">${rank + 1}</span>
      ${studioChip(pi)} <span class="grow">${h(p.studio)}${p.ai ? ` <span class="muted small">AI</span>` : ""}</span>
      ${p.ready ? `<span class="pill pill--good">Ready</span>` : `<span class="pill">Planning…</span>`}
    </li>`;
  }).join("");
  return `<div class="box"><h3>Studios <span class="muted small">by initiative</span></h3><ul class="studio-status">${rows}</ul></div>`;
}

function renderNews() {
  const e = state.event;
  const s = state.scandal;
  return `<div class="box news-box">
    <h3>Industry news</h3>
    ${e ? `<div class="news-card"><strong>${h(e.name)}</strong><div class="small">${h(e.text)}</div></div>` : ""}
    ${s ? `<div class="news-card news-card--scandal"><strong>Scandal: ${h(s.name)}</strong><div class="small">${h(s.text)}</div></div>` : ""}
  </div>`;
}

function renderFinances(p) {
  return `<div class="box">
    <h3>${studioName(p.index)}</h3>
    <div class="stat-grid">
      ${statLine("Cash", fmtMoney(p.cash))}
      ${statLine("Debt", fmtMoney(p.debt))}
      ${statLine("Prestige", `${p.prestige} 🌽`)}
      ${statLine("Value", fmtMoney(studioValue(p)))}
    </div>
    <div class="btn-row">
      <button class="small" data-act="loan" ${p.debt + LOAN_SIZE > MAX_DEBT ? "disabled" : ""}>Borrow ${fmtMoney(LOAN_SIZE)}</button>
      <button class="small" data-act="repay" ${p.debt <= 0 ? "disabled" : ""}>Repay ${fmtMoney(Math.min(REPAY_SIZE, p.debt || REPAY_SIZE))}</button>
    </div>
    <div class="small muted">Overhead ${fmtMoney(OVERHEAD)}/quarter · loans cost ${LOAN_INTEREST * 100}%/quarter</div>
  </div>`;
}

function renderMyOffers() {
  const mine = state.offers.filter((o) => o.pi === client.viewer);
  if (!mine.length) return "";
  const rows = mine.map((o) => {
    const what = o.kind === "SCRIPT"
      ? `Bid ${fmtMoney(o.amount)} on script "${h(o.title)}"`
      : `${h(o.name)} — ${fmtMoney(o.fee)} for "${h(o.title)}"`;
    return `<li><span class="grow">${what}</span><button class="small" data-act="withdraw" data-offer="${o.id}" title="Withdraw and refund (AP returned)">✕</button></li>`;
  }).join("");
  return `<div class="box"><h3>Sealed offers <span class="muted small">settled at quarter end</span></h3><ul class="offer-list">${rows}</ul></div>`;
}

function renderRoster(p) {
  if (!p.roster.length) return "";
  const dev = p.projects.filter((f) => f.status === STATUS.DEV);
  const rows = p.roster.map((tid) => {
    const t = talentById(tid);
    const opts = [];
    dev.forEach((f) => openSlots(f).filter((s) => slotFits(t, s)).forEach((s) => {
      opts.push(`<option value="${f.id}|${s}">${h(f.title)} — ${h(slotLabel(f, s))}</option>`);
    }));
    return `<li>${talentTag(t)}
      ${opts.length
        ? `<span class="inline-form"><select data-attach-for="${t.id}">${opts.join("")}</select><button class="small" data-act="attach" data-talent="${t.id}">Attach</button></span>`
        : `<span class="small muted">No open ${t.role === "DIRECTOR" ? "director" : "cast"} roles</span>`}
    </li>`;
  }).join("");
  return `<div class="box"><h3>Under contract <span class="muted small">attach for free</span></h3><ul class="roster-list">${rows}</ul></div>`;
}

function cardTargets(card, pi) {
  if (card.target === "OWN_FILM") {
    return state.players[pi].projects
      .filter((f) => [STATUS.DEV, STATUS.FILMING, STATUS.CANNED, STATUS.SCHEDULED].includes(f.status))
      .map((f) => ({ id: f.id, label: f.title }));
  }
  if (card.target === "RIVAL_FILM") {
    return allProjects()
      .filter((e) => e.pi !== pi && [STATUS.FILMING, STATUS.CANNED, STATUS.SCHEDULED].includes(e.project.status))
      .map((e) => ({ id: e.project.id, label: `${e.project.title} (${state.players[e.pi].tag})` }));
  }
  if (card.target === "RIVAL_STAR") {
    const seen = new Set();
    const out = [];
    allProjects().forEach((e) => {
      if (e.pi === pi || ![STATUS.DEV, STATUS.FILMING, STATUS.CANNED].includes(e.project.status)) return;
      e.project.cast.forEach((id) => {
        if (id && !seen.has(id)) { seen.add(id); out.push({ id, label: `${talentById(id).name} (${e.project.title})` }); }
      });
    });
    return out;
  }
  return [];
}

function renderHand(p) {
  const cards = p.hand.map((c) => {
    const card = SCANDAL_CARDS[c.cardId];
    let control = "";
    if (card.target === "REACTIVE") {
      control = `<span class="small muted">Plays itself</span>`;
    } else if (card.target === "NONE") {
      control = `<button class="small" data-act="play-card" data-uid="${c.uid}">Play (1 AP)</button>`;
    } else {
      const targets = cardTargets(card, p.index);
      control = targets.length
        ? `<span class="inline-form"><select data-target-for="${c.uid}">${targets.map((t) => `<option value="${t.id}">${h(t.label)}</option>`).join("")}</select><button class="small" data-act="play-card" data-uid="${c.uid}">Play (1 AP)</button></span>`
        : `<span class="small muted">No targets yet</span>`;
    }
    return `<div class="scandal-card"><strong>${h(card.name)}</strong><div class="small">${h(card.text)}</div>${control}</div>`;
  }).join("");
  return `<div class="box"><h3>Scandal cards</h3>${cards || `<div class="small muted">No cards. You draw one each new year.</div>`}</div>`;
}

function renderFinalStandings() {
  const rows = state.final.map((r, i) => {
    const p = state.players[r.pi];
    return `<tr class="${r.pi === client.viewer ? "me" : ""}">
      <td>${i === 0 ? "🏆" : i + 1}</td><td>${studioChip(r.pi)} ${h(p.studio)}<div class="small muted">${h(p.name)}</div></td>
      <td>${fmtMoney(r.cash)}</td><td>${fmtMoney(-r.debt)}</td><td>${r.prestige} 🌽</td><td>${fmtMoney(r.library)}</td><td><strong>${fmtMoney(r.value)}</strong></td>
    </tr>`;
  }).join("");
  const winner = state.players[state.final[0].pi];
  return `<div class="box final-box">
    <h2>That's a wrap!</h2>
    <p><strong>${h(winner.studio)}</strong> (${h(winner.name)}) wins the studio wars.</p>
    <table class="table">
      <thead><tr><th></th><th>Studio</th><th>Cash</th><th>Debt</th><th>Prestige</th><th>Library</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="small muted">Value = cash − debt + ${PRESTIGE_VALUE}×prestige + ${LIBRARY_RATE * 100}% of lifetime box office.</p>
    <button class="primary" data-act="new-game">New game</button>
  </div>`;
}
