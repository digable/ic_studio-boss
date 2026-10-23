// New game: talent pool, writers, script market, studios and starter hands.

const STARTER_CARDS = [
  { type: "SCRIPT", weight: 35 },
  { type: "STAR", weight: 25 },
  { type: "DIRECTOR", weight: 20 },
  { type: "INVESTOR", weight: 20 }
];
const INVESTOR_CASH = 15;
const AI_STYLES = ["BLOCKBUSTER", "INDIE", "BALANCED"];

function makeWriter() {
  const w = { id: newId("W"), name: makePersonName(), rep: randInt(1, 3), specialty: chance(0.5) ? "BIG" : "INDIE" };
  state.writers[w.id] = w;
  return w;
}

function makeTalent(role, { rookie = false } = {}) {
  const skill = rookie ? randInt(3, 8) : randInt(2, 9);
  const fame = rookie ? randInt(1, 3) : clamp(skill + randInt(-3, 3), 1, 10);
  return {
    id: newId("T"),
    role,
    name: makePersonName(),
    skill,
    fame,
    likes: shuffle([...GENRE_KEYS]).slice(0, randInt(1, 2)),
    locs: shuffle(LOCATIONS.map((l) => l.id)).slice(0, randInt(1, 2)),
    friends: [],
    rivals: [],
    speed: role === "DIRECTOR" ? pick([-1, 0, 0, 0, 1]) : 0,   // -1 fast, +1 slow
    unavailable: 0,
    films: 0
  };
}

function addTalent(t) { state.talent[t.id] = t; return t; }

function makeScript() {
  const genre = pick(GENRE_KEYS);
  const writers = Object.values(state.writers);
  const writer = writers.length && chance(0.6) ? pick(writers) : makeWriter();
  const quality = Math.round(25 + ((Math.random() + Math.random()) / 2) * 65);
  const roles = weightedPick(CAST_LAYOUTS, (l) => [25, 35, 25, 15][l.length - 1]);
  const shoot = clamp(randInt(1, 2) + (roles.length >= 3 ? 1 : 0), 1, 3);
  return {
    id: newId("S"),
    title: makeTitle(genre),
    genre,
    quality,
    writerId: writer.id,
    roles: [...roles],
    shoot,
    price: Math.max(2, Math.round(1 + quality / 10 + writer.rep + randInt(0, 2))),
    logline: freshLogline(genre),
    age: 0
  };
}

// Prefer a logline nobody on the market or in development is already using
function freshLogline(genre) {
  const used = new Set([
    ...state.market.scripts.map((s) => s.logline),
    ...allProjects().filter(({ project: f }) => f.status === STATUS.DEV).map(({ project: f }) => f.logline)
  ]);
  const unused = LOGLINES[genre].filter((l) => !used.has(l));
  return pick(unused.length ? unused : LOGLINES[genre]);
}

function projectFromScript(s) {
  return {
    id: newId("F"),
    title: s.title,
    genre: s.genre,
    quality: s.quality,
    writerId: s.writerId,
    roles: [...s.roles],
    shoot: s.shoot,
    logline: s.logline,
    director: null,
    cast: s.roles.map(() => null),
    location: null,
    budget: null,
    status: STATUS.DEV,
    quartersLeft: 0,
    shootTotal: 0,
    hype: 0,
    critic: null,
    luck: 1,
    run: 0,
    grosses: [],
    totalGross: 0,
    studioTake: 0,
    cost: 0,
    investorShare: 0,
    pitched: false,
    pendingGreenlight: null,
    releasedQuarter: null,
    qualityMod: 0,
    criticMod: 0,
    rewrites: 0
  };
}

function scriptMarketSize() { return Math.max(MARKET_SIZE.scripts, state.players.length + 1); }

function refreshScripts() {
  const m = state.market;
  m.scripts.forEach((s) => { s.age++; });
  m.scripts = m.scripts.filter((s) => s.age < 3);
  if (eventMods().strike) return;
  while (m.scripts.length < scriptMarketSize()) m.scripts.push(makeScript());
}

