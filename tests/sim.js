// Headless simulation: plays many all-AI games through the same engine the server uses,
// checks invariants, and prints economy stats for tuning.
//
//   node tests/sim.js [games=200]

const { loadEngine } = require("../api/_engine");

const GAMES = Number(process.argv[2]) || 200;
const g = loadEngine();
const K = (name) => require("vm").runInContext(name, g); // read engine constants
const failures = [];
const check = (cond, msg) => { if (!cond && failures.length < 25) failures.push(msg); };

const stats = {
  films: 0, flops: 0, byBudget: {}, winners: {}, values: [], parallelMax: 0,
  scandalCards: 0, signed: 0, turnedDown: 0, outbid: 0
};

function checkState(s, label) {
  for (const p of s.players) {
    check(Number.isFinite(p.cash) && Number.isFinite(p.debt), `${label}: non-finite money for ${p.studio}`);
    check(p.ap >= 0, `${label}: negative AP for ${p.studio}`);
    check(p.debt <= 100, `${label}: debt over max for ${p.studio}`);
    for (const f of p.projects) {
      check(Object.values(g.STATUS ?? {}).length === 0 || true, "");
      check(["DEV", "FILMING", "CANNED", "SCHEDULED", "THEATERS", "LIBRARY"].includes(f.status), `${label}: bad status ${f.status}`);
      check(Number.isFinite(f.hype) && f.hype >= 0 && f.hype <= 100, `${label}: hype out of range on ${f.title}`);
      if (f.status !== "DEV") check(!!f.director && !!f.location && !!f.budget, `${label}: "${f.title}" left DEV without director/location/budget`);
    }
  }
  // No person or location filming two projects at once
  const filming = s.players.flatMap((p) => p.projects.filter((f) => f.status === "FILMING"));
  const seenT = new Map(), seenL = new Map();
  for (const f of filming) {
    for (const id of [f.director, ...f.cast].filter(Boolean)) {
      check(!seenT.has(id), `${label}: ${s.talent[id].name} filming "${f.title}" and "${seenT.get(id)}"`);
      seenT.set(id, f.title);
    }
    check(!seenL.has(f.location), `${label}: location ${f.location} double-booked`);
    seenL.set(f.location, f.title);
  }
}

for (let i = 0; i < GAMES; i++) {
  const scandals = i % 2 === 0;
  const length = ["SHORT", "STANDARD", "LONG"][i % 3];
  const n = 2 + (i % 5);
  const players = Array.from({ length: n }, (_, k) => ({ name: `AI ${k + 1}`, ai: true }));

  // Step quarter by quarter so we can check state between resolutions
  g.newGameState({ players, length, scandals, timer: 0 });
  g.beginQuarter();
  const s = () => g.state;
  const expectedQuarters = s().totalQuarters;
  let guard = 0;
  while (s().phase === "PLANNING" && guard++ < 50) {
    checkState(s(), `game ${i} ${g.quarterLabel(s().quarter)} planning`);
    // greenlit shoot length must match the formula
    const pending = s().players.flatMap((p) => p.projects.filter((f) => f.pendingGreenlight).map((f) => ({ f, len: g.shootLength(f, f.pendingGreenlight.budget) })));
    g.resolveQuarter();
    for (const { f, len } of pending) {
      if (f.status === "FILMING") check(f.shootPlanned === len, `game ${i}: shoot length ${f.shootPlanned} != ${len} for "${f.title}"`);
    }
    const r = s().lastReport;
    for (const d of r.deals) {
      if (/signs on/.test(d.text)) stats.signed++;
      else if (/turned down/.test(d.text)) stats.turnedDown++;
      else if (/chose|outbid/.test(d.text)) stats.outbid++;
    }
    for (const p of s().players) {
      const parallel = p.projects.filter((f) => ["DEV", "FILMING", "CANNED", "SCHEDULED", "THEATERS"].includes(f.status) && f.status !== "DEV").length;
      stats.parallelMax = Math.max(stats.parallelMax, parallel);
      if (!scandals) check(p.hand.length === 0, `game ${i}: scandal cards dealt with scandals off`);
      else stats.scandalCards += p.hand.length;
    }
    if (!scandals) check(!s().scandal, `game ${i}: scandal revealed with scandals off`);
  }
  check(s().phase === "GAME_OVER", `game ${i}: did not finish`);
  check(s().quarter === expectedQuarters - 1, `game ${i}: ended on quarter ${s().quarter}, expected ${expectedQuarters - 1}`);
  checkState(s(), `game ${i} final`);

  for (const p of s().players) {
    for (const f of p.projects.filter((x) => x.status === "LIBRARY")) {
      stats.films++;
      if (f.studioTake < f.cost) stats.flops++;
      const b = (stats.byBudget[f.budget] ||= { n: 0, cost: 0, take: 0, critic: 0 });
      b.n++; b.cost += f.cost; b.take += f.studioTake; b.critic += f.critic;
    }
  }
  const final = s().final;
  stats.winners[s().players[final[0].pi].aiStyle] = (stats.winners[s().players[final[0].pi].aiStyle] || 0) + 1;
  final.forEach((f) => stats.values.push(f.value));
}

