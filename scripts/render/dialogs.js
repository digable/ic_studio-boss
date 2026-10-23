// Dialogs: casting (make talent offers), quarter results, rules, and the hot-seat pass screen.

// --- casting ---------------------------------------------------------------------

function openCastDialog(projectId, slot, focusId = null) {
  client.cast = { projectId, slot: slot === "DIRECTOR" ? "DIRECTOR" : Number(slot), focusId };
  renderCastDialog();
  const dlg = document.getElementById("castDialog");
  if (!dlg.open) dlg.showModal();
  if (focusId) dlg.querySelector(`[data-row="${focusId}"]`)?.scrollIntoView({ block: "center" });
}

function castCandidates(f, slot) {
  const attached = new Set(attachedTalentIds(f));
  return Object.values(state.talent)
    .filter((t) => slotFits(t, slot) && !attached.has(t.id))
    .map((t) => {
      const ask = askingFeeFor(t, f, slot);
      return { t, ask, appeal: talentAppeal(t, f, client.viewer, slot, ask) };
    })
    .sort((a, b) => b.appeal.score - a.appeal.score || b.t.fame - a.t.fame);
}

function renderCastDialog() {
  const dlg = document.getElementById("castDialog");
  const found = findProject(client.cast?.projectId);
  if (!found || found.project.status !== STATUS.DEV) { if (dlg.open) dlg.close(); return; }
  const f = found.project;
  const p = me();
  const slot = client.cast.slot;
  const slots = openSlots(f);
  const pending = pendingOfferFor(f, slot);
  const canPlan = state.phase === "PLANNING" && !p.ready;

  const tabs = slots.map((s) => `<button type="button" class="small ${s === slot ? "seg--on" : ""}" data-act="cast-slot" data-slot="${s}">${h(slotLabel(f, s))}</button>`).join("");
  const rows = castCandidates(f, slot).map(({ t, ask, appeal }) => {
    const busy = filmingProjectOfTalent(t.id);
    const mine = p.roster.includes(t.id);
    const offered = state.offers.some((o) => o.pi === client.viewer && o.projectId === f.id && o.talentId === t.id);
    let control;
    if (mine) control = `<button class="small primary" data-act="attach-direct" data-talent="${t.id}">Attach (free, under contract)</button>`;
    else if (offered) control = `<span class="pill pill--pending">Offer out</span>`;
    else if (pending) control = `<span class="small muted">You already have an offer out for this role</span>`;
    else control = `<span class="inline-form">$<input type="number" min="1" step="1" value="${ask}" data-fee-for="${t.id}" ${canPlan ? "" : "disabled"} />M
        <button class="small primary" data-act="offer" data-talent="${t.id}" ${canPlan ? "" : "disabled"} title="1 AP. The fee is held until the quarter ends; refunded if they say no.">Make offer</button></span>`;
    return `<div class="cast-row ${client.cast.focusId === t.id ? "cast-row--focus" : ""}" data-row="${t.id}">
      <div class="cast-who">${talentTag(t)}
        <div class="small muted">Asks ${fmtMoney(ask)} · loves ${t.likes.map((g) => GENRES[g].name).join(", ")}${busy ? ` · <span class="bad">filming "${h(busy.title)}" (${busy.quartersLeft} qtr left)</span>` : ""}</div>
      </div>
      <div class="cast-appeal" data-appeal-for="${t.id}">${verdictPill(appeal.score)} <span class="reasons">${reasonsHtml(appeal.reasons)}</span></div>
      <div class="cast-offer">${control}</div>
    </div>`;
  }).join("");

  dlg.innerHTML = `<div class="modal-head">
      <h2>Casting "${h(f.title)}"</h2>
      <button class="small" data-act="close-dialog">Close</button>
    </div>
    <div class="seg">${tabs}</div>
    <p class="small muted">Offers are sealed and settle at the end of the quarter. Each person signs with the single best offer they get —
      money matters, but so do genre, location, co-stars, the writer, the director and your prestige. You have ${p.ap} AP left.</p>
    <div class="cast-list">${rows || `<div class="empty">Nobody available for this role.</div>`}</div>`;
}

// Live appeal preview as the fee changes
function updateAppealPreview(input) {
  const found = findProject(client.cast?.projectId);
  if (!found) return;
  const t = talentById(input.dataset.feeFor);
  const a = talentAppeal(t, found.project, client.viewer, client.cast.slot, Number(input.value) || 0);
  const cell = document.querySelector(`[data-appeal-for="${t.id}"]`);
  if (cell) cell.innerHTML = `${verdictPill(a.score)} <span class="reasons">${reasonsHtml(a.reasons)}</span>`;
}

// --- quarter results -------------------------------------------------------------

