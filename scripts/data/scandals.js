// Scandal cards — only used when settings.scandals is on.
// Card shape: { id, name, text, kind, target, apply(ctx) }
//   kind:   RANDOM   revealed with the news, hits a random target
//           PLAYABLE dealt to studios' hands, played for 1 AP (or reactive, see DAMAGE_CONTROL)
//   target: NONE | OWN_FILM | RIVAL_STAR | RIVAL_FILM
//   apply({ pi, targetId, shield }) returns a log string, or null when there was no valid target.
// `shield(pi)` consumes the victim studio's Damage Control card if it holds one.

const SCANDAL_REVEAL_CHANCE = 0.45;

function activeProjectsWithTalent(tid) {
  return allProjects().filter(({ project: f }) =>
    isActive(f) && f.status !== STATUS.THEATERS && attachedTalentIds(f).includes(tid));
}
function attachedStars() {
  const ids = new Set();
  allProjects().forEach(({ project: f }) => {
    if (f.status === STATUS.DEV || f.status === STATUS.FILMING || f.status === STATUS.CANNED) f.cast.forEach((id) => id && ids.add(id));
  });
  return [...ids];
}
function hitFilmsOfStar(tid, shield, fn) {
  const hit = [];
  for (const { project: f, pi } of activeProjectsWithTalent(tid)) {
    if (shield(pi)) continue;
    fn(f);
    hit.push(`"${f.title}"`);
  }
  return hit;
}
function makeFriends(a, b) {
  if (!a.friends.includes(b.id)) a.friends.push(b.id);
  if (!b.friends.includes(a.id)) b.friends.push(a.id);
  a.rivals = a.rivals.filter((id) => id !== b.id);
  b.rivals = b.rivals.filter((id) => id !== a.id);
}
function makeRivals(a, b) {
  if (!a.rivals.includes(b.id)) a.rivals.push(b.id);
  if (!b.rivals.includes(a.id)) b.rivals.push(a.id);
  a.friends = a.friends.filter((id) => id !== b.id);
  b.friends = b.friends.filter((id) => id !== a.id);
}