// --- Scenario: two studios want the same star -----------------------------------------
{
  g.newGameState({ players: [{ name: "A", sessionId: "a" }, { name: "B", sessionId: "b" }], length: "SHORT", scandals: false });
  g.beginQuarter();
  const st = g.state;
  const mk = (pi) => { const f = g.projectFromScript(g.makeScript()); st.players[pi].projects.push(f); return f; };
  const fa = mk(0), fb = mk(1);
  const star = Object.values(st.talent).find((t) => t.role === "STAR" && !t.rivals.length);
  const ask = (f) => g.askingFeeFor(star, f, 0);
  st.players.forEach((p) => { p.cash = 200; });
  const cashBefore = st.players.map((p) => p.cash);
  const ra = g.applyAction(0, { type: "OFFER", talentId: star.id, projectId: fa.id, slot: 0, fee: ask(fa) + 30 });
  const rb = g.applyAction(1, { type: "OFFER", talentId: star.id, projectId: fb.id, slot: 0, fee: ask(fb) });
  check(ra.ok && rb.ok, `contest: offers rejected: ${ra.msg} / ${rb.msg}`);
  check(g.redactStateFor(1).offers.every((o) => o.pi === 1), "contest: rival offers leaked through redaction");
  g.applyAction(0, { type: "READY" });
  check(st.quarter === 0, "contest: resolved before everyone was ready");
  g.applyAction(1, { type: "READY" });
  check(st.quarter === 1, "contest: did not resolve when everyone was ready");
  const winner = fa.cast[0] === star.id ? 0 : fb.cast[0] === star.id ? 1 : -1;
  check(winner >= 0, "contest: nobody signed the star");
  check(!(fa.cast[0] === star.id && fb.cast[0] === star.id), "contest: star signed with both studios in one quarter");
  const loser = 1 - winner;
  const lostNote = st.lastReport.deals.find((d) => d.pi === loser && !d.ok);
  check(lostNote && /chose|turned down/.test(lostNote.text), "contest: loser got no explanation");
  check(Math.abs(st.players[loser].cash - (cashBefore[loser] - K("OVERHEAD"))) < 0.01, `contest: loser not refunded (cash ${st.players[loser].cash})`);
  console.log(`Contest scenario: ${st.players[winner].name} signed ${star.name}; loser told: "${lostNote?.text}"`);
}

