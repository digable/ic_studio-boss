// Plan panel: this quarter (AP, ready-up, who's ready), next steps, news, deals in progress,
// contracted talent and scandal cards. Money lives in the always-visible money bar.

function renderControls() {
  const el = document.getElementById("controlsPanel");
  const p = me();
  if (state.phase === "GAME_OVER") { el.innerHTML = renderFinalStandings(); return; }

  el.innerHTML = [
    renderQuarterBox(p),
    renderTodo(p),
    renderNews(),
    renderMyOffers(),
    renderRoster(p),
    scandalsOn() ? renderHand(p) : ""
  ].join("");
}

function renderQuarterBox(p) {
  const timer = state.planningDeadline ? `<span class="timer" id="planTimer"></span>` : "";
  const studios = state.initiative.map((pi, rank) => {
    const o = state.players[pi];
    return `<span class="ready-chip ${o.ready ? "ready-chip--on" : ""} ${pi === client.viewer ? "ready-chip--me" : ""}"
      title="Initiative #${rank + 1} — ${h(o.studio)}${o.ai ? " (AI)" : ""}: ${o.ready ? "ready" : "still planning"}">
      <span class="init-rank">${rank + 1}</span>${studioChip(pi)}${o.ready ? " ✓" : " …"}</span>`;
  }).join("");
  return `<div class="box quarter-box">
    <div class="quarter-head">
      <h2>${h(quarterLabel(state.quarter))}</h2>
      <span class="muted small">${isEndless() ? `Quarter ${state.quarter + 1} · endless` : `${state.quarter + 1} / ${state.totalQuarters}`}</span>
      ${timer}
    </div>
    <div class="small muted">${h(seasonNote(state.quarter))}</div>
    <div class="ap-row">
      <span class="stat-label">Action points</span> ${apPips(p)}
      <span class="small muted">${p.ap} left</span>
    </div>
    <button class="primary ready-btn ${p.ready ? "ready-btn--on" : ""}" data-act="ready">
      ${p.ready ? "✓ Ready — click to keep planning" : "Done planning — Ready"}
    </button>
    <div class="ready-row" title="Initiative order breaks ties in bidding and greenlights">${studios}</div>
    ${isEndless() && client.viewer === state.hostIndex
      ? `<button class="small wrap-btn" data-act="end-game" title="Ends the game for everyone and shows final standings">🎬 Call it a wrap</button>`
      : ""}
  </div>`;
}

// What to do next, in plain words
function renderTodo(p) {
  if (p.ready) return "";
  const items = [];
  const active = p.projects.filter(isActive);
  if (!active.length) {
    items.push(`No movies yet. <button class="link" data-act="goto-scripts">Find a script</button> or <button class="link" data-act="new-package">start with talent or a location</button>.`);
  }
  for (const f of p.projects.filter((x) => x.status === STATUS.DEV)) {
    if (f.pendingGreenlight) continue;
    const need = [];
    if (!hasScript(f) && !pendingScriptBid(f)) need.push(`<button class="link" data-act="goto-scripts" data-project="${f.id}">script</button>`);
    if (!f.director && !pendingOfferFor(f, "DIRECTOR")) need.push(`<button class="link" data-act="cast" data-project="${f.id}" data-slot="DIRECTOR">director</button>`);
    if (!f.cast[0] && !pendingOfferFor(f, 0)) need.push(`<button class="link" data-act="cast" data-project="${f.id}" data-slot="0">lead</button>`);
    if (!f.location) need.push("location");
    if (need.length) items.push(`<strong>${h(f.title)}</strong> needs ${need.join(", ")}`);
    else items.push(`<strong>${h(f.title)}</strong> is ready to greenlight`);
  }
  p.projects.filter((f) => f.status === STATUS.CANNED).forEach((f) => items.push(`<strong>${h(f.title)}</strong> is in the can — release it`));
  const idle = p.roster.length;
  if (idle) items.push(`${idle} ${idle > 1 ? "people" : "person"} under contract with no project`);
  if (p.ap <= 0) items.push("Out of action points — free actions still work, then hit Ready");
  if (!items.length) items.push("Nothing urgent. Market your films, line up new scripts, or hit Ready.");
  return `<div class="box todo-box"><h3>Next up</h3><ul class="todo">${items.map((i) => `<li>${i}</li>`).join("")}</ul></div>`;
}

function renderNews() {
  const e = state.event;
  const sc = state.scandal;
  const history = activeHistory().filter((x) => x.kind !== "rates");
  const showRandom = e && !(isHistorical() && e.id === "NORMAL" && history.length);
  const since = (x) => x.from === calendarOf().key ? "New this quarter" : `Since ${x.from.replace("-", " ")}`;
  return `<div class="box news-box">
    <h3>${isHistorical() ? `The world in ${calendarOf().year}` : "Industry news"}</h3>
    ${history.map((x) => `<div class="news-card news-card--history ${x.from === calendarOf().key ? "news-card--new" : ""}">
        <strong>${h(x.name)}</strong> <span class="small muted">${since(x)}</span>
        <div class="small">${h(x.text)}</div>
        ${describeMods(x.mods) ? `<div class="small effect">Effect: ${h(describeMods(x.mods))}</div>` : ""}
      </div>`).join("")}
    ${showRandom ? `<div class="news-card"><strong>${h(e.name)}</strong><div class="small">${h(e.text)}</div></div>` : ""}
    ${sc ? `<div class="news-card news-card--scandal"><strong>Scandal: ${h(sc.name)}</strong><div class="small">${h(sc.text)}</div></div>` : ""}
    <div class="small muted">Loans cost about ${loanRatePerYear().toFixed(1)}% a year${isHistorical() ? ` (${h(activeHistory().find((x) => x.kind === "rates")?.name || "normal rates")})` : ""}.</div>
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
  return `<div class="box"><h3>Deals in progress <span class="muted small">settle at quarter end</span></h3><ul class="offer-list">${rows}</ul></div>`;
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
