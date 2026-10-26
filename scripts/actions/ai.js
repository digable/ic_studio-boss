// AI rival studios. They plan through the same performAction() calls as humans,
// then mark themselves ready. Styles: BLOCKBUSTER (big bets), INDIE (cheap and many), BALANCED.

function planAiStudios() {
  state.players.forEach((p, pi) => { if (p.ai && !p.ready) aiPlan(pi); });
}

function aiPlan(pi) {
  const p = state.players[pi];
  for (let guard = 0; guard < 40; guard++) {
    if (!aiStep(pi, p)) break;
  }
  p.ready = true;
}

function aiAct(pi, action) { return performAction(pi, action).ok; }

function aiPickBudget(p, f, remaining) {
  const order = p.aiStyle === "BLOCKBUSTER" ? ["BLOCKBUSTER", "STUDIO", "INDIE"]
    : p.aiStyle === "INDIE" ? ["INDIE", "STUDIO"]
    : ["STUDIO", "INDIE", "BLOCKBUSTER"];
  for (const b of order) {
    // Greenlit now -> films next quarter for L quarters -> released the quarter after
    if (shootLength(f, b) > remaining - 1) continue;
    if (b === "BLOCKBUSTER" && (f.quality < 50 || (p.aiStyle !== "BLOCKBUSTER" && p.cash < BUDGETS.BLOCKBUSTER.cost * 2))) continue;
    if (greenlightCost(f, b) > p.cash - OVERHEAD * 2) continue;
    return b;
  }
  return null;
}

function aiBestLocation(f) {
  const scored = LOCATIONS.map((l) => ({
    l,
    v: (l.fit.includes(f.genre) ? 10 : 0) + l.draw * 2 - l.fee * 3 - (filmingProjectAtLocation(l.id) ? 6 : 0)
  }));
  return scored.sort((a, b) => b.v - a.v)[0].l;
}

// Best talent for an open slot by expected appeal and value
function aiPickTalent(p, pi, f, slot, budget) {
  const pending = new Set(state.offers.filter((o) => o.pi === pi && o.projectId === f.id).map((o) => o.talentId));
  const attached = new Set(attachedTalentIds(f));
  let best = null;
  for (const t of Object.values(state.talent)) {
    if (!slotFits(t, slot) || attached.has(t.id) || pending.has(t.id)) continue;
    const ask = askingFeeFor(t, f, slot);
    const fee = roundMoney(ask * (p.aiStyle === "BLOCKBUSTER" ? 1.3 : 1.1));
    if (fee > budget) continue;
    const appeal = talentAppeal(t, f, pi, slot, fee).score;
    if (appeal < 2) continue;
    const value = t.skill * 2 + t.fame * (p.aiStyle === "INDIE" ? 0.5 : 1.5) + appeal * 0.5 - fee * 0.6;
    if (!best || value > best.value) best = { t, fee, value };
  }
  return best;
}