function seedRelationships() {
  const all = Object.values(state.talent);
  for (let i = 0; i < 10; i++) {
    const [a, b] = shuffle([...all]);
    if (a && b && a !== b) makeFriends(a, b);
  }
  for (let i = 0; i < 6; i++) {
    const [a, b] = shuffle([...all]);
    if (a && b && a !== b) makeRivals(a, b);
  }
}

function makePlayer(cfg, index, usedStudios) {
  const pool = (cfg.ai ? AI_STUDIO_NAMES : STUDIO_NAMES).filter((n) => !usedStudios.has(n));
  const studio = (cfg.studio && cfg.studio.trim()) || pick(pool.length ? pool : STUDIO_NAMES);
  usedStudios.add(studio);
  return {
    index,
    name: cfg.name,
    studio,
    tag: studioTag(studio),
    color: PLAYER_COLORS[index],
    sessionId: cfg.sessionId || null,
    ai: !!cfg.ai,
    left: false,
    aiStyle: cfg.ai ? pick(AI_STYLES) : null,
    cash: STARTING_CASH,
    debt: 0,
    prestige: 0,
    lifetimeGross: 0,
    projects: [],
    roster: [],
    hand: [],
    starters: [],
    ap: BASE_AP,
    ready: false,
    poachBonus: 0
  };
}

function dealStarters(pi) {
  const p = state.players[pi];
  for (let i = 0; i < STARTING_HAND; i++) {
    const card = weightedPick(STARTER_CARDS, (c) => c.weight).type;
    if (card === "SCRIPT") {
      const s = makeScript();
      p.projects.push(projectFromScript(s));
      p.starters.push(`Script: "${s.title}" (${GENRES[s.genre].name})`);
    } else if (card === "INVESTOR") {
      p.cash += INVESTOR_CASH;
      p.starters.push(`Investor: +${fmtMoney(INVESTOR_CASH)}`);
    } else {
      const pool = Object.values(state.talent).filter((t) =>
        t.role === card && t.fame >= 3 && t.fame <= 7 && !state.players.some((o) => o.roster.includes(t.id)));
      const t = pick(pool);
      if (!t) { p.cash += INVESTOR_CASH; p.starters.push(`Investor: +${fmtMoney(INVESTOR_CASH)}`); continue; }
      p.roster.push(t.id);
      p.starters.push(`${card === "STAR" ? "Star" : "Director"} under contract: ${t.name}`);
    }
  }
}

// config: { players: [{ name, studio?, sessionId?, ai? }], length, scandals, timer }
function newGameState(config) {
  state = {
    version: 1,
    phase: "PLANNING",
    quarter: 0,
    totalQuarters: (GAME_LENGTHS[config.length] || GAME_LENGTHS.STANDARD).quarters,
    settings: {
      length: GAME_LENGTHS[config.length] ? config.length : "STANDARD",
      scandals: !!config.scandals,
      timer: TIMER_OPTIONS.includes(Number(config.timer)) ? Number(config.timer) : 0
    },
    planningDeadline: null,
    players: [],
    talent: {},
    writers: {},
    market: { scripts: [] },
    offers: [],
    initiative: [],
    event: null,
    scandal: null,
    lastReport: null,
    awards: [],
    log: [],
    nextId: 1,
    usedTitles: [],
    scandalDeck: [],
    final: null
  };

  for (let i = 0; i < 6; i++) makeWriter();
  for (let i = 0; i < 10; i++) addTalent(makeTalent("DIRECTOR"));
  for (let i = 0; i < 18; i++) addTalent(makeTalent("STAR"));
  seedRelationships();

  const used = new Set();
  config.players.slice(0, MAX_PLAYERS).forEach((cfg, i) => state.players.push(makePlayer(cfg, i, used)));
  state.players.forEach((p, pi) => {
    dealStarters(pi);
    if (scandalsOn()) drawPlayableCard(pi);
    logLine(`${p.studio} opens its doors with ${p.starters.join(", ")}.`, pi);
  });

  return state;
}
