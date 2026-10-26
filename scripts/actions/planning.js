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
// Cash failures carry code "CASH" and the amount needed, so the UI can offer financing
function needCash(p, amount) {
  if (p.cash >= amount) return;
  const e = new ActionError(`You need ${fmtMoney(amount)} (you have ${fmtMoney(p.cash)}).`);
  e.code = "CASH";
  e.need = roundMoney(amount);
  throw e;
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
  return roundMoney(BUDGETS[budgetKey].cost * (eventMods().budgetMult ?? 1));
}
function greenlightCost(f, budgetKey) {
  return roundMoney(budgetCost(budgetKey) + (locationById(f.location)?.fee || 0));
}
function cofinanceAmount(budgetKey) { return roundMoney(budgetCost(budgetKey) * COFINANCE_BUDGET); }

// Pre-sales: investors pay up front for names they can sell. Big stars are worth far more.
function pitchValue(f, p) {
  let v = p.prestige * 2 + Math.max(0, (f.quality - 50) / 5);
  const d = talentById(f.director);
  if (d) v += askingFee(d) * 0.8;
  f.roles.forEach((r, i) => { const t = talentById(f.cast[i]); if (t) v += ROLES[r].weight * askingFee(t) * 1.5; });
  return roundMoney(v * (eventMods().pitchMult || 1));
}

