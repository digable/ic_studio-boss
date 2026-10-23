// Sidebar: Market (scripts, talent agency, locations) and Info (box office, rankings, awards, log).
// <details> open/closed state survives re-renders via client.openSections.

client.openSections = client.openSections || { scripts: true, agency: true, locations: false, boxoffice: true, rankings: true, awards: false, log: true };
client.agencyFilter = client.agencyFilter || "STAR";

function section(key, title, body) {
  return `<details data-section="${key}" ${client.openSections[key] ? "open" : ""}><summary>${title}</summary>${body}</details>`;
}

function renderSidebar() {
  document.getElementById("marketSection").innerHTML =
    section("scripts", "Script market", renderScriptMarket()) +
    section("agency", "Talent agency", renderAgency()) +
    section("locations", "Locations", renderLocations());
  document.getElementById("infoSection").innerHTML =
    section("boxoffice", `Box office${state.lastReport ? ` — ${h(state.lastReport.label)}` : ""}`, renderBoxOffice()) +
    section("rankings", "Studio rankings", renderRankings()) +
    section("awards", "Golden Cob Awards", renderAwards()) +
    section("log", "Trades", renderLog());
}

function renderScriptMarket() {
  const p = me();
  const canPlan = state.phase === "PLANNING" && !p.ready;
  if (!state.market.scripts.length) return `<div class="empty small">No scripts on the market this quarter.</div>`;
  return `<div class="small muted">Sealed bids. Highest bid wins (prestige counts as $1M per point); ties go to initiative.</div>` +
    state.market.scripts.map((s) => {
      const myBid = state.offers.find((o) => o.pi === client.viewer && o.kind === "SCRIPT" && o.scriptId === s.id);
      return `<div class="market-card" style="--genre:var(--genre-${s.genre})">
        <div class="market-card-head">${genreBadge(s.genre)} <strong>${h(s.title)}</strong></div>
        <div class="small logline">${h(s.logline)}</div>
        <div class="film-meta small">
          <span title="Script quality">📜 ${s.quality}</span>
          ${writerTag(s)}
          <span title="Main roles">🎭 ${s.roles.map((r) => ROLES[r].name).join(", ")}</span>
          <span title="Base shoot length">🎥 ${s.shoot} qtr</span>
          ${s.age ? `<span class="muted">Leaves in ${3 - s.age} qtr</span>` : ""}
        </div>
        ${myBid
          ? `<div class="pill pill--pending">Your bid: ${fmtMoney(myBid.amount)}</div>`
          : `<div class="inline-form">Ask ${fmtMoney(s.price)}
              <input type="number" min="${s.price}" step="1" value="${s.price}" data-bid-for="${s.id}" ${canPlan ? "" : "disabled"} />
              <button class="small primary" data-act="bid" data-script="${s.id}" ${canPlan ? "" : "disabled"} title="1 AP">Bid</button></div>`}
      </div>`;
    }).join("");
}

