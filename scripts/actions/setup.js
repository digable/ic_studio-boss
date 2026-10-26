// New game: talent pool, writers, script market, studios and starter hands.

const STARTER_CARDS = [
  { type: "SCRIPT", weight: 35 },
  { type: "STAR", weight: 25 },
  { type: "DIRECTOR", weight: 20 },
  { type: "INVESTOR", weight: 20 }
];
const INVESTOR_CASH = 40;
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
  // Writers follow the trends: hot genres show up on the market more often
  const trend = state.event || state.settings ? eventMods().genreMult : {};
  const genre = weightedPick(GENRE_KEYS, (g) => Math.pow(trend[g] ?? 1, 2));
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
    // Spec script sales: a few hundred thousand for most, a few million for the hottest
    price: Math.max(0.1, Math.round((0.1 + Math.pow(quality / 100, 3) * 2.5 + writer.rep * 0.15 + Math.random() * 0.3) * 20) / 20),
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

// A package is a project that may not have a script yet: you can start from a
// location or from talent and find the script later.
const PACKAGE_ROLES = ["LEAD", "COLEAD"];

function blankProject(title) {
  return {
    id: newId("F"),
    hasScript: false,
    title,
    genre: null,
    quality: 0,
    writerId: null,
    roles: [...PACKAGE_ROLES],
    shoot: 0,
    logline: "No script yet. Sign talent or scout a location now, and win a script for this package later.",
    director: null,
    cast: PACKAGE_ROLES.map(() => null),
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

// Puts a script into a project. Stars already attached fill the script's roles
// by fame; anyone left over is returned (the caller puts them under contract).
function attachScript(f, s) {
  f.hasScript = true;
  f.title = s.title;
  f.genre = s.genre;
  f.quality = s.quality;
  f.writerId = s.writerId;
  f.shoot = s.shoot;
  f.logline = s.logline;
  const stars = f.cast.filter(Boolean).sort((a, b) => talentById(b).fame - talentById(a).fame);
  f.roles = [...s.roles];
  f.cast = f.roles.map((_, i) => stars[i] || null);
  return stars.slice(f.roles.length);
}

function projectFromScript(s) {
  const f = blankProject(s.title);
  attachScript(f, s);
  return f;
}

function hasScript(f) { return f.hasScript !== false; }

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
    hostIndex: Math.max(0, config.players.findIndex((p) => !p.ai)),   // who may end an endless game
    settings: {
      length: GAME_LENGTHS[config.length] ? config.length : "STANDARD",
      scandals: !!config.scandals,
      timer: TIMER_OPTIONS.includes(Number(config.timer)) ? Number(config.timer) : 0,
      // Real-history mode: the calendar year the game starts in (null = fictional present day)
      startYear: Number(config.startYear) >= HISTORY_START_YEAR && Number(config.startYear) <= Number(CPI_LAST.slice(0, 4))
        ? Number(config.startYear) : null
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
