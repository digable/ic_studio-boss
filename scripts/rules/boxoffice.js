// Box office: how much a film in theaters earns this quarter.

const BOX_OFFICE_SCALE = 1.05;   // worldwide gross in $M per point of appeal (tuned with tests/sim.js)
const RUN_WEIGHT = [1, 0.5, 0.2];   // how much a film crowds others by week of its run

function filmAppeal(f, q, mods) {
  const g = GENRES[f.genre];
  const b = BUDGETS[f.budget];
  const dir = talentById(f.director);
  const a = f.critic * 0.35 + f.hype * 0.45 + castFame(f) * 3.5 + (dir ? dir.fame * 1.5 : 0) + 8;
  let reach = g.indieFriendly && f.budget === "INDIE" ? b.reach * 1.3 : b.reach;
  if (f.budget === "INDIE") reach *= mods.indieMult ?? 1;
  const craze = (mods.genreMult || {})[f.genre] ?? 1;
  return a * reach * g.appeal * g.season[seasonOf(q)] * craze;
}

// Share of the opening a film keeps in later quarters — good reviews mean long legs
function filmLegs(f) {
  const second = 0.25 + f.critic / 250;
  return [1, second, second * (0.3 + f.critic / 300)][f.run] ?? 0;
}

// films: [{ project, pi }] currently showing (openings already have critic/luck set)
function grossFor(entry, films, q, mods) {
  const f = entry.project;
  let same = 0, other = 0;
  for (const o of films) {
    if (o === entry) continue;
    const w = RUN_WEIGHT[o.project.run] ?? 0;
    if (o.project.genre === f.genre) same += w; else other += w;
  }
  const competition = 1 / (1 + 0.3 * same + 0.05 * other);
  const summer = seasonOf(q) === 2 ? (mods.summerMult ?? 1) : 1;
  return roundMoney(filmAppeal(f, q, mods) * BOX_OFFICE_SCALE * filmLegs(f) * competition * f.luck * summer * (mods.boxOfficeMult ?? 1));
}

function verdictFor(f) {
  const ratio = f.cost > 0 ? f.studioTake / f.cost : 0;
  if (ratio >= 3) return "Smash hit";
  if (ratio >= 1.6) return "Hit";
  if (ratio >= 1) return "Profitable";
  if (ratio >= 0.6) return "Disappointment";
  return "Flop";
}

function criticQuip(score) {
  if (score >= 90) return "an instant classic";
  if (score >= 75) return "critics adore it";
  if (score >= 60) return "solid reviews";
  if (score >= 45) return "mixed reviews";
  if (score >= 30) return "critics pan it";
  return "a critical disaster";
}
