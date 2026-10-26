// Small HTML builders shared by the panels. All text goes through h() (escapeHtml).

const h = escapeHtml;

// Money tied up in sealed offers and pending greenlights (already taken out of cash)
function committedCash(pi) {
  const offers = state.offers.filter((o) => o.pi === pi).reduce((n, o) => n + (o.kind === "SCRIPT" ? o.amount : o.fee), 0);
  const gl = state.players[pi].projects.reduce((n, f) => n + (f.pendingGreenlight?.escrow || 0), 0);
  return roundMoney(offers + gl);
}
function upkeepDue(p) { return roundMoney(OVERHEAD + p.debt * LOAN_INTEREST * (eventMods().interestMult || 1)); }
function loanRoom(p) { return Math.max(0, MAX_DEBT - p.debt); }

// "Bank $40M · this costs $12M → $28M left" with a shortfall warning
function bankLine(cost = null) {
  const p = me();
  const after = cost === null ? null : roundMoney(p.cash - cost);
  return `<div class="bank-line ${after !== null && after < 0 ? "bank-line--short" : ""}">
    🏦 Bank <strong>${fmtMoney(p.cash)}</strong>
    ${after !== null ? ` · costs ${fmtMoney(cost)} → ${after < 0 ? `<strong>short ${fmtMoney(-after)}</strong>` : `${fmtMoney(after)} left`}` : ""}
    <button class="small" data-act="open-finance">Need money?</button>
  </div>`;
}

// Money inputs are typed in the dollars shown on screen ($M, or $K for small sums in old eras)
// and converted back to the engine's today's-dollar $M.
function moneyInput(attr, id, amount, disabled) {
  const shown = amount * priceLevel();
  const unit = shown < 1 ? "K" : "M";
  const value = unit === "K" ? Math.ceil(shown * 1000) : Math.ceil(shown * 100) / 100;
  return `<span class="money-input">$<input type="number" min="0" step="${unit === "K" ? 1 : 0.1}" value="${value}" ${attr}="${id}" data-unit="${unit}" ${disabled ? "disabled" : ""} />${unit}</span>`;
}
function readMoneyInput(el) {
  if (!el) return NaN;
  return Number(el.value) / (el.dataset.unit === "K" ? 1000 : 1) / priceLevel();
}

// "Sci-Fi ×1.35 · box office ×0.8 · no new scripts" — what a history entry does, in words
function describeMods(m) {
  const pct = (x) => `${x >= 1 ? "+" : "−"}${Math.round(Math.abs(x - 1) * 100)}%`;
  const out = [];
  if (m.boxOfficeMult) out.push(`box office ${pct(m.boxOfficeMult)}`);
  Object.entries(m.genreMult || {}).forEach(([g, x]) => out.push(`${GENRES[g].name} ${pct(x)}`));
  if (m.summerMult) out.push(`summer box office ${pct(m.summerMult)}`);
  if (m.indieMult) out.push(`indie audiences ${pct(m.indieMult)}`);
  if (m.budgetMult) out.push(`budgets ${pct(m.budgetMult)}`);
  if (m.pitchMult) out.push(`investor money ${pct(m.pitchMult)}`);
  if (m.criticBonus) out.push(`critics +${m.criticBonus}`);
  if (m.libraryIncome) out.push(`library films earn ${fmtMoney(m.libraryIncome)}/qtr each`);
  if (m.strike) out.push("no new scripts or rewrites");
  if (m.actorsStrike || m.filmingPause) out.push("no shoots start; shoots pause");
  return out.join(" · ");
}

function loanRatePerYear() {
  return LOAN_INTEREST * 4 * (eventMods().interestMult ?? 1) * 100;
}

function genreBadge(genre) {
  if (!genre) return `<span class="genre-badge genre-badge--none">Package</span>`;
  return `<span class="genre-badge" style="--genre:var(--genre-${genre})">${h(GENRES[genre].name)}</span>`;
}

