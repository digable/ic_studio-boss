// Talent appeal: why a director or star would (or wouldn't) sign onto a project.
// Money matters, but so do genre, location, who else is attached, the writer and the studio.

// slot is "DIRECTOR" or a cast index into project.roles
function slotRoleKey(f, slot) { return slot === "DIRECTOR" ? "DIRECTOR" : f.roles[slot]; }
function slotLabel(f, slot) { return slot === "DIRECTOR" ? "Director" : ROLES[f.roles[slot]].name; }
function slotFilled(f, slot) { return slot === "DIRECTOR" ? !!f.director : !!f.cast[slot]; }
function slotFits(t, slot) { return slot === "DIRECTOR" ? t.role === "DIRECTOR" : t.role === "STAR"; }
function openSlots(f) {
  const slots = [];
  if (!f.director) slots.push("DIRECTOR");
  f.cast.forEach((id, i) => { if (!id) slots.push(i); });
  return slots;
}

function askingFee(t, roleKey = "LEAD") {
  if (t.role === "DIRECTOR") return Math.max(1, Math.round(1 + t.skill * 0.6 + t.fame * 0.5));
  const base = 1 + t.skill * 0.4 + t.fame * 1.0;
  return Math.max(1, Math.round(base * (ROLES[roleKey] || ROLES.LEAD).feeMult));
}
function askingFeeFor(t, f, slot) { return askingFee(t, slot === "DIRECTOR" ? "LEAD" : f.roles[slot]); }

// Returns { score, reasons: [{ label, value }] } sorted by impact.
// opts.mood adds a random factor (only at resolution); opts.poach adds a Poach card bonus.
function talentAppeal(t, f, pi, slot, fee, opts = {}) {
  const p = state.players[pi];
  const reasons = [];
  const add = (label, v) => { const r = Math.round(v); if (r) reasons.push({ label, value: r }); };

  const asking = askingFeeFor(t, f, slot);
  const money = clamp(((fee - asking) / Math.max(asking, 1)) * 20, -30, 15);
  add(fee >= asking ? (fee > asking ? "Generous offer" : "Fair offer") : "Lowball offer", money);

  if (t.likes.includes(f.genre)) add(`Loves ${GENRES[f.genre].name.toLowerCase()}`, 8);

  const loc = locationById(f.location);
  if (loc) {
    if (t.locs.includes(loc.id)) add(`Wants to shoot at ${loc.name}`, 8);
    else add(`Location: ${loc.name}`, loc.draw * 1.5);
  }

  for (const id of attachedTalentIds(f)) {
    if (id === t.id) continue;
    const o = talentById(id);
    if (t.friends.includes(id)) add(`Friends with ${o.name}`, 7);
    if (t.rivals.includes(id)) add(`Won't work with ${o.name}`, -20);
  }

  if (t.role === "STAR" && f.director) {
    const d = talentById(f.director);
    add(`Director ${d.name}`, (d.skill - 5) * 1.5);
  }
  if (t.role === "DIRECTOR") {
    const lead = talentById(f.cast[0]);
    if (lead) add(`Star ${lead.name}`, (lead.fame - 5) * 1.2);
  }

  const w = writerById(f.writerId);
  if (w) add(`Writer ${w.name}`, (w.rep - 2) * 2);
  add("Script quality", (f.quality - 55) / 5);
  add("Studio prestige", p.prestige * 1.5);

  const busy = p.projects.filter((x) => x.status === STATUS.DEV || x.status === STATUS.FILMING).length;
  if (busy > 3) add("Studio is spread thin", -2 * (busy - 3));

  const roleKey = slotRoleKey(f, slot);
  if (roleKey === "SUPPORT" && t.fame >= A_LIST_FAME) add("Too big for a supporting part", -12);
  if (roleKey === "COLEAD" && t.fame >= 9) add("Wants top billing", -5);

  if (opts.poach) add("Agents working the phones", opts.poach);
  if (opts.mood) add("Mood", opts.mood);

  reasons.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return { score: reasons.reduce((n, r) => n + r.value, 0), reasons };
}

function appealVerdict(score) {
  if (score >= 15) return "Eager";
  if (score >= 6) return "Interested";
  if (score >= ACCEPT_THRESHOLD) return "Open to it";
  if (score >= -6) return "Long shot";
  return "Not interested";
}

// Talent who'd sign for this project at their asking fee, best first.
// Returns [{ talent, slot, score, reasons }]
function interestedTalent(f, pi, limit = 6) {
  const slots = openSlots(f);
  if (!slots.length) return [];
  const attached = new Set(attachedTalentIds(f));
  const out = [];
  for (const t of Object.values(state.talent)) {
    if (attached.has(t.id)) continue;
    const slot = slots.find((s) => slotFits(t, s));
    if (slot === undefined) continue;
    const a = talentAppeal(t, f, pi, slot, askingFeeFor(t, f, slot));
    if (a.score >= INTERESTED_THRESHOLD) out.push({ talent: t, slot, score: a.score, reasons: a.reasons });
  }
  out.sort((a, b) => b.score - a.score || b.talent.fame - a.talent.fame);
  return out.slice(0, limit);
}

// --- filming availability -----------------------------------------------------

function filmingProjectOfTalent(tid) {
  const hit = allProjects().find(({ project: f }) => f.status === STATUS.FILMING && attachedTalentIds(f).includes(tid));
  return hit ? hit.project : null;
}
function filmingProjectAtLocation(locId) {
  const hit = allProjects().find(({ project: f }) => f.status === STATUS.FILMING && f.location === locId);
  return hit ? hit.project : null;
}
// A filming project frees its people at this quarter's resolution when it's on its last quarter
function wrapsThisQuarter(f) { return f.status === STATUS.FILMING && f.quartersLeft <= 1; }

// Reasons a project couldn't start filming right now. `afterWraps` ignores shoots that wrap this quarter.
function greenlightConflicts(f, afterWraps) {
  const out = [];
  for (const id of attachedTalentIds(f)) {
    const t = talentById(id);
    if (t.unavailable > 0) out.push(`${t.name} is unavailable this quarter`);
    const busy = filmingProjectOfTalent(id);
    if (busy && busy.id !== f.id && !(afterWraps && wrapsThisQuarter(busy))) out.push(`${t.name} is filming "${busy.title}"`);
  }
  const busyLoc = f.location && filmingProjectAtLocation(f.location);
  if (busyLoc && busyLoc.id !== f.id && !(afterWraps && wrapsThisQuarter(busyLoc))) {
    out.push(`${locationById(f.location).name} is booked by "${busyLoc.title}"`);
  }
  return out;
}