const SCANDAL_CARDS = {
  // --- random -----------------------------------------------------------------
  TABLOID_MELTDOWN: {
    name: "Tabloid Meltdown", kind: "RANDOM", target: "NONE",
    text: "A star melts down in public. Fame -2 and -15 hype on their upcoming films.",
    apply: ({ shield }) => {
      const pool = attachedStars();
      if (!pool.length) return null;
      const t = talentById(pick(pool));
      t.fame = Math.max(1, t.fame - 2);
      const hit = hitFilmsOfStar(t.id, shield, (f) => { f.hype = Math.max(0, f.hype - 15); });
      return `${t.name} melts down on camera.${hit.length ? ` Hype drops for ${hit.join(", ")}.` : ""}`;
    }
  },
  ONSET_FEUD: {
    name: "On-Set Feud", kind: "RANDOM", target: "NONE",
    text: "Two co-stars on the same film start a feud. Bad chemistry hurts the film.",
    apply: ({ shield }) => {
      const pool = allProjects().filter(({ project: f }) =>
        (f.status === STATUS.DEV || f.status === STATUS.FILMING) && f.cast.filter(Boolean).length >= 2);
      if (!pool.length) return null;
      const { project: f, pi } = pick(pool);
      if (shield(pi)) return `A feud on "${f.title}" is hushed up by the publicists.`;
      const [a, b] = shuffle(f.cast.filter(Boolean)).map(talentById);
      makeRivals(a, b);
      return `${a.name} and ${b.name} are feuding on the set of "${f.title}".`;
    }
  },
  DUI_ARREST: {
    name: "Arrested!", kind: "RANDOM", target: "NONE",
    text: "A star is arrested and can't start a film this quarter. Their current shoot is delayed a quarter.",
    apply: ({ shield }) => {
      const pool = attachedStars();
      if (!pool.length) return null;
      const t = talentById(pick(pool));
      t.unavailable = 1;
      const delayed = [];
      for (const { project: f, pi } of activeProjectsWithTalent(t.id)) {
        if (f.status === STATUS.FILMING && !shield(pi)) { f.quartersLeft += 1; f.shootTotal += 1; delayed.push(`"${f.title}"`); }
      }
      return `${t.name} is arrested and sits out this quarter.${delayed.length ? ` ${delayed.join(", ")} is delayed.` : ""}`;
    }
  },
  LEAKED_SCRIPT: {
    name: "Leaked Script", kind: "RANDOM", target: "NONE",
    text: "A script leaks online. -10 hype and the ending has to be reworked (-3 quality).",
    apply: ({ shield }) => {
      const pool = allProjects().filter(({ project: f }) => hasScript(f) && [STATUS.DEV, STATUS.FILMING, STATUS.CANNED].includes(f.status));
      if (!pool.length) return null;
      const { project: f, pi } = pick(pool);
      if (shield(pi)) return `A leak of "${f.title}" is taken down before anyone notices.`;
      f.hype = Math.max(0, f.hype - 10);
      f.qualityMod -= 3;
      return `The script for "${f.title}" leaks online.`;
    }
  },
  DIRECTOR_WALKS: {
    name: "Director Walks Off", kind: "RANDOM", target: "NONE",
    text: "A director storms off set. The shoot runs a quarter longer (-2 quality).",
    apply: ({ shield }) => {
      const pool = allProjects().filter(({ project: f }) => f.status === STATUS.FILMING);
      if (!pool.length) return null;
      const { project: f, pi } = pick(pool);
      if (shield(pi)) return `A walk-off on "${f.title}" is smoothed over by the producers.`;
      f.quartersLeft += 1; f.shootTotal += 1; f.qualityMod -= 2;
      return `${talentById(f.director)?.name ?? "The director"} walks off "${f.title}". The shoot runs long.`;
    }
  },
  ANY_PRESS: {
    name: "Any Press Is Good Press", kind: "RANDOM", target: "NONE",
    text: "A star's scandal backfires into buzz: +10 hype on their films, but critics sneer (-5).",
    apply: () => {
      const pool = attachedStars();
      if (!pool.length) return null;
      const t = talentById(pick(pool));
      const hit = [];
      for (const { project: f } of activeProjectsWithTalent(t.id)) { f.hype = Math.min(100, f.hype + 10); f.criticMod -= 5; hit.push(`"${f.title}"`); }
      return `${t.name}'s scandal has everyone talking about ${hit.join(", ")}.`;
    }
  },
  SECRET_ROMANCE: {
    name: "Secret Romance", kind: "RANDOM", target: "NONE",
    text: "Two stars are caught together. They'll love working together, and shared films get +8 hype.",
    apply: () => {
      const pool = shuffle(Object.values(state.talent).filter((t) => t.role === "STAR"));
      if (pool.length < 2) return null;
      const [a, b] = pool;
      makeFriends(a, b);
      allProjects().forEach(({ project: f }) => {
        if (isActive(f) && f.cast.includes(a.id) && f.cast.includes(b.id)) f.hype = Math.min(100, f.hype + 8);
      });
      return `${a.name} and ${b.name} are spotted on a date at Coralville Lake.`;
    }
  },

  // --- playable ---------------------------------------------------------------
  LEAK_TABLOIDS: {
    name: "Leak to the Tabloids", kind: "PLAYABLE", target: "RIVAL_STAR",
    text: "Dish dirt on a star attached to a rival's film: fame -2 and -12 hype on that rival's films with them.",
    apply: ({ pi, targetId, shield }) => {
      const t = talentById(targetId);
      if (!t || t.role !== "STAR") return null;
      const rivalFilms = activeProjectsWithTalent(t.id).filter((x) => x.pi !== pi);
      if (!rivalFilms.length) return null;
      t.fame = Math.max(1, t.fame - 2);
      const hit = [];
      for (const { project: f, pi: owner } of rivalFilms) {
        if (shield(owner)) continue;
        f.hype = Math.max(0, f.hype - 12);
        hit.push(`"${f.title}"`);
      }
      return `Tabloids dig into ${t.name}.${hit.length ? ` Hype drops for ${hit.join(", ")}.` : ""}`;
    }
  },
  POACH: {
    name: "Poach", kind: "PLAYABLE", target: "NONE",
    text: "Your agents work the phones: +10 appeal on all your talent offers this quarter.",
    apply: ({ pi }) => {
      state.players[pi].poachBonus = 10;
      return `${state.players[pi].studio} has agents working the phones.`;
    }
  },
  PUBLICITY_STUNT: {
    name: "Publicity Stunt", kind: "PLAYABLE", target: "OWN_FILM",
    text: "+15 hype on one of your unreleased films. Critics roll their eyes (-3).",
    apply: ({ pi, targetId }) => {
      const found = findProject(targetId);
      if (!found || found.pi !== pi || ![STATUS.DEV, STATUS.FILMING, STATUS.CANNED, STATUS.SCHEDULED].includes(found.project.status)) return null;
      const f = found.project;
      f.hype = Math.min(100, f.hype + 15);
      f.criticMod -= 3;
      return `A publicity stunt puts "${f.title}" in every headline.`;
    }
  },
  BAD_SCREENING: {
    name: "Bad Test Screening", kind: "PLAYABLE", target: "RIVAL_FILM",
    text: "Spread word of a disastrous test screening of a rival's unreleased film: -6 critics, -5 hype.",
    apply: ({ pi, targetId, shield }) => {
      const found = findProject(targetId);
      if (!found || found.pi === pi || ![STATUS.FILMING, STATUS.CANNED, STATUS.SCHEDULED].includes(found.project.status)) return null;
      const f = found.project;
      if (shield(found.pi)) return `Rumors about "${f.title}" are shut down fast.`;
      f.criticMod -= 6;
      f.hype = Math.max(0, f.hype - 5);
      return `Word spreads that "${f.title}" tested terribly.`;
    }
  },
  DAMAGE_CONTROL: {
    name: "Damage Control", kind: "PLAYABLE", target: "REACTIVE",
    text: "Keep in hand: automatically cancels the next scandal that would hurt your films.",
    apply: () => null
  }
};

