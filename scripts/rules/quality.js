// Film quality, shoot length and hype.

function shootLength(f, budgetKey) {
  const d = talentById(f.director);
  return Math.max(1, f.shoot + BUDGETS[budgetKey].shootMod + (d ? d.speed : 0));
}

// Weighted average skill of the cast; unfilled roles count as unknowns
function castSkill(f) {
  let total = 0, weights = 0;
  f.roles.forEach((r, i) => {
    const t = talentById(f.cast[i]);
    total += ROLES[r].weight * (t ? t.skill : UNKNOWN_SKILL);
    weights += ROLES[r].weight;
  });
  return weights ? total / weights : UNKNOWN_SKILL;
}

// Weighted fame of the cast — ensembles draw bigger audiences
function castFame(f) {
  return f.roles.reduce((n, r, i) => n + ROLES[r].weight * (talentById(f.cast[i])?.fame || 0), 0);
}

function chemistry(f) {
  const ids = attachedTalentIds(f);
  let v = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = talentById(ids[i]);
      if (a.friends.includes(ids[j])) v += 3;
      if (a.rivals.includes(ids[j])) v -= 6;
    }
  }
  return v;
}

function writerFit(f, budgetKey) {
  const w = writerById(f.writerId);
  if (!w || !budgetKey) return 0;
  const big = budgetKey !== "INDIE";
  return (w.specialty === "BIG") === big ? 6 : -2;
}

// Expected quality (before the random factor) as [{ label, value }]
function qualityBreakdown(f, budgetKey) {
  const items = [];
  if (!hasScript(f)) return items;
  const add = (label, v) => { const r = Math.round(v); if (r) items.push({ label, value: r }); };
  const d = talentById(f.director);
  const w = writerById(f.writerId);
  add("Script", f.quality * 0.45);
  add("Director", d ? d.skill * 2.5 : 0);
  add("Cast", castSkill(f) * 2.2);
  const unknowns = f.cast.filter((id) => !id).length;
  if (unknowns) add(`${unknowns} unknown${unknowns > 1 ? "s" : ""} cast`, -UNKNOWN_QUALITY_PENALTY * unknowns);
  if (w) add(`Writer (${w.specialty === "BIG" ? "big-budget" : "indie"} specialist)`, writerFit(f, budgetKey) + (w.rep - 2));
  const loc = locationById(f.location);
  if (loc) add(loc.fit.includes(f.genre) ? `${loc.name} suits ${GENRES[f.genre].name}` : `${loc.name} (poor fit)`, loc.fit.includes(f.genre) ? 5 : -2);
  if (budgetKey) add(`${BUDGETS[budgetKey].name} budget`, BUDGETS[budgetKey].quality);
  add("Genre", GENRES[f.genre].critic);
  add("Chemistry", chemistry(f));
  add("Production", f.qualityMod);
  return items;
}

function estimateQuality(f, budgetKey) {
  return clamp(qualityBreakdown(f, budgetKey).reduce((n, i) => n + i.value, 0), 1, 100);
}

function rollCritic(f, criticBonus = 0) {
  return clamp(Math.round(estimateQuality(f, f.budget) + randInt(-14, 14) + f.criticMod + criticBonus), 1, 100);
}

// Hype a newly attached person brings
function attachHype(t, f, slot) {
  if (slot === "DIRECTOR") return t.fame;
  return Math.round(t.fame * 2 * ROLES[f.roles[slot]].weight);
}

function criticStars(score) {
  const n = Math.round(clamp(score, 0, 100) / 20);
  return "★".repeat(n) + "☆".repeat(5 - n);
}
