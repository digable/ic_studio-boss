// Headless simulation: plays many all-AI games through the same engine the server uses,
// checks invariants, and prints economy stats for tuning.
//
//   node tests/sim.js [games=200]

const { loadEngine } = require("../api/_engine");

const GAMES = Number(process.argv[2]) || 200;
const g = loadEngine();
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
  check(Math.abs(st.players[loser].cash - (cashBefore[loser] - 2)) < 0.01, `contest: loser not refunded (cash ${st.players[loser].cash})`);
  console.log(`Contest scenario: ${st.players[winner].name} signed ${star.name}; loser told: "${lostNote?.text}"`);
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