function renderAgency() {
  const filter = client.agencyFilter;
  const talent = Object.values(state.talent)
    .filter((t) => t.role === filter)
    .sort((a, b) => b.fame - a.fame || b.skill - a.skill);
  const rows = talent.map((t) => {
    const busy = filmingProjectOfTalent(t.id);
    const attachedTo = allProjects().filter((e) => e.project.status === STATUS.DEV && attachedTalentIds(e.project).includes(t.id));
    return `<tr>
      <td>${talentTag(t)}<div class="small muted">Loves ${t.likes.map((g) => GENRES[g].name).join(", ")}</div></td>
      <td class="num">${fmtMoney(askingFee(t))}</td>
      <td class="small">${busy ? `Filming "${h(busy.title)}"` : attachedTo.length ? `Attached to ${attachedTo.length}` : "Free"}</td>
    </tr>`;
  }).join("");
  return `<div class="seg">
      <button class="small ${filter === "STAR" ? "seg--on" : ""}" data-act="agency-filter" data-role="STAR">Stars</button>
      <button class="small ${filter === "DIRECTOR" ? "seg--on" : ""}" data-act="agency-filter" data-role="DIRECTOR">Directors</button>
    </div>
    <div class="small muted">Skill/fame shown after each name. Hover for likes, friends and feuds. Make offers from a project's "Find talent" button. People can be attached to many projects but only film one at a time.</div>
    <table class="table"><thead><tr><th>Name</th><th>Asks</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderLocations() {
  return `<table class="table"><thead><tr><th>Location</th><th>Fee</th><th>Best for</th><th></th></tr></thead><tbody>${
    LOCATIONS.map((l) => {
      const busy = filmingProjectAtLocation(l.id);
      return `<tr><td>${h(l.name)}${l.draw >= 2 ? ` <span class="pill" title="Talent like working here">Draws talent</span>` : ""}</td><td class="num">${fmtMoney(l.fee)}</td>
        <td class="small">${l.fit.map((g) => GENRES[g].name).join(", ")}</td>
        <td class="small">${busy ? `Booked: "${h(busy.title)}"` : "Open"}</td></tr>`;
    }).join("")
  }</tbody></table>`;
}

function boxOfficeBars(films) {
  if (!films.length) return `<div class="empty small">No films in theaters.</div>`;
  const max = Math.max(...films.map((f) => f.gross), 1);
  return films.map((f) => `<div class="bo-row">
    <div class="bo-label">${studioChip(f.pi)} <span class="bo-title" title="${h(f.title)}">${h(f.title)}</span>
      <span class="small muted">${f.week === 0 ? "NEW" : `wk ${f.week + 1}`} · ${f.critic}</span></div>
    <div class="bo-bar"><span style="width:${(f.gross / max) * 100}%; background:var(--player-${state.players[f.pi].color})"></span><em>${fmtMoney(f.gross)}</em></div>
  </div>`).join("");
}

function renderBoxOffice() {
  const r = state.lastReport;
  if (!r) return `<div class="empty small">The first box office report arrives at the end of this quarter.</div>`;
  return boxOfficeBars(r.films) + `<button class="small" data-act="show-results">Full quarter report</button>`;
}

function renderRankings() {
  const ranked = state.players.map((p, pi) => ({ p, pi, v: studioValue(p) })).sort((a, b) => b.v - a.v);
  return `<table class="table"><thead><tr><th>Studio</th><th>Cash</th><th>Debt</th><th>🌽</th><th>Value</th></tr></thead><tbody>${
    ranked.map(({ p, pi, v }) => `<tr class="${pi === client.viewer ? "me" : ""}">
      <td>${studioChip(pi)} ${h(p.studio)}<div class="small muted">${h(p.name)}${p.ai ? " · AI" : ""} · ${p.projects.filter(isActive).length} active</div></td>
      <td class="num">${fmtMoney(p.cash)}</td><td class="num">${fmtMoney(p.debt)}</td><td class="num">${p.prestige}</td><td class="num"><strong>${fmtMoney(v)}</strong></td>
    </tr>`).join("")
  }</tbody></table>`;
}

function renderAwards() {
  if (!state.awards.length) return `<div class="empty small">Awarded at the end of each year (Q4).</div>`;
  return `<ul class="award-list">${state.awards.map((a) =>
    `<li>🌽 <strong>Y${a.year} ${h(a.award)}</strong>: "${h(a.title)}" ${studioChip(a.pi)} <span class="small muted">+${a.prestige}</span></li>`).join("")}</ul>`;
}

function renderLog() {
  return `<ul class="log">${state.log.slice(-40).reverse().map((l) =>
    `<li class="log--${l.cls || "plain"}">${l.pi !== null && l.pi !== undefined && state.players[l.pi] ? studioChip(l.pi) + " " : ""}${h(l.text)}</li>`).join("")}</ul>`;
}
