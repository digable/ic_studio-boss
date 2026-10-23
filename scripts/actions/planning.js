// Planning-phase actions. Every studio acts at the same time; contested things
// (script bids, talent offers, greenlights) are sealed orders settled at resolution.
//
// performAction(pi, action) validates and applies one action and returns { ok, msg }.
// Handlers must validate everything before mutating state.

class ActionError extends Error {}
function fail(msg) { throw new ActionError(msg); }

function ownDevProject(p, projectId) {
  const f = p.projects.find((x) => x.id === projectId);
  if (!f) fail("That isn't one of your projects.");
  if (f.status !== STATUS.DEV) fail(`"${f.title}" is no longer in development.`);
  return f;
}
function ownProject(p, projectId) {
  const f = p.projects.find((x) => x.id === projectId);
  if (!f) fail("That isn't one of your projects.");
  return f;
}
function needCash(p, amount) {
  if (p.cash < amount) fail(`You need ${fmtMoney(amount)} (you have ${fmtMoney(p.cash)}).`);
}
function parseSlot(f, slot) {
  if (slot === "DIRECTOR") return slot;
  const i = Number(slot);
  if (!Number.isInteger(i) || i < 0 || i >= f.roles.length) fail("Pick a role on this film.");
  return i;
}
function attach(f, t, slot) {
  if (slot === "DIRECTOR") f.director = t.id; else f.cast[slot] = t.id;
  f.hype = Math.min(100, f.hype + attachHype(t, f, slot));
}
function budgetCost(budgetKey) {
  return round1(BUDGETS[budgetKey].cost * (1 - (eventMods().budgetDiscount || 0)));
}
function greenlightCost(f, budgetKey) {
  return round1(budgetCost(budgetKey) + (locationById(f.location)?.fee || 0));
}
function pitchValue(f, p) {
  let v = p.prestige + Math.max(0, (f.quality - 50) / 10);
  const d = talentById(f.director);
  if (d) v += d.fame * 0.6;
  f.roles.forEach((r, i) => { const t = talentById(f.cast[i]); if (t) v += ROLES[r].weight * t.fame * 1.5; });
  return round1(v);
}

