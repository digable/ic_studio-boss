// End-of-quarter resolution, run once every studio is ready (or the timer runs out).
// Order: script bids -> talent offers -> production -> greenlights -> box office -> upkeep -> awards.

function initiativeRank(pi) {
  const r = state.initiative.indexOf(pi);
  return r < 0 ? 99 : r;
}

function note(report, pi, text, ok = true) { report.deals.push({ pi, text, ok }); }

function resolveScriptBids(report) {
  const bids = state.offers.filter((o) => o.kind === "SCRIPT");
  const byScript = new Map();
  bids.forEach((o) => { if (!byScript.has(o.scriptId)) byScript.set(o.scriptId, []); byScript.get(o.scriptId).push(o); });

  for (const [scriptId, list] of byScript) {
    const idx = state.market.scripts.findIndex((s) => s.id === scriptId);
    const s = state.market.scripts[idx];
    list.sort((a, b) =>
      (b.amount + state.players[b.pi].prestige) - (a.amount + state.players[a.pi].prestige) ||
      initiativeRank(a.pi) - initiativeRank(b.pi));
    const [win, ...losers] = list;
    const winner = state.players[win.pi];
    const f = projectFromScript(s);
    f.cost = win.amount;
    winner.projects.push(f);
    state.market.scripts.splice(idx, 1);
    note(report, win.pi, `You won the script "${s.title}" for ${fmtMoney(win.amount)}.`);
    logLine(`${winner.studio} buys the script "${s.title}".`, win.pi);
    for (const o of losers) {
      state.players[o.pi].cash = round1(state.players[o.pi].cash + o.amount);
      note(report, o.pi, `${winner.studio} outbid you for "${s.title}". Your ${fmtMoney(o.amount)} is refunded.`, false);
    }
  }
}

function resolveTalentOffers(report) {
  const offers = state.offers.filter((o) => o.kind === "TALENT");
  const byTalent = new Map();
  offers.forEach((o) => { if (!byTalent.has(o.talentId)) byTalent.set(o.talentId, []); byTalent.get(o.talentId).push(o); });

  const refund = (o, text) => {
    state.players[o.pi].cash = round1(state.players[o.pi].cash + o.fee);
    note(report, o.pi, text, false);
  };

  for (const [tid, list] of byTalent) {
    const t = talentById(tid);
    const scored = [];
    for (const o of list) {
      const found = findProject(o.projectId);
      const f = found?.project;
      if (!f || f.status !== STATUS.DEV || slotFilled(f, o.slot) || attachedTalentIds(f).includes(tid)) {
        refund(o, `Your offer to ${t.name} lapsed — the role on "${o.title}" was no longer open.`);
        continue;
      }
      const a = talentAppeal(t, f, o.pi, o.slot, o.fee, { mood: randInt(-4, 4), poach: state.players[o.pi].poachBonus });
      scored.push({ o, f, a });
    }
    if (!scored.length) continue;
    scored.sort((x, y) => y.a.score - x.a.score || y.o.fee - x.o.fee || initiativeRank(x.o.pi) - initiativeRank(y.o.pi));
    const best = scored[0];
    const signs = best.a.score >= ACCEPT_THRESHOLD;
    if (signs) {
      const f = best.f;
      attach(f, t, best.o.slot);
      f.cost = round1(f.cost + best.o.fee);
      const why = best.a.reasons.filter((r) => r.value > 0).slice(0, 2).map((r) => r.label.toLowerCase()).join(", ");
      note(report, best.o.pi, `${t.name} signs on to "${f.title}" as ${slotLabel(f, best.o.slot)}${why ? ` (${why})` : ""}.`);
      logLine(`${t.name} signs with ${state.players[best.o.pi].studio} for "${f.title}".`, best.o.pi);
    } else {
      const worst = best.a.reasons.filter((r) => r.value < 0)[0];
      refund(best.o, `${t.name} turned down "${best.f.title}"${worst ? ` — ${worst.label.toLowerCase()}` : ""}. Refunded.`);
    }
    for (const s of scored.slice(1)) {
      if (signs) {
        const winStudio = state.players[best.o.pi].studio;
        const top = best.a.reasons.find((r) => r.value > 0);
        refund(s.o, `${t.name} chose "${best.f.title}" (${winStudio}) over "${s.f.title}"${top ? ` — ${top.label.toLowerCase()}` : ""}. Refunded.`);
      } else {
        const worst = s.a.reasons.filter((r) => r.value < 0)[0];
        refund(s.o, `${t.name} turned down "${s.f.title}"${worst ? ` — ${worst.label.toLowerCase()}` : ""}. Refunded.`);
      }
    }
  }
}