function aiStep(pi, p) {
  const q = state.quarter;
  const remaining = quartersRemaining();
  const dev = p.projects.filter((f) => f.status === STATUS.DEV);
  const reserve = OVERHEAD * (p.aiStyle === "INDIE" ? 2 : 4);

  // --- free actions ---
  if (p.debt > 0 && p.cash > STARTING_CASH * 2 && aiAct(pi, { type: "REPAY" })) return true;
  for (const tid of p.roster) {
    for (const f of dev) {
      const slot = openSlots(f).find((s) => slotFits(talentById(tid), s));
      if (slot !== undefined && aiAct(pi, { type: "ATTACH", talentId: tid, projectId: f.id, slot })) return true;
    }
  }
  for (const f of dev) {
    if (!f.pitched && f.cast[0] && p.cash < STARTING_CASH / 2 && aiAct(pi, { type: "PITCH", projectId: f.id })) return true;
  }
  if (p.cash < OVERHEAD * 3 && remaining >= 4 && p.debt + LOAN_SIZE <= MAX_DEBT * 0.6 && dev.some((f) => f.director) && aiAct(pi, { type: "LOAN" })) return true;

  if (p.ap <= 0) return false;

  // --- release films that are in the can ---
  for (const f of p.projects.filter((x) => x.status === STATUS.CANNED)) {
    const g = GENRES[f.genre];
    if (remaining === 0 || g.season[seasonOf(q)] >= g.season[seasonOf(q + 1)] || chance(0.3)) {
      if (aiAct(pi, { type: "RELEASE", projectId: f.id })) return true;
    }
  }

  // --- greenlight ready packages ---
  for (const f of dev) {
    if (f.pendingGreenlight || !f.director || !f.location) continue;
    const unfilled = f.cast.filter((id) => !id).length;
    if (unfilled && !(f.cast[0] && (remaining <= 5 || unfilled === 1 && chance(0.4)))) continue;
    const b = aiPickBudget(p, f, remaining);
    if (b && aiAct(pi, { type: "GREENLIGHT", projectId: f.id, budget: b })) return true;
    if (!b && f.cast[0] && shootLength(f, "STUDIO") <= remaining - 1 &&
        aiAct(pi, { type: "GREENLIGHT", projectId: f.id, budget: "STUDIO", cofinance: true })) return true;
  }

  // --- scout locations ---
  for (const f of dev) {
    if (!f.location && aiAct(pi, { type: "SCOUT", projectId: f.id, locationId: aiBestLocation(f).id })) return true;
  }

  // --- make offers for open roles (director first, then cast in billing order) ---
  for (const f of dev) {
    const slots = openSlots(f).filter((s) => !state.offers.some((o) => o.pi === pi && o.projectId === f.id && o.slot === s));
    for (const slot of slots) {
      if (slot !== "DIRECTOR" && !f.director && !state.offers.some((o) => o.pi === pi && o.projectId === f.id && o.slot === "DIRECTOR")) continue;
      // Indie producers keep salaries small; everyone else spends what they can spare
      const feeCap = p.aiStyle === "INDIE" ? Math.min(p.cash - reserve, BUDGETS.INDIE.cost * 0.4) : p.cash - reserve;
      const pickT = aiPickTalent(p, pi, f, slot, feeCap);
      if (pickT && aiAct(pi, { type: "OFFER", talentId: pickT.t.id, projectId: f.id, slot, fee: pickT.fee })) return true;
    }
  }

  // --- buy scripts ---
  const wantProjects = p.aiStyle === "INDIE" ? 3 : 2;
  if (dev.length < wantProjects && remaining >= 4) {
    const bidOn = new Set(state.offers.filter((o) => o.pi === pi && o.kind === "SCRIPT").map((o) => o.scriptId));
    const options = state.market.scripts
      .filter((s) => !bidOn.has(s.id) && s.price + BUDGETS.INDIE.cost * 1.5 <= p.cash)
      .sort((a, b) => b.quality / b.price - a.quality / a.price);
    const s = options[0];
    if (s && aiAct(pi, { type: "BID_SCRIPT", scriptId: s.id, amount: roundMoney(s.price * (1 + Math.random() * 0.3)) })) return true;
  }

  // --- marketing ---
  const promo = p.projects
    .filter((f) => [STATUS.FILMING, STATUS.CANNED, STATUS.SCHEDULED].includes(f.status) && f.hype < 60)
    .sort((a, b) => BUDGETS[b.budget].cost - BUDGETS[a.budget].cost);
  if (promo.length && p.cash > MARKETING.BIG.cost) {
    const size = p.cash > MARKETING.BIG.cost * 3 && promo[0].budget !== "INDIE" ? "BIG" : "SMALL";
    if (aiAct(pi, { type: "MARKETING", projectId: promo[0].id, size })) return true;
  }

  // --- scandal cards ---
  if (scandalsOn() && chance(0.5)) {
    for (const c of p.hand) {
      const card = SCANDAL_CARDS[c.cardId];
      let targetId = null;
      if (card.target === "OWN_FILM") targetId = p.projects.find((f) => [STATUS.FILMING, STATUS.CANNED, STATUS.SCHEDULED].includes(f.status))?.id;
      if (card.target === "RIVAL_FILM") targetId = allProjects().find((e) => e.pi !== pi && [STATUS.FILMING, STATUS.CANNED].includes(e.project.status))?.project.id;
      if (card.target === "RIVAL_STAR") {
        const e = allProjects().find((x) => x.pi !== pi && [STATUS.DEV, STATUS.FILMING, STATUS.CANNED].includes(x.project.status) && x.project.cast[0]);
        targetId = e?.project.cast[0];
      }
      if (card.target === "REACTIVE" || (card.target !== "NONE" && !targetId)) continue;
      if (c.cardId === "POACH" && !state.offers.some((o) => o.pi === pi)) continue;
      if (aiAct(pi, { type: "PLAY_CARD", uid: c.uid, targetId })) return true;
    }
  }

  return false;
}
