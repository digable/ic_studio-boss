// Studio board: projects grouped by stage. Projects in development show a package grid
// (script, director, roles, location) — fill it in any order, then greenlight.

const LANES = [
  { key: "release",  title: "Ready to release", statuses: [STATUS.CANNED, STATUS.SCHEDULED] },
  { key: "dev",      title: "In development",   statuses: [STATUS.DEV] },
  { key: "filming",  title: "Filming",          statuses: [STATUS.FILMING] },
  { key: "theaters", title: "In theaters",      statuses: [STATUS.THEATERS] }
];

function renderStudio() {
  const el = document.getElementById("studioPanel");
  const p = me();
  const active = p.projects.filter(isActive);
  const library = p.projects.filter((f) => !isActive(f));
  const showLib = client.studioView === "library";
  const canPlan = state.phase === "PLANNING" && !p.ready;

  let body;
  if (showLib) {
    body = library.length ? renderLibrary(library) : `<div class="empty">No films have finished their run yet.</div>`;
  } else if (!active.length) {
    body = renderEmptySlate(canPlan);
  } else {
    body = LANES.map((lane) => {
      const films = active.filter((f) => lane.statuses.includes(f.status));
      if (!films.length) return "";
      return `<section class="lane lane--${lane.key}">
        <h3 class="lane-title">${lane.title} <span class="lane-count">${films.length}</span></h3>
        <div class="film-grid">${films.map((f) => renderFilmCard(f, p, canPlan)).join("")}</div>
      </section>`;
    }).join("");
  }

  el.innerHTML = `
    <div class="panel-head">
      <h2>${studioName(p.index)}</h2>
      <div class="seg">
        <button class="small ${showLib ? "" : "seg--on"}" data-act="studio-view" data-view="active">Slate (${active.length})</button>
        <button class="small ${showLib ? "seg--on" : ""}" data-act="studio-view" data-view="library">Library (${library.length})</button>
      </div>
      <span class="grow"></span>
      <button class="small" data-act="goto-scripts" ${canPlan ? "" : "disabled"}>📜 Find a script</button>
      <button class="small" data-act="new-package" ${canPlan ? "" : "disabled"} title="Free. Start a movie from talent or a location; add a script later.">+ New package</button>
    </div>
    ${p.ready && state.phase === "PLANNING" ? `<div class="banner">You're ready. Waiting on the other studios… (un-ready to keep planning)</div>` : ""}
    ${body}`;
}

function renderEmptySlate(canPlan) {
  return `<div class="empty-slate">
    <h3>Start your first movie</h3>
    <p>Begin with whatever you like — the pieces can come in any order:</p>
    <div class="btn-row">
      <button class="primary" data-act="goto-scripts" ${canPlan ? "" : "disabled"}>📜 Find a script</button>
      <button data-act="new-package" ${canPlan ? "" : "disabled"}>🎭 Start with talent or a location</button>
    </div>
    <p class="small muted">A script is required before you can greenlight. Talent and locations can be lined up first.</p>
  </div>`;
}

function renderLibrary(films) {
  return `<table class="table library-table">
    <thead><tr><th>Film</th><th>Critics</th><th>Gross</th><th>Cost</th><th></th></tr></thead>
    <tbody>${films.map((f) => `<tr>
      <td>${genreBadge(f.genre)} <strong>${h(f.title)}</strong><div class="small muted">${h(quarterLabel(f.releasedQuarter))}</div></td>
      <td>${criticStars(f.critic)} ${f.critic}</td>
      <td>${fmtMoney(f.totalGross)}</td><td>${fmtMoney(f.cost)}</td><td>${h(verdictFor(f))}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function pendingOfferFor(f, slot) {
  return state.offers.find((o) => o.kind === "TALENT" && o.pi === client.viewer && o.projectId === f.id && o.slot === slot);
}

function pendingScriptBid(f) {
  return state.offers.find((o) => o.kind === "SCRIPT" && o.pi === client.viewer && o.projectId === f.id);
}

// --- package grid (projects in development) --------------------------------------------

function tile(label, stateCls, value) {
  return `<div class="pkg-tile pkg-tile--${stateCls}"><span class="pkg-label">${h(label)}</span><span class="pkg-value">${value}</span></div>`;
}

function scriptTile(f, canPlan) {
  if (hasScript(f)) return tile("Script", "done", writerTag(f));
  const bid = pendingScriptBid(f);
  if (bid) return tile("Script", "pending", `Bidding ${fmtMoney(bid.amount)} on "${h(bid.title)}"`);
  return tile("Script", "empty", `<button class="small primary" data-act="goto-scripts" data-project="${f.id}" ${canPlan ? "" : "disabled"}>Find a script</button>`);
}

function personTile(f, slot, canPlan) {
  const label = slot === "DIRECTOR" ? "Director" : ROLES[f.roles[slot]].name;
  const t = talentById(slot === "DIRECTOR" ? f.director : f.cast[slot]);
  if (t) return tile(label, "done", talentTag(t));
  const o = pendingOfferFor(f, slot);
  if (o) return tile(label, "pending", `Offer out: ${h(o.name)} · ${fmtMoney(o.fee)}`);
  const contracted = me().roster.map(talentById).filter((x) => slotFits(x, slot) && !attachedTalentIds(f).includes(x.id));
  return tile(label, "empty",
    `<button class="small" data-act="cast" data-project="${f.id}" data-slot="${slot}" ${canPlan ? "" : "disabled"}>Find ${slot === "DIRECTOR" ? "director" : "talent"}</button>`
    + contracted.slice(0, 2).map((x) => `<button class="small attach-quick" data-act="attach-quick" data-talent="${x.id}" data-project="${f.id}" data-slot="${slot}" ${canPlan ? "" : "disabled"} title="Under contract — free">+ ${h(x.name)}</button>`).join(""));
}

function locationTile(f, canPlan) {
  const loc = locationById(f.location);
  const fit = loc && f.genre && loc.fit.includes(f.genre);
  const locked = !!f.pendingGreenlight;
  const opts = LOCATIONS.map((l) => {
    const busy = filmingProjectAtLocation(l.id);
    const good = f.genre && l.fit.includes(f.genre);
    return `<option value="${l.id}" ${l.id === f.location ? "selected" : ""}>${good ? "✓ " : ""}${h(l.name)} — ${fmtMoney(l.fee)}${busy ? ` (booked${wrapsThisQuarter(busy) ? ", frees up" : ""})` : ""}</option>`;
  }).join("");
  const picker = locked ? "" : `<span class="inline-form">
      <select data-scout-for="${f.id}" ${canPlan ? "" : "disabled"}>${loc ? "" : `<option value="">Choose…</option>`}${opts}</select>
      <button class="small" data-act="scout" data-project="${f.id}" ${canPlan ? "" : "disabled"} title="1 AP">${loc ? "Move" : "Scout"}</button>
    </span>`;
  return `<div class="pkg-tile pkg-tile--wide pkg-tile--${loc ? "done" : "empty"}">
    <span class="pkg-label">Location</span>
    <span class="pkg-value">${loc ? `${h(loc.name)} ${fit ? `<span class="pill pill--good">Good fit</span>` : ""}` : `<span class="muted">Not scouted</span>`}</span>
    ${picker}
  </div>`;
}

function renderPackage(f, canPlan) {
  return `<div class="pkg-grid">
    ${scriptTile(f, canPlan)}
    ${personTile(f, "DIRECTOR", canPlan)}
    ${f.roles.map((_, i) => personTile(f, i, canPlan)).join("")}
    ${locationTile(f, canPlan)}
  </div>`;
}

function renderGreenlightBar(f, p, canPlan) {
  if (f.pendingGreenlight) {
    const gl = f.pendingGreenlight;
    return `<div class="film-foot">
      <span class="pill pill--good">✓ Greenlit: ${h(BUDGETS[gl.budget].name)}${gl.cofinance ? " (co-financed)" : ""} · ${fmtMoney(gl.escrow)} — cameras roll next quarter</span>
      <button class="small" data-act="cancel-greenlight" data-project="${f.id}" ${canPlan ? "" : "disabled"}>Cancel</button>
    </div>`;
  }
  const conflicts = greenlightConflicts(f, true);
  const missing = [!hasScript(f) && "a script", !f.director && "a director", !f.location && "a location"].filter(Boolean);
  const blocked = missing.length || conflicts.length;
  const budgetOpts = !hasScript(f) ? `<option>Needs a script</option>` : BUDGET_KEYS.map((b) => {
    const len = shootLength(f, b);
    const late = !isEndless() && state.quarter + 1 + len > state.totalQuarters - 1;
    const cost = greenlightCost(f, b);
    return `<option value="${b}" title="${BUDGETS[b].name}: costs ${fmtMoney(cost)} including location, shoots ${len} quarter${len > 1 ? "s" : ""}">${BUDGETS[b].name} ${fmtMoney(cost)} · ${len}q${cost > p.cash ? " · short!" : ""}${late ? " · too late!" : ""}</option>`;
  }).join("");

  const unknowns = f.cast.filter((id) => !id).length;
  const notes = [];
  if (missing.length) notes.push(`<span class="muted">Needs ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")} — any order.</span>`);
  if (conflicts.length) notes.push(`<span class="bad">${conflicts.map(h).join("; ")}.</span>`);
  if (!missing.length && unknowns) notes.push(`<span class="muted">${unknowns} empty role${unknowns > 1 ? "s" : ""} go to unknowns (−${UNKNOWN_QUALITY_PENALTY} quality each).</span>`);

  return `<div class="film-foot ${blocked ? "" : "film-foot--ready"}">
      <select data-budget-for="${f.id}" ${canPlan && !blocked ? "" : "disabled"}>${budgetOpts}</select>
      <label class="small cofi" title="A partner pays ${COFINANCE_BUDGET * 100}% of the budget for ${COFINANCE_SHARE * 100}% of the box office"><input type="checkbox" data-cofinance-for="${f.id}" ${canPlan && !blocked ? "" : "disabled"} /> Co-finance</label>
      <button class="small primary" data-act="greenlight" data-project="${f.id}" ${canPlan && !blocked ? "" : "disabled"} title="1 AP. Needs a script, a director and a location; everyone must be free to film.">Greenlight</button>
    </div>
    ${notes.length ? `<div class="film-notes small">${notes.join(" ")}</div>` : ""}`;
}

function renderSecondaryActions(f, p, canPlan) {
  const pitch = !f.pitched && attachedTalentIds(f).length ? pitchValue(f, p) : 0;
  return `<div class="film-more">
    <button class="link" data-act="rewrite" data-project="${f.id}" ${canPlan && hasScript(f) && !eventMods().strike ? "" : "disabled"} title="1 AP, ${fmtMoney(REWRITE_COST)}. Usually improves the script — less each time.">✎ Rewrite</button>
    <button class="link" data-act="pitch" data-project="${f.id}" ${canPlan && pitch >= 1 ? "" : "disabled"} title="Free. Investors pay now for ${INVESTOR_SHARE * 100}% of the box office.">💼 Pitch investors${pitch >= 1 ? ` +${fmtMoney(pitch)}` : ""}</button>
    ${f.investorShare ? `<span class="muted">Investors own ${Math.round(f.investorShare * 100)}%</span>` : ""}
    <span class="grow"></span>
    <button class="link link--danger" data-act="shelve" data-project="${f.id}" ${canPlan ? "" : "disabled"} title="Free. Drop this project; attached people stay under contract.">Shelve</button>
  </div>`;
}

function interestedLine(f, p) {
  const list = interestedTalent(f, p.index, 4);
  if (!list.length) return "";
  return `<div class="interested small">👀 Interested${hasScript(f) ? "" : " (even without a script)"}: ${list.map((x) =>
    `<button class="link" data-act="cast" data-project="${f.id}" data-slot="${x.slot}" data-focus="${x.talent.id}">${h(x.talent.name)}</button>`).join(", ")}</div>`;
}

// --- other stages --------------------------------------------------------------------

function crewLine(f) {
  const d = talentById(f.director);
  const cast = f.cast.map(talentById).filter(Boolean).map((t) => t.name);
  const loc = locationById(f.location);
  return `<div class="crew small">🎬 ${d ? h(d.name) : "—"} · ⭐ ${cast.length ? h(cast.join(", ")) : "unknowns"} · 📍 ${loc ? h(loc.name) : "—"}</div>`;
}

function hypeMeter(f, note = "") {
  return `<div><span class="stat-label">Hype</span> ${meter(f.hype, 100, "meter--hype")} ${f.hype}${note}</div>`;
}

function marketingButtons(f, canPlan) {
  return `<span class="inline-form">
    <span class="small muted">Marketing:</span>
    <button class="small" data-act="market" data-size="SMALL" data-project="${f.id}" ${canPlan ? "" : "disabled"} title="Free action">${MARKETING.SMALL.name} ${fmtMoney(MARKETING.SMALL.cost)}</button>
    <button class="small" data-act="market" data-size="BIG" data-project="${f.id}" ${canPlan ? "" : "disabled"} title="Free action">${MARKETING.BIG.name} ${fmtMoney(MARKETING.BIG.cost)}</button>
  </span>`;
}

function renderStageBody(f, p, canPlan) {
  switch (f.status) {
    case STATUS.DEV: {
      const budget = f.pendingGreenlight?.budget || "STUDIO";
      const est = hasScript(f) ? estimateQuality(f, budget) : null;
      const breakdown = hasScript(f) ? qualityBreakdown(f, budget).map((i) => `${i.value >= 0 ? "+" : ""}${i.value} ${i.label}`).join("\n") : "";
      return `${renderPackage(f, canPlan)}
        <div class="meters">
          ${est !== null ? `<div title="${h(breakdown)}"><span class="stat-label">Exp. quality</span> ${meter(est, 100, "meter--quality")} ${est}</div>` : ""}
          ${hypeMeter(f)}
        </div>
        ${interestedLine(f, p)}
        ${renderGreenlightBar(f, p, canPlan)}
        ${renderSecondaryActions(f, p, canPlan)}`;
    }
    case STATUS.FILMING: {
      const done = f.shootTotal - f.quartersLeft;
      return `${crewLine(f)}
        <div class="meters">
          <div><span class="stat-label">Filming</span> ${meter(done, f.shootTotal, "meter--film")} ${done}/${f.shootTotal} qtrs${f.shootTotal > (f.shootPlanned || f.shootTotal) ? ` <span class="bad small">delayed</span>` : ""}</div>
          ${hypeMeter(f)}
        </div>
        <div class="small muted">${h(BUDGETS[f.budget].name)} budget · wraps in ${f.quartersLeft} qtr${f.quartersLeft > 1 ? "s" : ""}. Cast and location are booked until then.</div>
        <div class="film-foot">${marketingButtons(f, canPlan)}</div>`;
    }
    case STATUS.CANNED: {
      const g = GENRES[f.genre];
      const now = g.season[seasonOf(state.quarter)];
      const next = g.season[seasonOf(state.quarter + 1)];
      return `${crewLine(f)}
        <div class="meters">${hypeMeter(f, ` <span class="small muted">fades while it waits</span>`)}</div>
        <div class="small">${h(QUARTERS[seasonOf(state.quarter)].name)} is <strong>${now >= 1.15 ? "great" : now <= 0.9 ? "weak" : "fine"}</strong> for ${h(g.name)} (×${now})${next > now ? `; next quarter is better (×${next})` : ""}.</div>
        <div class="film-foot film-foot--ready">
          <button class="small primary" data-act="release" data-project="${f.id}" ${canPlan ? "" : "disabled"} title="1 AP">Release this quarter</button>
          ${marketingButtons(f, canPlan)}
        </div>`;
    }
    case STATUS.SCHEDULED:
      return `${crewLine(f)}
        <div class="meters">${hypeMeter(f)}</div>
        <div class="banner banner--small">🎟 Opens in theaters at the end of this quarter.</div>
        <div class="film-foot">${marketingButtons(f, canPlan)}</div>`;
    case STATUS.THEATERS:
      return `${crewLine(f)}
        <div class="theater-info">
          <div>${criticStars(f.critic)} <strong>${f.critic}</strong> <span class="small muted">${h(criticQuip(f.critic))}</span></div>
          <div class="small">Week ${f.run} of ${RUN_LENGTH} · ${f.grosses.map((g, i) => `Q${i + 1} ${fmtMoney(g)}`).join(" · ")}</div>
          <div class="small">Total <strong>${fmtMoney(f.totalGross)}</strong> · your take ${fmtMoney(f.studioTake)} · cost ${fmtMoney(f.cost)}</div>
        </div>`;
    default:
      return "";
  }
}

function renderFilmCard(f, p, canPlan) {
  return `<article class="film-card film-card--${f.status.toLowerCase()}" style="--genre:var(--genre-${f.genre || "NONE"})">
    <header class="film-head">
      ${genreBadge(f.genre)}
      <h3>${h(f.title)}</h3>
      ${f.status === STATUS.SCHEDULED ? `<span class="status-pill status-pill--scheduled">Opening</span>` : ""}
      <span class="film-cost" title="Spent on this film so far">${fmtMoney(f.cost)}</span>
    </header>
    <p class="logline">${h(f.logline)}</p>
    ${hasScript(f) ? `<div class="film-meta small"><span title="Script quality">📜 ${f.quality}</span><span title="Main roles">🎭 ${f.roles.length}</span><span title="Base shoot length">🎥 ${f.shoot} qtr</span></div>` : ""}
    ${renderStageBody(f, p, canPlan)}
  </article>`;
}