const PRODUCTION_EVENTS = [
  { weight: 3, run: (f, p) => { const extra = round1(BUDGETS[f.budget].cost * 0.15); p.cash = round1(p.cash - extra); f.cost = round1(f.cost + extra); return `goes over budget (${fmtMoney(extra)})`; } },
  { weight: 2, run: (f) => { f.qualityMod += 6; return "has on-set magic (+6 quality)"; } },
  { weight: 2, run: (f) => { f.hype = Math.min(100, f.hype + 10); return "has set photos go viral (+10 hype)"; } },
  { weight: 2, run: (f) => { f.qualityMod -= 6; return "suffers creative differences (-6 quality)"; } },
  { weight: 1, run: (f) => { f.quartersLeft += 1; f.shootTotal += 1; return "needs reshoots (+1 quarter)"; } },
  { weight: 1, run: (f) => { if (f.quartersLeft <= 1) return null; f.quartersLeft -= 1; f.shootTotal -= 1; return "finishes ahead of schedule (-1 quarter)"; } }
];

function tickProduction(report) {
  state.players.forEach((p, pi) => {
    for (const f of p.projects) {
      if (f.status === STATUS.CANNED) f.hype = Math.max(0, f.hype - 4);
      if (f.status !== STATUS.FILMING) continue;
      if (chance(0.15)) {
        const what = weightedPick(PRODUCTION_EVENTS, (e) => e.weight).run(f, p);
        if (what) logLine(`"${f.title}" ${what}.`, pi);
      }
      f.quartersLeft--;
      if (f.quartersLeft <= 0) {
        f.status = STATUS.CANNED;
        f.quartersLeft = 0;
        report.wraps.push({ pi, title: f.title });
        logLine(`"${f.title}" wraps production. It's in the can.`, pi);
      }
    }
  });
}

function resolveGreenlights(report) {
  const pending = [];
  state.players.forEach((p, pi) => p.projects.forEach((f) => { if (f.pendingGreenlight) pending.push({ p, pi, f }); }));
  pending.sort((a, b) => initiativeRank(a.pi) - initiativeRank(b.pi));
  for (const { p, pi, f } of pending) {
    const gl = f.pendingGreenlight;
    f.pendingGreenlight = null;
    const conflicts = f.status === STATUS.DEV ? greenlightConflicts(f, false) : ["it's no longer in development"];
    if (conflicts.length) {
      p.cash = round1(p.cash + gl.escrow);
      note(report, pi, `"${f.title}" couldn't start filming: ${conflicts[0]}. Budget refunded.`, false);
      continue;
    }
    f.status = STATUS.FILMING;
    f.budget = gl.budget;
    f.cost = round1(f.cost + gl.escrow);
    f.quartersLeft = shootLength(f, gl.budget);
    f.shootTotal = f.quartersLeft;
    f.shootPlanned = f.quartersLeft;
    f.hype = Math.min(100, f.hype + 5);
    note(report, pi, `Cameras roll on "${f.title}" — ${f.shootTotal} quarter${f.shootTotal > 1 ? "s" : ""} of filming.`);
    logLine(`${p.studio} starts filming "${f.title}" (${BUDGETS[f.budget].name}).`, pi);
  }
}

function openFilm(p, f, mods) {
  f.critic = rollCritic(f, mods.criticBonus || 0);
  f.hype = Math.min(100, f.hype + p.prestige * 2);
  f.luck = round1(randRange(0.7, 1.3) * 100) / 100;
  f.status = STATUS.THEATERS;
  f.run = 0;
  f.releasedQuarter = state.quarter;
  for (const id of attachedTalentIds(f)) {
    const t = talentById(id);
    t.films++;
    if (f.critic >= 80) t.fame = Math.min(10, t.fame + 1);
    if (f.critic < 35 && id === f.cast[0]) t.fame = Math.max(1, t.fame - 1);
  }
  const w = writerById(f.writerId);
  if (w && f.critic >= 75) w.rep = Math.min(5, w.rep + 1);
}

function runBoxOffice(report, mods) {
  const q = state.quarter;
  const showing = [];
  state.players.forEach((p, pi) => p.projects.forEach((f) => {
    if (f.status === STATUS.SCHEDULED) { openFilm(p, f, mods); showing.push({ project: f, pi }); }
    else if (f.status === STATUS.THEATERS) showing.push({ project: f, pi });
  }));
  const grosses = showing.map((e) => grossFor(e, showing, q, mods));
  showing.forEach((e, i) => {
    const f = e.project;
    const p = state.players[e.pi];
    const gross = grosses[i];
    const take = round1(gross * (1 - f.investorShare));
    f.grosses.push(gross);
    f.totalGross = round1(f.totalGross + gross);
    f.studioTake = round1(f.studioTake + take);
    p.cash = round1(p.cash + take);
    p.lifetimeGross = round1(p.lifetimeGross + take);
    report.films.push({ pi: e.pi, id: f.id, title: f.title, genre: f.genre, week: f.run, gross, critic: f.critic, total: f.totalGross });
    if (f.run === 0) logLine(`BOX OFFICE: "${f.title}" opens to ${fmtMoney(gross)} — ${criticQuip(f.critic)} (${f.critic}).`, e.pi);
    f.run++;
    if (f.run >= RUN_LENGTH) {
      f.status = STATUS.LIBRARY;
      logLine(`"${f.title}" leaves theaters: ${fmtMoney(f.totalGross)} total, cost ${fmtMoney(f.cost)}. ${verdictFor(f)}.`, e.pi);
    }
  });
  report.films.sort((a, b) => b.gross - a.gross);
}