// --- Scenario: start from talent and a location, add the script later ------------------
{
  g.newGameState({ players: [{ name: "A", sessionId: "a" }, { name: "B", ai: true }], length: "SHORT", scandals: false });
  g.beginQuarter();
  const st = g.state;
  const p = st.players[0];
  p.cash = 300;
  st.players[1].ready = true;
  const r1 = g.applyAction(0, { type: "NEW_PACKAGE" });
  const pkg = p.projects.find((f) => !g.hasScript(f));
  check(r1.ok && pkg, `package: could not start one (${r1.msg})`);
  const devBefore = p.projects.filter((f) => f.status === "DEV").length; // starting hand may include scripts
  const star = Object.values(st.talent).filter((t) => t.role === "STAR" && !t.rivals.length).sort((a, b) => a.fame - b.fame)[0];
  const offer = g.applyAction(0, { type: "OFFER", talentId: star.id, projectId: pkg.id, slot: 0, fee: g.askingFeeFor(star, pkg, 0) + 40 });
  check(offer.ok, `package: offer failed (${offer.msg})`);
  check(g.applyAction(0, { type: "SCOUT", projectId: pkg.id, locationId: "L_PEDMALL" }).ok, "package: scout failed");
  const gl = g.applyAction(0, { type: "GREENLIGHT", projectId: pkg.id, budget: "INDIE" });
  check(!gl.ok, "package: greenlit without a script");
  p.ap += 1; // allow the script bid this quarter
  if (!st.market.scripts.length) st.market.scripts.push(g.makeScript()); // opening news may be a writers' strike
  const script = st.market.scripts[0];
  const bid = g.applyAction(0, { type: "BID_SCRIPT", scriptId: script.id, amount: script.price + 60, projectId: pkg.id });
  check(bid.ok, `package: script bid failed (${bid.msg})`);
  g.applyAction(0, { type: "READY" });
  check(st.quarter === 1, "package: quarter did not resolve");
  check(g.hasScript(pkg) && pkg.title === script.title, "package: script was not attached to the package");
  check(pkg.location === "L_PEDMALL", "package: location lost when the script arrived");
  check(pkg.cast.includes(star.id), `package: star not in the cast after script arrived (${st.lastReport.deals.map((d) => d.text).join(" / ")})`);
  check(p.projects.filter((f) => f.status === "DEV").length === devBefore, "package: script bid created a second project");

  const shelve = g.applyAction(0, { type: "SHELVE", projectId: pkg.id });
  check(shelve.ok && !p.projects.includes(pkg), "package: shelve failed");
  check(p.roster.includes(star.id), "package: shelved star not kept under contract");
  console.log(`Package scenario: talent + location first, then "${script.title}" — ${shelve.msg}`);
}

// --- Scenario: endless mode keeps going until the host calls it a wrap ----------------
{
  g.newGameState({ players: [1, 2, 3, 4].map((k) => ({ name: `AI ${k}`, ai: true })), length: "ENDLESS", scandals: true });
  g.beginQuarter();
  const st = () => g.state;
  for (let q = 0; q < 60; q++) {
    check(st().phase === "PLANNING", `endless: game ended on its own at quarter ${st().quarter}`);
    checkState(st(), `endless ${g.quarterLabel(st().quarter)}`);
    g.resolveQuarter();
  }
  const bytes = JSON.stringify(st()).length;
  check(bytes < 1024 * 1024, `endless: state grew to ${(bytes / 1024).toFixed(0)} KB after 60 quarters`);
  const films = st().players.reduce((n, p) => n + p.projects.filter((f) => f.status === "LIBRARY").length, 0);
  check(films > 20, `endless: only ${films} films finished in 60 quarters`);
  const notHost = g.performAction(1, { type: "END_GAME" });
  check(!notHost.ok, "endless: a non-host ended the game");
  const end = g.performAction(st().hostIndex, { type: "END_GAME" });
  check(end.ok && st().phase === "GAME_OVER" && st().final?.length === 4, `endless: host could not call it a wrap (${end.msg})`);
  console.log(`Endless scenario: 60 quarters, ${films} films released, state ${(bytes / 1024).toFixed(0)} KB, then "${end.msg}"`);
}