const ACTION_HANDLERS = {
  BID_SCRIPT(pi, p, a) {
    const s = state.market.scripts.find((x) => x.id === a.scriptId);
    if (!s) fail("That script is no longer on the market.");
    const amount = Math.round(Number(a.amount));
    if (!(amount >= s.price)) fail(`The asking price is ${fmtMoney(s.price)}.`);
    if (state.offers.some((o) => o.pi === pi && o.kind === "SCRIPT" && o.scriptId === s.id)) fail("You already bid on that script.");
    needCash(p, amount);
    p.cash = round1(p.cash - amount);
    state.offers.push({ id: newId("O"), pi, kind: "SCRIPT", scriptId: s.id, title: s.title, amount, ap: AP_COST.BID_SCRIPT });
    return `Bid ${fmtMoney(amount)} on "${s.title}". Bids are settled at the end of the quarter.`;
  },

  OFFER(pi, p, a) {
    const f = ownDevProject(p, a.projectId);
    const slot = parseSlot(f, a.slot);
    const t = talentById(a.talentId);
    if (!t) fail("Unknown talent.");
    if (!slotFits(t, slot)) fail(`${t.name} can't fill the ${slotLabel(f, slot)} role.`);
    if (slotFilled(f, slot)) fail(`The ${slotLabel(f, slot)} role is already filled.`);
    if (attachedTalentIds(f).includes(t.id)) fail(`${t.name} is already on "${f.title}".`);
    const mine = state.offers.filter((o) => o.pi === pi && o.kind === "TALENT" && o.projectId === f.id);
    if (mine.some((o) => o.slot === slot)) fail(`You already have an offer out for that role.`);
    if (mine.some((o) => o.talentId === t.id)) fail(`You already made ${t.name} an offer for this film.`);
    const fee = Math.round(Number(a.fee));
    if (!(fee >= 1)) fail("Offer at least $1M.");
    needCash(p, fee);
    p.cash = round1(p.cash - fee);
    state.offers.push({ id: newId("O"), pi, kind: "TALENT", talentId: t.id, projectId: f.id, slot, fee, ap: AP_COST.OFFER, title: f.title, name: t.name });
    return `Offered ${t.name} ${fmtMoney(fee)} to play ${slotLabel(f, slot)} in "${f.title}".`;
  },

  WITHDRAW(pi, p, a) {
    const i = state.offers.findIndex((o) => o.id === a.offerId && o.pi === pi);
    if (i < 0) fail("No such offer.");
    const o = state.offers[i];
    state.offers.splice(i, 1);
    p.cash = round1(p.cash + (o.kind === "SCRIPT" ? o.amount : o.fee));
    p.ap += o.ap;
    return "Offer withdrawn and refunded.";
  },

  ATTACH(pi, p, a) {
    const f = ownDevProject(p, a.projectId);
    const slot = parseSlot(f, a.slot);
    const t = talentById(a.talentId);
    if (!t || !p.roster.includes(t.id)) fail("That person isn't under contract with you.");
    if (!slotFits(t, slot)) fail(`${t.name} can't fill the ${slotLabel(f, slot)} role.`);
    if (slotFilled(f, slot)) fail(`The ${slotLabel(f, slot)} role is already filled.`);
    if (attachedTalentIds(f).includes(t.id)) fail(`${t.name} is already on "${f.title}".`);
    p.roster = p.roster.filter((id) => id !== t.id);
    attach(f, t, slot);
    return `${t.name} joins "${f.title}" as ${slotLabel(f, slot)}.`;
  },

  SCOUT(pi, p, a) {
    const f = ownDevProject(p, a.projectId);
    const loc = locationById(a.locationId);
    if (!loc) fail("Unknown location.");
    if (f.location === loc.id) fail(`"${f.title}" is already set at ${loc.name}.`);
    if (f.pendingGreenlight) fail("Cancel the greenlight before changing locations.");
    f.location = loc.id;
    return `"${f.title}" will shoot at ${loc.name}.`;
  },

  GREENLIGHT(pi, p, a) {
    const f = ownDevProject(p, a.projectId);
    if (a.cancel) {
      if (!f.pendingGreenlight) fail("Nothing to cancel.");
      p.cash = round1(p.cash + f.pendingGreenlight.escrow);
      p.ap += AP_COST.GREENLIGHT;
      f.pendingGreenlight = null;
      return `Greenlight for "${f.title}" cancelled.`;
    }
    if (f.pendingGreenlight) fail(`"${f.title}" is already greenlit for this quarter.`);
    if (!BUDGETS[a.budget]) fail("Pick a budget.");
    if (!f.director) fail("Attach a director first.");
    if (!f.location) fail("Scout a location first.");
    const conflicts = greenlightConflicts(f, true);
    if (conflicts.length) fail(`Can't start filming: ${conflicts[0]}.`);
    const cost = greenlightCost(f, a.budget);
    needCash(p, cost);
    p.cash = round1(p.cash - cost);
    f.pendingGreenlight = { budget: a.budget, escrow: cost };
    return `Greenlit "${f.title}" (${BUDGETS[a.budget].name}, ${fmtMoney(cost)}). Cameras roll next quarter.`;
  },

  RELEASE(pi, p, a) {
    const f = ownProject(p, a.projectId);
    if (f.status !== STATUS.CANNED) fail(`"${f.title}" isn't ready for release.`);
    f.status = STATUS.SCHEDULED;
    return `"${f.title}" opens in theaters at the end of ${quarterLabel(state.quarter)}.`;
  },

  REWRITE(pi, p, a) {
    const f = ownDevProject(p, a.projectId);
    if (eventMods().strike) fail("The writers are on strike.");
    needCash(p, REWRITE_COST);
    const delta = randInt(-4, 12) - f.rewrites * 2;
    p.cash = round1(p.cash - REWRITE_COST);
    f.cost = round1(f.cost + REWRITE_COST);
    f.quality = clamp(f.quality + delta, 1, 100);
    f.rewrites++;
    return delta >= 0
      ? `The rewrite improves "${f.title}" (+${delta} script quality).`
      : `Too many cooks: the rewrite hurts "${f.title}" (${delta} script quality).`;
  },

  MARKETING(pi, p, a) {
    const f = ownProject(p, a.projectId);
    if (![STATUS.FILMING, STATUS.CANNED, STATUS.SCHEDULED].includes(f.status)) fail("You can only market films that are filming or awaiting release.");
    const m = MARKETING[a.size];
    if (!m) fail("Pick a campaign.");
    if (f.hype >= 100) fail(`"${f.title}" can't get any more hype.`);
    needCash(p, m.cost);
    const gain = Math.round(m.hype * (eventMods().marketingMult || 1));
    p.cash = round1(p.cash - m.cost);
    f.cost = round1(f.cost + m.cost);
    f.hype = Math.min(100, f.hype + gain);
    return `${m.name} for "${f.title}": +${gain} hype.`;
  },

  LOAN(pi, p) {
    if (p.debt + LOAN_SIZE > MAX_DEBT) fail(`The bank won't lend past ${fmtMoney(MAX_DEBT)}.`);
    p.cash = round1(p.cash + LOAN_SIZE);
    p.debt = round1(p.debt + LOAN_SIZE);
    return `Borrowed ${fmtMoney(LOAN_SIZE)} at ${LOAN_INTEREST * 100}% a quarter.`;
  },

  REPAY(pi, p) {
    if (p.debt <= 0) fail("You don't owe anything.");
    const amt = Math.min(REPAY_SIZE, p.debt);
    needCash(p, amt);
    p.cash = round1(p.cash - amt);
    p.debt = round1(p.debt - amt);
    return `Repaid ${fmtMoney(amt)}.`;
  },

  PITCH(pi, p, a) {
    const f = ownDevProject(p, a.projectId);
    if (f.pitched) fail(`You already pitched "${f.title}" to investors.`);
    if (!attachedTalentIds(f).length) fail("Investors want names attached. Sign a director or star first.");
    const v = pitchValue(f, p);
    if (v < 1) fail("Investors pass. Attach bigger names.");
    p.cash = round1(p.cash + v);
    f.pitched = true;
    f.investorShare = INVESTOR_SHARE;
    return `Investors put ${fmtMoney(v)} into "${f.title}" for ${INVESTOR_SHARE * 100}% of its box office.`;
  },

  PLAY_CARD(pi, p, a) {
    if (!scandalsOn()) fail("Scandals are turned off.");
    const i = p.hand.findIndex((c) => c.uid === a.uid);
    if (i < 0) fail("That card isn't in your hand.");
    const card = SCANDAL_CARDS[p.hand[i].cardId];
    if (card.target === "REACTIVE") fail(`${card.name} plays itself when a scandal hits you.`);
    const text = card.apply({ pi, targetId: a.targetId, shield: makeShield() });
    if (!text) fail(`${card.name} needs a valid target.`);
    p.hand.splice(p.hand.findIndex((c) => c.uid === a.uid), 1);
    logLine(`${p.studio} plays ${card.name}: ${text}`, pi, "scandal");
    return text;
  },

  READY(pi, p, a) {
    p.ready = a.ready !== false;
    return p.ready ? "Ready. Waiting for the other studios." : "Back to planning.";
  }
};

function performAction(pi, action) {
  try {
    if (state.phase !== "PLANNING") fail("The game is over.");
    const p = state.players[pi];
    if (!p) fail("Unknown studio.");
    const handler = ACTION_HANDLERS[action?.type];
    if (!handler) fail("Unknown action.");
    if (p.ready && action.type !== "READY") fail("You're marked ready. Un-ready to keep planning.");
    const cost = action.cancel ? 0 : AP_COST[action.type] || 0;
    if (cost > p.ap) fail("No action points left this quarter.");
    const msg = handler(pi, p, action);
    p.ap -= cost;
    state.version++;
    return { ok: true, msg };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, msg: e.message };
    throw e;
  }
}