function studioChip(pi) {
  const p = state.players[pi];
  return `<span class="studio-chip" style="--pc:var(--player-${p.color})" title="${h(p.studio)} — ${h(p.name)}${p.ai ? " (AI)" : ""}">${h(p.tag)}</span>`;
}

function studioName(pi) {
  const p = state.players[pi];
  return `<span class="studio-name" style="--pc:var(--player-${p.color})">${h(p.studio)}</span>`;
}

function meter(value, max, cls = "") {
  const pct = clamp((value / max) * 100, 0, 100);
  return `<span class="meter ${cls}"><span style="width:${pct}%"></span></span>`;
}

function statLine(label, value) {
  return `<span class="stat"><span class="stat-label">${h(label)}</span> <strong>${value}</strong></span>`;
}

function talentTitle(t) {
  const likes = t.likes.map((g) => GENRES[g].name).join(", ");
  const locs = t.locs.map((id) => locationById(id)?.name).filter(Boolean).join(", ");
  const friends = t.friends.map((id) => talentById(id)?.name).filter(Boolean).join(", ");
  const rivals = t.rivals.map((id) => talentById(id)?.name).filter(Boolean).join(", ");
  return [
    `${t.role === "DIRECTOR" ? "Director" : "Star"} — skill ${t.skill}, fame ${t.fame}`,
    `Loves: ${likes}`,
    `Wants to shoot at: ${locs}`,
    friends && `Friends: ${friends}`,
    rivals && `Won't work with: ${rivals}`,
    t.role === "DIRECTOR" && t.speed !== 0 && (t.speed < 0 ? "Fast shooter (-1 quarter)" : "Slow shooter (+1 quarter)")
  ].filter(Boolean).join("\n");
}

function talentTag(t) {
  if (!t) return `<span class="muted">—</span>`;
  const busy = filmingProjectOfTalent(t.id);
  return `<span class="talent-tag ${t.fame >= A_LIST_FAME ? "talent-tag--alist" : ""}" title="${h(talentTitle(t))}">${h(t.name)}`
    + ` <span class="talent-stats">${t.skill}/${t.fame}</span>`
    + (t.unavailable ? ` <span class="pill pill--bad">Arrested</span>` : "")
    + (busy ? ` <span class="pill pill--busy" title="Filming &quot;${h(busy.title)}&quot;">On set</span>` : "")
    + `</span>`;
}

function writerTag(f) {
  const w = writerById(f.writerId);
  if (!w) return "";
  return `<span class="writer-tag" title="Writer rep ${w.rep}/5 — ${w.specialty === "BIG" ? "best with Studio/Blockbuster budgets" : "best with Indie budgets"}">✍ ${h(w.name)} ${"★".repeat(w.rep)} <span class="pill">${w.specialty === "BIG" ? "Big-budget" : "Indie"}</span></span>`;
}

function reasonsHtml(reasons, limit = 4) {
  return reasons.slice(0, limit).map((r) =>
    `<span class="reason ${r.value >= 0 ? "reason--pos" : "reason--neg"}">${r.value >= 0 ? "+" : ""}${r.value} ${h(r.label)}</span>`).join("");
}

function verdictPill(score) {
  const v = appealVerdict(score);
  const cls = score >= 6 ? "good" : score >= ACCEPT_THRESHOLD ? "ok" : "bad";
  return `<span class="verdict verdict--${cls}" title="Appeal ${score}">${v}</span>`;
}

function seasonNote(q) {
  const s = seasonOf(q);
  const hot = GENRE_KEYS.filter((g) => GENRES[g].season[s] >= 1.2).map((g) => GENRES[g].name);
  const cold = GENRE_KEYS.filter((g) => GENRES[g].season[s] <= 0.85).map((g) => GENRES[g].name);
  return [hot.length && `Hot: ${hot.join(", ")}`, cold.length && `Cold: ${cold.join(", ")}`].filter(Boolean).join(" · ");
}

function apPips(p) {
  const total = Math.max(p.ap, p.apMax || BASE_AP);
  return Array.from({ length: total }, (_, i) => `<span class="ap-pip ${i < p.ap ? "ap-pip--on" : ""}"></span>`).join("");
}