const PLAYABLE_DECK = [
  "LEAK_TABLOIDS", "LEAK_TABLOIDS", "LEAK_TABLOIDS", "POACH", "POACH", "POACH",
  "PUBLICITY_STUNT", "PUBLICITY_STUNT", "PUBLICITY_STUNT", "BAD_SCREENING", "BAD_SCREENING",
  "DAMAGE_CONTROL", "DAMAGE_CONTROL", "DAMAGE_CONTROL"
];

function scandalsOn() { return !!state.settings.scandals; }

// shield(pi) => true (and consumes the card) when that studio holds Damage Control; once per scandal per studio
function makeShield() {
  const used = new Map();
  return (pi) => {
    if (used.has(pi)) return used.get(pi);
    const p = state.players[pi];
    const i = p.hand.findIndex((c) => c.cardId === "DAMAGE_CONTROL");
    if (i >= 0) { p.hand.splice(i, 1); logLine(`${p.studio} plays Damage Control!`, pi, "scandal"); }
    used.set(pi, i >= 0);
    return i >= 0;
  };
}

function drawPlayableCard(pi) {
  if (!scandalsOn()) return;
  const p = state.players[pi];
  if (p.hand.length >= HAND_LIMIT) return;
  if (!state.scandalDeck.length) state.scandalDeck = shuffle([...PLAYABLE_DECK]);
  p.hand.push({ uid: newId("C"), cardId: state.scandalDeck.pop() });
}

function revealRandomScandal() {
  if (!scandalsOn() || !chance(SCANDAL_REVEAL_CHANCE)) return null;
  const ids = shuffle(Object.keys(SCANDAL_CARDS).filter((k) => SCANDAL_CARDS[k].kind === "RANDOM"));
  for (const id of ids) {
    const text = SCANDAL_CARDS[id].apply({ pi: null, shield: makeShield() });
    if (text) {
      logLine(`SCANDAL — ${SCANDAL_CARDS[id].name}: ${text}`, null, "scandal");
      return { id, name: SCANDAL_CARDS[id].name, text };
    }
  }
  return null;
}