function openResultsDialog() {
  const r = state.lastReport;
  if (!r) return;
  const dlg = document.getElementById("resultsDialog");
  const viewers = isHotSeat() ? humanIndexes() : [client.viewer];
  const deals = viewers.map((pi) => {
    const mine = r.deals.filter((d) => d.pi === pi);
    if (!mine.length) return "";
    return `<h4>${studioName(pi)}</h4><ul class="deal-list">${mine.map((d) => `<li class="${d.ok ? "good" : "bad"}">${d.ok ? "✓" : "✗"} ${h(d.text)}</li>`).join("")}</ul>`;
  }).join("");
  const fin = r.finances.filter((x) => viewers.includes(x.pi)).map((x) =>
    `<li>${studioName(x.pi)}: overhead ${fmtMoney(x.overhead)}${x.interest ? `, interest ${fmtMoney(x.interest)}` : ""}${x.loans ? `, <span class="bad">emergency loan ${fmtMoney(x.loans)}</span>` : ""}</li>`).join("");
  const awards = r.awards.length
    ? `<div class="awards-box"><h3>🌽 Golden Cob Awards — Year ${Math.floor(r.quarter / 4) + 1}</h3><ul>${r.awards.map((a) =>
        `<li><strong>${h(a.award)}</strong>: "${h(a.title)}" — ${studioName(a.pi)} <span class="small muted">+${a.prestige} prestige</span></li>`).join("")}</ul></div>`
    : "";
  const over = state.phase === "GAME_OVER";

  dlg.innerHTML = `<div class="modal-head">
      <h2>${over ? "Final quarter" : "Quarter report"} — ${h(r.label)}</h2>
      <button class="small" data-act="close-dialog">Close</button>
    </div>
    ${deals ? `<h3>Deals</h3>${deals}` : ""}
    <h3>Box office</h3>
    ${boxOfficeBars(r.films)}
    ${awards}
    ${fin ? `<h3>Books</h3><ul class="small">${fin}</ul>` : ""}
    ${over ? renderFinalStandings() : `<p class="small muted">Up next: <strong>${h(quarterLabel(state.quarter))}</strong> — ${h(state.event?.name || "")}.</p>
      <button class="primary" data-act="close-dialog">Back to planning</button>`}`;
  if (!dlg.open) dlg.showModal();
}

// --- rules -----------------------------------------------------------------------

function openRulesDialog() {
  const dlg = document.getElementById("rulesDialog");
  dlg.innerHTML = `<div class="modal-head"><h2>How to play</h2><button class="small" data-act="close-dialog">Close</button></div>
  <div class="rules">
    <p><strong>You run a movie studio.</strong> The studio worth the most at the end wins:
      cash − debt + ${PRESTIGE_VALUE}× prestige + ${LIBRARY_RATE * 100}% of lifetime box office.</p>
    <h3>Each quarter</h3>
    <ol>
      <li><strong>News &amp; initiative.</strong> An industry event shakes things up and everyone draws an initiative card (it breaks ties).</li>
      <li><strong>Plan — everyone at once.</strong> Spend your action points (${BASE_AP}, +1 per A-list star on your books, max +${MAX_BONUS_AP}), then hit Ready.</li>
      <li><strong>Resolution.</strong> Script bids, talent offers, greenlights, production and the box office all settle at once.</li>
    </ol>
    <h3>Making a movie</h3>
    <ol>
      <li><strong>Get a script</strong> — sealed bid in the Script market (1 AP). Scripts list their main roles (1–4), base shoot length and writer.
        Writers are big-budget or indie specialists and add quality when the budget matches.</li>
      <li><strong>Attach people</strong> — "Find talent" on a project (1 AP per offer). Each person signs with the <em>best</em> offer they get that quarter:
        fee, genre they love, location, friends or feuds among the cast, the writer, the director and your prestige all count. Losing offers are refunded.</li>
      <li><strong>Scout a location</strong> (1 AP). Some suit certain genres; some draw talent.</li>
      <li><strong>Greenlight</strong> (1 AP) with an Indie, Studio or Blockbuster budget. Needs a director and a location; empty roles go to unknowns.
        Shoot length = script base, −1 Indie, +1 Blockbuster, ±1 for fast/slow directors.</li>
      <li><strong>Filming.</strong> People and locations can be attached to many projects, but can only <em>film</em> one at a time — a long shoot ties up your stars.</li>
      <li><strong>Release</strong> (1 AP) when the season suits the genre. Films earn for ${RUN_LENGTH} quarters; good reviews mean long legs, and films of the same genre steal each other's audience.</li>
    </ol>
    <h3>Free actions (any time while planning)</h3>
    <ul>
      <li><strong>Pitch investors</strong> — cash now for ${INVESTOR_SHARE * 100}% of that film's box office. Bigger names attached = bigger cheque.</li>
      <li><strong>Marketing</strong> — buy hype for films that are filming or waiting for release.</li>
      <li><strong>Loans</strong> — ${fmtMoney(LOAN_SIZE)} at ${LOAN_INTEREST * 100}%/quarter, up to ${fmtMoney(MAX_DEBT)}.</li>
      <li><strong>Attach contracted talent</strong> from your starting hand.</li>
    </ul>
    <h3>Scandals (optional)</h3>
    <p>With scandals on, a random scandal may break each quarter, and studios hold scandal cards to play on rivals
      (Leak to the Tabloids, Bad Test Screening…) or to protect themselves (Damage Control).</p>
    <h3>Golden Cob Awards</h3>
    <p>Each Q4: Best Picture (+${AWARDS.BEST_PICTURE.prestige}), Golden Popcorn for top gross (+${AWARDS.GOLDEN_POPCORN.prestige}), Best Indie (+${AWARDS.BEST_INDIE.prestige}).
      Prestige raises your studio value, adds hype to your releases, and makes talent want to work with you.</p>
  </div>`;
  dlg.showModal();
}

// --- hot-seat pass screen ------------------------------------------------------------

function showPassScreen(pi) {
  const p = state.players[pi];
  const el = document.getElementById("passScreen");
  el.innerHTML = `<div class="pass-card">
    <div class="pass-quarter">${h(quarterLabel(state.quarter))}</div>
    <h2>Pass to ${h(p.name)}</h2>
    <p>${studioName(pi)}</p>
    <p class="small muted">Offers are sealed — no peeking at the other studios' plans.</p>
    <button class="primary" data-act="pass-ready">I'm ${h(p.name)} — start planning</button>
  </div>`;
  el.classList.remove("hidden");
}