function upkeep(report, mods) {
  state.players.forEach((p, pi) => {
    const interest = round1(p.debt * LOAN_INTEREST * (mods.interestMult || 1));
    p.cash = round1(p.cash - OVERHEAD - interest);
    let loans = 0;
    while (p.cash < 0 && p.debt + LOAN_SIZE <= MAX_DEBT) {
      p.cash = round1(p.cash + LOAN_SIZE);
      p.debt = round1(p.debt + LOAN_SIZE);
      loans++;
    }
    if (loans) logLine(`${p.studio} is short on cash. The bank lends ${fmtMoney(loans * LOAN_SIZE)}.`, pi, "warn");
    report.finances.push({ pi, overhead: OVERHEAD, interest, loans: loans * LOAN_SIZE });
  });
}

function holdAwards(q) {
  const year = Math.floor(q / 4);
  const films = allProjects().filter(({ project: f }) =>
    f.releasedQuarter !== null && Math.floor(f.releasedQuarter / 4) === year);
  if (!films.length) return [];
  const results = [];
  const give = (key, entry) => {
    if (!entry) return;
    const award = AWARDS[key];
    const p = state.players[entry.pi];
    p.prestige += award.prestige;
    attachedTalentIds(entry.project).forEach((id) => { const t = talentById(id); t.fame = Math.min(10, t.fame + 1); });
    const rec = { year: year + 1, award: award.name, title: entry.project.title, pi: entry.pi, prestige: award.prestige };
    results.push(rec);
    state.awards.push(rec);
    logLine(`GOLDEN COB AWARDS — ${award.name}: "${entry.project.title}" (${p.studio}) +${award.prestige} prestige.`, entry.pi, "award");
  };
  const byCritic = (a, b) => b.project.critic - a.project.critic || b.project.totalGross - a.project.totalGross;
  give("BEST_PICTURE", [...films].sort(byCritic)[0]);
  give("GOLDEN_POPCORN", [...films].sort((a, b) => b.project.totalGross - a.project.totalGross)[0]);
  give("BEST_INDIE", films.filter((e) => e.project.budget === "INDIE" && e.project.critic >= 50).sort(byCritic)[0]);
  return results;
}

function endGame() {
  state.phase = "GAME_OVER";
  state.planningDeadline = null;
  state.final = state.players
    .map((p, pi) => ({
      pi,
      value: studioValue(p),
      cash: p.cash,
      debt: p.debt,
      prestige: p.prestige,
      library: round1(p.lifetimeGross * LIBRARY_RATE)
    }))
    .sort((a, b) => b.value - a.value);
  const w = state.players[state.final[0].pi];
  logLine(`THAT'S A WRAP! ${w.studio} wins with a studio value of ${fmtMoney(state.final[0].value)}.`, state.final[0].pi, "award");
}

function beginQuarter() {
  const n = state.players.length;
  state.offers = [];
  state.event = drawEvent();
  state.initiative = shuffle([...Array(n).keys()]);
  startEvent(state.event);
  refreshScripts();
  if (scandalsOn() && state.quarter > 0 && state.quarter % 4 === 0) state.players.forEach((_, pi) => drawPlayableCard(pi));
  state.scandal = revealRandomScandal();
  state.players.forEach((p, pi) => { p.ready = false; p.poachBonus = 0; p.ap = apFor(pi); p.apMax = p.ap; });
  logLine(`${quarterLabel(state.quarter)} begins. Initiative: ${state.initiative.map((pi, i) => `${i + 1}. ${state.players[pi].studio}`).join("  ")}`, null, "quarter");
  state.planningDeadline = state.settings.timer ? Date.now() + state.settings.timer * 1000 : null;
  planAiStudios();
}

function resolveQuarter() {
  const q = state.quarter;
  const mods = eventMods();
  const report = { quarter: q, label: quarterLabel(q), event: state.event, scandal: state.scandal, deals: [], wraps: [], films: [], finances: [], awards: [] };

  resolveScriptBids(report);
  resolveTalentOffers(report);
  state.offers = [];
  tickProduction(report);
  resolveGreenlights(report);
  runBoxOffice(report, mods);
  upkeep(report, mods);
  if (seasonOf(q) === 3) report.awards = holdAwards(q);
  Object.values(state.talent).forEach((t) => { if (t.unavailable > 0) t.unavailable--; });

  state.lastReport = report;
  state.version++;
  if (q >= state.totalQuarters - 1) { endGame(); return; }
  state.quarter++;
  beginQuarter();
}