const ACTION_HANDLERS = {
  BID_SCRIPT(pi, p, a) {
    const s = state.market.scripts.find((x) => x.id === a.scriptId);
    if (!s) fail("That script is no longer on the market.");
    const amount = roundMoney(Number(a.amount));
    if (!(amount + 0.0005 >= s.price)) fail(`The asking price is ${fmtMoney(s.price)}.`);
    if (state.offers.some((o) => o.pi === pi && o.kind === "SCRIPT" && o.scriptId === s.id)) fail("You already bid on that script.");
    let pkg = null;
    if (a.projectId) {
      pkg = ownDevProject(p, a.projectId);
      if (hasScript(pkg)) fail(`"${pkg.title}" already has a script.`);
      if (state.offers.some((o) => o.pi === pi && o.kind === "SCRIPT" && o.projectId === pkg.id)) fail(`You're already bidding on a script for "${pkg.title}".`);
    }
    needCash(p, amount);
    p.cash = roundMoney(p.cash - amount);
    state.offers.push({ id: newId("O"), pi, kind: "SCRIPT", scriptId: s.id, title: s.title, amount, projectId: pkg?.id || null, ap: AP_COST.BID_SCRIPT });
    return `Bid ${fmtMoney(amount)} on "${s.title}"${pkg ? ` for "${pkg.title}"` : ""}. Bids are settled at the end of the quarter.`;
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
    const fee = roundMoney(Number(a.fee));
    if (!(fee >= 0.05)) fail(`Offer at least ${fmtMoney(0.05)}.`);
    needCash(p, fee);
    p.cash = roundMoney(p.cash - fee);
    state.offers.push({ id: newId("O"), pi, kind: "TALENT", talentId: t.id, projectId: f.id, slot, fee, ap: AP_COST.OFFER, title: f.title, name: t.name });
    return `Offered ${t.name} ${fmtMoney(fee)} to play ${slotLabel(f, slot)} in "${f.title}".`;
  },

  WITHDRAW(pi, p, a) {
    const i = state.offers.findIndex((o) => o.id === a.offerId && o.pi === pi);
    if (i < 0) fail("No such offer.");
    const o = state.offers[i];
    state.offers.splice(i, 1);
    p.cash = roundMoney(p.cash + (o.kind === "SCRIPT" ? o.amount : o.fee));
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
      p.cash = roundMoney(p.cash + f.pendingGreenlight.escrow);
      p.ap += AP_COST.GREENLIGHT;
      f.pendingGreenlight = null;
      return `Greenlight for "${f.title}" cancelled.`;
    }
    if (f.pendingGreenlight) fail(`"${f.title}" is already greenlit for this quarter.`);
    if (!hasScript(f)) fail("You need a script before you can greenlight.");
    if (!BUDGETS[a.budget]) fail("Pick a budget.");
    if (!f.director) fail("Attach a director first.");
    if (!f.location) fail("Scout a location first.");
    const conflicts = greenlightConflicts(f, true);
    if (conflicts.length) fail(`Can't start filming: ${conflicts[0]}.`);
    if (a.cofinance && f.investorShare + COFINANCE_SHARE > MAX_INVESTOR_SHARE) fail("Investors already own too much of this film to bring in a partner.");
    const partner = a.cofinance ? cofinanceAmount(a.budget) : 0;
    const cost = roundMoney(greenlightCost(f, a.budget) - partner);
    needCash(p, cost);
    p.cash = roundMoney(p.cash - cost);
    f.pendingGreenlight = { budget: a.budget, escrow: cost, cofinance: !!a.cofinance };
    return `Greenlit "${f.title}" (${BUDGETS[a.budget].name}, ${fmtMoney(cost)}${partner ? ` after a partner's ${fmtMoney(partner)}` : ""}). Cameras roll next quarter.`;
  },

  RELEASE(pi, p, a) {
    const f = ownProject(p, a.projectId);
    if (f.status !== STATUS.CANNED) fail(`"${f.title}" isn't ready for release.`);
    f.status = STATUS.SCHEDULED;
    return `"${f.title}" opens in theaters at the end of ${quarterLabel(state.quarter)}.`;
  },

  REWRITE(pi, p, a) {
    const f = ownDevProject(p, a.projectId);
    if (!hasScript(f)) fail("There's no script to rewrite yet.");
    if (eventMods().strike) fail("The writers are on strike.");
    needCash(p, REWRITE_COST);
    const delta = randInt(-4, 12) - f.rewrites * 2;
    p.cash = roundMoney(p.cash - REWRITE_COST);
    f.cost = roundMoney(f.cost + REWRITE_COST);
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
    p.cash = roundMoney(p.cash - m.cost);
    f.cost = roundMoney(f.cost + m.cost);
    f.hype = Math.min(100, f.hype + gain);
    return `${m.name} for "${f.title}": +${gain} hype.`;
  },

  LOAN(pi, p) {
    if (p.debt + LOAN_SIZE > MAX_DEBT) fail(`The bank won't lend past ${fmtMoney(MAX_DEBT)}.`);
    p.cash = roundMoney(p.cash + LOAN_SIZE);
    p.debt = roundMoney(p.debt + LOAN_SIZE);
    return `Borrowed ${fmtMoney(LOAN_SIZE)} at ${LOAN_INTEREST * 100}% a quarter.`;
  },

  REPAY(pi, p) {
    if (p.debt <= 0) fail("You don't owe anything.");
    const amt = Math.min(REPAY_SIZE, p.debt);
    needCash(p, amt);
    p.cash = roundMoney(p.cash - amt);
    p.debt = roundMoney(p.debt - amt);
    return `Repaid ${fmtMoney(amt)}.`;
  },

  PITCH(pi, p, a) {
    const f = ownDevProject(p, a.projectId);
    if (f.pitched) fail(`You already pitched "${f.title}" to investors.`);
    if (!attachedTalentIds(f).length) fail("Investors want names attached. Sign a director or star first.");
    const v = pitchValue(f, p);
    if (v < 1) fail("Investors pass. Attach bigger names.");
    p.cash = roundMoney(p.cash + v);
    f.pitched = true;
    f.investorShare = Math.min(MAX_INVESTOR_SHARE, f.investorShare + INVESTOR_SHARE);
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

  NEW_PACKAGE(pi, p) {
    const empty = p.projects.filter((f) => f.status === STATUS.DEV && !hasScript(f)).length;
    if (empty >= MAX_EMPTY_PACKAGES) fail(`You already have ${empty} packages without a script. Find them a script first.`);
    p.packageCount = (p.packageCount || 0) + 1;
    const f = blankProject(`Untitled package ${p.packageCount}`);
    p.projects.push(f);
    return `Started "${f.title}". Attach talent or a location in any order, and bid on a script for it.`;
  },

  SHELVE(pi, p, a) {
    const f = ownDevProject(p, a.projectId);
    if (f.pendingGreenlight) fail("Cancel the greenlight first.");
    // Pending offers for this project are refunded with their AP
    state.offers = state.offers.filter((o) => {
      if (o.pi !== pi || o.projectId !== f.id) return true;
      p.cash = roundMoney(p.cash + (o.kind === "SCRIPT" ? o.amount : o.fee));
      p.ap += o.ap;
      return false;
    });
    const people = attachedTalentIds(f);
    people.forEach((id) => { if (!p.roster.includes(id)) p.roster.push(id); });
    p.projects = p.projects.filter((x) => x.id !== f.id);
    return `Shelved "${f.title}".${people.length ? ` ${people.map((id) => talentById(id).name).join(", ")} ${people.length > 1 ? "stay" : "stays"} under contract.` : ""}`;
  },

  END_GAME(pi, p) {
    if (!isEndless()) fail("This game ends on its own after the last quarter.");
    if (pi !== state.hostIndex) fail("Only the host can call it a wrap.");
    state.offers.forEach((o) => { const op = state.players[o.pi]; op.cash = roundMoney(op.cash + (o.kind === "SCRIPT" ? o.amount : o.fee)); });
    state.offers = [];
    state.players.forEach((op) => op.projects.forEach((f) => {
      if (f.pendingGreenlight) { op.cash = roundMoney(op.cash + f.pendingGreenlight.escrow); f.pendingGreenlight = null; }
    }));
    endGame(`${p.name} calls it a wrap after ${state.quarter + 1} quarters.`);
    return "That's a wrap! Final standings are in.";
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
    if (p.ready && action.type !== "READY" && action.type !== "END_GAME") fail("You're marked ready. Un-ready to keep planning.");
    const cost = action.cancel ? 0 : AP_COST[action.type] || 0;
    if (cost > p.ap) fail("No action points left this quarter.");
    const msg = handler(pi, p, action);
    p.ap -= cost;
    state.version++;
    return { ok: true, msg };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, msg: e.message, code: e.code || null, need: e.need ?? null };
    throw e;
  }
}
