// Studio board: one card per project, with its people, location, and the actions for its stage.

function renderStudio() {
  const el = document.getElementById("studioPanel");
  const p = me();
  const active = p.projects.filter(isActive);
  const library = p.projects.filter((f) => !isActive(f));
  const showLib = client.studioView === "library";
  const list = showLib ? library : active;
  const canPlan = state.phase === "PLANNING" && !p.ready;

  const order = [STATUS.THEATERS, STATUS.SCHEDULED, STATUS.CANNED, STATUS.FILMING, STATUS.DEV];
  const cards = showLib
    ? renderLibrary(library)
    : [...list].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)).map((f) => renderFilmCard(f, p, canPlan)).join("");

  el.innerHTML = `
    <div class="studio-head">
      <h2>${studioName(p.index)}</h2>
      <div class="seg">
        <button class="small ${showLib ? "" : "seg--on"}" data-act="studio-view" data-view="active">Slate (${active.length})</button>
        <button class="small ${showLib ? "seg--on" : ""}" data-act="studio-view" data-view="library">Library (${library.length})</button>
      </div>
    </div>
    ${p.ready && state.phase === "PLANNING" ? `<div class="banner">You're ready. Waiting on the other studios… (un-ready to keep planning)</div>` : ""}
    <div class="film-grid">${cards || `<div class="empty">${showLib ? "No films have finished their run yet." : "No projects yet. Bid on a script in the Market to get started."}</div>`}</div>`;
}

function renderLibrary(films) {
  if (!films.length) return "";
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

function renderPeople(f, canPlan) {
  const dev = f.status === STATUS.DEV;
  const row = (label, slot, tid) => {
    const t = talentById(tid);
    let right = "";
    if (t) right = talentTag(t);
    else if (dev) {
      const o = pendingOfferFor(f, slot);
      right = o
        ? `<span class="pill pill--pending">Offer out: ${h(o.name)} ${fmtMoney(o.fee)}</span>`
        : `<button class="small" data-act="cast" data-project="${f.id}" data-slot="${slot}" ${canPlan ? "" : "disabled"}>Find ${slot === "DIRECTOR" ? "a director" : "talent"}</button>`;
    } else right = `<span class="muted small">Unknown actor</span>`;
    return `<div class="people-row"><span class="role-label">${h(label)}</span>${right}</div>`;
  };
  return `<div class="people">
    ${row("Director", "DIRECTOR", f.director)}
    ${f.roles.map((r, i) => row(ROLES[r].name, i, f.cast[i])).join("")}
  </div>`;
}

function renderLocationRow(f, canPlan) {
  const loc = locationById(f.location);
  const fit = loc && loc.fit.includes(f.genre);
  if (f.status !== STATUS.DEV || f.pendingGreenlight) {
    return `<div class="people-row"><span class="role-label">Location</span>${loc ? h(loc.name) : "—"}</div>`;
  }
  const opts = LOCATIONS.map((l) => {
    const busy = filmingProjectAtLocation(l.id);
    const good = l.fit.includes(f.genre);
    return `<option value="${l.id}" ${l.id === f.location ? "selected" : ""}>${good ? "✓ " : ""}${h(l.name)} — ${fmtMoney(l.fee)}${busy ? ` (booked${wrapsThisQuarter(busy) ? ", frees up" : ""})` : ""}</option>`;
  }).join("");
  return `<div class="people-row"><span class="role-label">Location</span>
    ${loc ? `<span>${h(loc.name)} ${fit ? `<span class="pill pill--good">Good fit</span>` : ""}</span>` : `<span class="muted small">Not scouted</span>`}
    <span class="inline-form"><select data-scout-for="${f.id}" ${canPlan ? "" : "disabled"}>${loc ? "" : `<option value="">Choose…</option>`}${opts}</select>
    <button class="small" data-act="scout" data-project="${f.id}" ${canPlan ? "" : "disabled"} title="1 AP">${loc ? "Move" : "Scout"}</button></span>
  </div>`;
}

function renderDevActions(f, p, canPlan) {
  if (f.pendingGreenlight) {
    const gl = f.pendingGreenlight;
    return `<div class="film-actions">
      <span class="pill pill--good">Greenlit: ${h(BUDGETS[gl.budget].name)} (${fmtMoney(gl.escrow)}) — cameras roll next quarter</span>
      <button class="small" data-act="cancel-greenlight" data-project="${f.id}" ${canPlan ? "" : "disabled"}>Cancel</button>
    </div>`;
  }
  const conflicts = greenlightConflicts(f, true);
  const missing = [!f.director && "a director", !f.location && "a location"].filter(Boolean);
  const unknowns = f.cast.filter((id) => !id).length;
  const budgetOpts = BUDGET_KEYS.map((b) => {
    const len = shootLength(f, b);
    const ready = state.quarter + 1 + len;
    const late = ready > state.totalQuarters - 1;
    return `<option value="${b}">${BUDGETS[b].name} — ${fmtMoney(greenlightCost(f, b))} · ${len} qtr${len > 1 ? "s" : ""}${late ? " (too late to release!)" : ""}</option>`;
  }).join("");
  const blocked = missing.length || conflicts.length;
  const pitch = !f.pitched && attachedTalentIds(f).length ? pitchValue(f, p) : 0;
  return `<div class="film-actions">
    <span class="inline-form">
      <select data-budget-for="${f.id}" ${canPlan && !blocked ? "" : "disabled"}>${budgetOpts}</select>
      <button class="small primary" data-act="greenlight" data-project="${f.id}" ${canPlan && !blocked ? "" : "disabled"} title="1 AP. Needs a director and a location; every person must be free to film.">Greenlight</button>
    </span>
    <button class="small" data-act="rewrite" data-project="${f.id}" ${canPlan && !eventMods().strike ? "" : "disabled"} title="1 AP, ${fmtMoney(REWRITE_COST)}. Usually improves the script — less each time.">Rewrite</button>
    <button class="small" data-act="pitch" data-project="${f.id}" ${canPlan && pitch >= 1 ? "" : "disabled"} title="Free. Investors pay now for ${INVESTOR_SHARE * 100}% of the box office. Bigger names attached = more money.">Pitch investors${pitch >= 1 ? ` (+${fmtMoney(pitch)})` : ""}</button>
  </div>
  ${missing.length ? `<div class="small muted">Needs ${missing.join(" and ")} before greenlight.</div>` : ""}
  ${conflicts.length ? `<div class="small bad">${conflicts.map(h).join("; ")}.</div>` : ""}
  ${!missing.length && unknowns ? `<div class="small muted">${unknowns} role${unknowns > 1 ? "s" : ""} will go to unknowns (−${UNKNOWN_QUALITY_PENALTY} quality each).</div>` : ""}
  ${f.pitched ? `<div class="small muted">Investors own ${f.investorShare * 100}% of the box office.</div>` : ""}`;
}

function marketingButtons(f, canPlan) {
  return `<span class="inline-form">
    <button class="small" data-act="market" data-size="SMALL" data-project="${f.id}" ${canPlan ? "" : "disabled"} title="Free action">${MARKETING.SMALL.name} ${fmtMoney(MARKETING.SMALL.cost)}</button>
    <button class="small" data-act="market" data-size="BIG" data-project="${f.id}" ${canPlan ? "" : "disabled"} title="Free action">${MARKETING.BIG.name} ${fmtMoney(MARKETING.BIG.cost)}</button>
  </span>`;
}

function renderStageInfo(f, p, canPlan) {
  switch (f.status) {
    case STATUS.DEV: {
      const est = estimateQuality(f, f.pendingGreenlight?.budget || "STUDIO");
      const breakdown = qualityBreakdown(f, f.pendingGreenlight?.budget || "STUDIO").map((i) => `${i.value >= 0 ? "+" : ""}${i.value} ${i.label}`).join("\n");
      const interested = interestedTalent(f, p.index, 4);
      return `
        <div class="meters">
          <div title="${h(breakdown)}"><span class="stat-label">Expected quality</span> ${meter(est, 100, "meter--quality")} ${est}</div>
          <div><span class="stat-label">Hype</span> ${meter(f.hype, 100, "meter--hype")} ${f.hype}</div>
        </div>
        ${interested.length ? `<div class="interested small">Interested: ${interested.map((x) => `<button class="link" data-act="cast" data-project="${f.id}" data-slot="${x.slot}" data-focus="${x.talent.id}">${h(x.talent.name)}</button>`).join(", ")}</div>` : ""}
        ${renderDevActions(f, p, canPlan)}`;
    }
    case STATUS.FILMING: {
      const done = f.shootTotal - f.quartersLeft;
      return `<div class="meters">
          <div><span class="stat-label">Filming</span> ${meter(done, f.shootTotal, "meter--film")} ${done}/${f.shootTotal} qtrs${f.shootTotal > (f.shootPlanned || f.shootTotal) ? ` <span class="bad small">(delayed)</span>` : ""}</div>
          <div><span class="stat-label">Hype</span> ${meter(f.hype, 100, "meter--hype")} ${f.hype}</div>
        </div>
        <div class="small muted">${h(BUDGETS[f.budget].name)} budget · wraps in ${f.quartersLeft} quarter${f.quartersLeft > 1 ? "s" : ""}. Cast and location are booked until then.</div>
        <div class="film-actions">${marketingButtons(f, canPlan)}</div>`;
    }
    case STATUS.CANNED: {
      const g = GENRES[f.genre];
      const now = g.season[seasonOf(state.quarter)];
      const next = g.season[seasonOf(state.quarter + 1)];
      return `<div class="meters"><div><span class="stat-label">Hype</span> ${meter(f.hype, 100, "meter--hype")} ${f.hype} <span class="small muted">(fades while it sits)</span></div></div>
        <div class="small">${h(QUARTERS[seasonOf(state.quarter)].name)} is ${now >= 1.15 ? "great" : now <= 0.9 ? "weak" : "fine"} for ${h(g.name)} (x${now})${next > now ? `; next quarter is better (x${next})` : ""}.</div>
        <div class="film-actions">
          <button class="small primary" data-act="release" data-project="${f.id}" ${canPlan ? "" : "disabled"} title="1 AP">Release this quarter</button>
          ${marketingButtons(f, canPlan)}
        </div>`;
    }
    case STATUS.SCHEDULED:
      return `<div class="meters"><div><span class="stat-label">Hype</span> ${meter(f.hype, 100, "meter--hype")} ${f.hype}</div></div>
        <div class="banner banner--small">Opens in theaters at the end of this quarter.</div>
        <div class="film-actions">${marketingButtons(f, canPlan)}</div>`;
    case STATUS.THEATERS:
      return `<div class="theater-info">
          <div>${criticStars(f.critic)} <strong>${f.critic}</strong> <span class="small muted">${h(criticQuip(f.critic))}</span></div>
          <div class="small">Week ${f.run} of ${RUN_LENGTH} · ${f.grosses.map((g, i) => `Q${i + 1}: ${fmtMoney(g)}`).join(" · ")}</div>
          <div class="small">Total ${fmtMoney(f.totalGross)} · your take ${fmtMoney(f.studioTake)} · cost ${fmtMoney(f.cost)}</div>
        </div>`;
    default:
      return "";
  }
}

function renderFilmCard(f, p, canPlan) {
  return `<article class="film-card film-card--${f.status.toLowerCase()}" style="--genre:var(--genre-${f.genre})">
    <header class="film-head">
      ${genreBadge(f.genre)}
      <h3>${h(f.title)}</h3>
      <span class="status-pill status-pill--${f.status.toLowerCase()}">${h(STATUS_LABEL[f.status])}</span>
    </header>
    <p class="logline">${h(f.logline)}</p>
    <div class="film-meta small">
      <span title="Script quality">📜 ${f.quality}</span>
      ${writerTag(f)}
      <span title="Base shoot length">🎥 ${f.shoot} qtr base</span>
      <span>Cost so far ${fmtMoney(f.cost)}</span>
    </div>
    ${renderPeople(f, canPlan && f.status === STATUS.DEV)}
    ${renderLocationRow(f, canPlan)}
    ${renderStageInfo(f, p, canPlan)}
  </article>`;
}
