// Small HTML builders shared by the panels. All text goes through h() (escapeHtml).

const h = escapeHtml;

function genreBadge(genre) {
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