// --- Scenario: real-history games -------------------------------------------------------------
{
  const run = (startYear, quarters, length = "ENDLESS") => {
    g.newGameState({ players: [1, 2, 3].map((k) => ({ name: `AI ${k}`, ai: true })), length, scandals: false, startYear });
    g.beginQuarter();
    const seen = [];
    for (let i = 0; i < quarters && g.state.phase === "PLANNING"; i++) {
      checkState(g.state, `history ${startYear} ${g.quarterLabel(g.state.quarter)}`);
      seen.push({ key: g.calendarOf().key, mods: g.eventMods(), level: g.priceLevel(), filming: g.allProjects().filter(({ project: f }) => f.status === "FILMING").map(({ project: f }) => ({ id: f.id, left: f.quartersLeft })) });
      g.resolveQuarter();
      const after = g.allProjects().filter(({ project: f }) => f.status === "FILMING");
      seen[seen.length - 1].after = after.map(({ project: f }) => ({ id: f.id, left: f.quartersLeft }));
    }
    return seen;
  };

  // Inflation: money is shown in that quarter's dollars, exactly per the CPI table
  const s1950 = run(1950, 8);
  const cpi = (k) => require("vm").runInContext(`CPI_QUARTERLY["${k}"]`, g);
  const lastKey = require("vm").runInContext("CPI_LAST", g);
  check(s1950[0].key === "1950-Q1", `history: first quarter is ${s1950[0].key}, expected 1950-Q1`);
  check(Math.abs(s1950[0].level - cpi("1950-Q1") / cpi(lastKey)) < 1e-12, "history: 1950 price level doesn't match CPI");
  g.newGameState({ players: [{ name: "A", ai: true }, { name: "B", ai: true }], length: "SHORT", startYear: 1980 });
  const shown = g.fmtMoney(100); // $100M today in 1980-Q1 dollars
  const expected = 100 * cpi("1980-Q1") / cpi(lastKey);
  check(shown === `$${expected.toFixed(1)}M`, `history: $100M today showed as ${shown} in 1980, expected about $${expected.toFixed(1)}M`);
  check(g.fmtMoney(100, { today: true }) === "$100M", "history: today's-dollars formatting broken");

  // COVID: box office collapses in 2020-Q2 and shoots in progress don't advance
  const covid = run(2019, 12);
  const q2020 = covid.find((x) => x.key === "2020-Q2");
  check(q2020 && q2020.mods.boxOfficeMult < 0.05 && q2020.mods.filmingPause, "history: COVID shutdown not in effect in 2020-Q2");
  check(q2020 && q2020.filming.every((b) => { const a = q2020.after.find((x) => x.id === b.id); return !a || a.left === b.left; }), "history: filming advanced during the 2020 shutdown");
  const y2019 = covid.find((x) => x.key === "2019-Q3");
  check(y2019 && !y2019.mods.filmingPause && (y2019.mods.boxOfficeMult ?? 1) === 1, "history: 2019 should be a normal year");

  // 2023 strikes: writers' strike blocks rewrites/new scripts; actors' strike halts shoots
  const strikes = run(2023, 4);
  const q3 = strikes.find((x) => x.key === "2023-Q3");
  check(q3 && q3.mods.strike && q3.mods.actorsStrike, "history: 2023-Q3 should have both the WGA and SAG-AFTRA strikes");

  // Past the last CPI quarter, inflation is projected and the game keeps going on random news
  const future = run(2025, 8);
  check(future.every((x, i) => i === 0 || x.level >= future[i - 1].level * 0.99), "history: projected price level should keep rising");
  check(g.state.phase === "PLANNING", "history: endless game past the data should keep going");
  console.log(`History scenarios: 1950 dollars ×${s1950[0].level.toFixed(4)} of today; $100M today = ${shown} in 1980; COVID box office ×${q2020?.mods.boxOfficeMult}`);
}

const avg = (a) => a.reduce((n, v) => n + v, 0) / (a.length || 1);
console.log(`Simulated ${GAMES} games`);
console.log(`Films completed: ${stats.films}, flops (take < cost): ${((stats.flops / stats.films) * 100).toFixed(1)}%`);
for (const [k, b] of Object.entries(stats.byBudget)) {
  console.log(`  ${k.padEnd(12)} n=${String(b.n).padStart(5)}  avg cost $${(b.cost / b.n).toFixed(1)}M  avg take $${(b.take / b.n).toFixed(1)}M  ROI ${(b.take / b.cost).toFixed(2)}x  critic ${(b.critic / b.n).toFixed(0)}`);
}
const vals = [...stats.values].sort((a, b) => a - b);
console.log(`Studio value: min $${vals[0]}M  median $${vals[Math.floor(vals.length / 2)]}M  avg $${avg(vals).toFixed(1)}M  max $${vals[vals.length - 1]}M`);
console.log(`Winners by AI style: ${JSON.stringify(stats.winners)}`);
console.log(`Most films in production/release at once for one studio: ${stats.parallelMax}`);
console.log(`Talent offers: ${stats.signed} signed, ${stats.turnedDown} turned down, ${stats.outbid} lost to a rival`);

if (failures.length) {
  console.error(`\n${failures.length} invariant failure(s):`);
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log("\nAll invariants held.");
