// Industry news: one is revealed at the start of every quarter.
// The event object stored in state is { id, name, text, genre? }; mods/onStart are looked up here.

const EVENT_DEFS = {
  NORMAL: {
    weight: 4,
    make: () => ({ name: "Business as usual", text: "Nothing unusual in the trades this quarter." })
  },
  CRAZE: {
    weight: 3,
    make: () => {
      const genre = pick(GENRE_KEYS);
      return { genre, name: `${GENRES[genre].name} craze!`, text: `Audiences can't get enough. ${GENRES[genre].name} films earn x1.35 at the box office this quarter.` };
    },
    mods: (e) => ({ genreMult: { [e.genre]: 1.35 } })
  },
  FATIGUE: {
    weight: 2,
    make: () => {
      const genre = pick(GENRE_KEYS);
      return { genre, name: `${GENRES[genre].name} fatigue`, text: `Audiences are tired of ${GENRES[genre].name.toLowerCase()} films. They earn x0.7 this quarter.` };
    },
    mods: (e) => ({ genreMult: { [e.genre]: 0.7 } })
  },
  STRIKE: {
    weight: 1,
    make: () => ({ name: "Writers' strike", text: "No new scripts reach the market and rewrites are impossible this quarter." }),
    mods: () => ({ strike: true })
  },
  TAX_CREDIT: {
    weight: 2,
    make: () => ({ name: "Iowa film tax credit", text: "Greenlight budgets cost 30% less this quarter." }),
    mods: () => ({ budgetDiscount: 0.3 })
  },
  FESTIVAL: {
    weight: 2,
    make: () => ({ name: "Iowa City Film Festival", text: "Films opening this quarter get +8 to their critics' score." }),
    mods: () => ({ criticBonus: 8 })
  },
  RECESSION: {
    weight: 1,
    make: () => ({ name: "Recession", text: "Ticket sales slump. Box office is down 20% this quarter." }),
    mods: () => ({ boxOfficeMult: 0.8 })
  },
  BOOM: {
    weight: 2,
    make: () => ({ name: "Moviegoing boom", text: "Theaters are packed. Box office is up 20% this quarter." }),
    mods: () => ({ boxOfficeMult: 1.2 })
  },
  RATE_HIKE: {
    weight: 1,
    make: () => ({ name: "Interest rate hike", text: "Loan interest is doubled this quarter." }),
    mods: () => ({ interestMult: 2 })
  },
  STREAMING: {
    weight: 2,
    make: () => ({ name: "Streaming bidding war", text: "Streamers license back catalogs: every studio earns $2M per film in its library." }),
    onStart: () => {
      state.players.forEach((p, pi) => {
        const n = p.projects.filter((f) => f.status === STATUS.LIBRARY).length;
        if (n > 0) { p.cash = round1(p.cash + 2 * n); logLine(`${p.studio} licenses ${n} library film${n > 1 ? "s" : ""} for ${fmtMoney(2 * n)}.`, pi); }
      });
    }
  },
  VIRAL: {
    weight: 2,
    make: () => ({ name: "Viral trailer season", text: "Marketing is 50% more effective this quarter." }),
    mods: () => ({ marketingMult: 1.5 })
  },
  NEW_FACES: {
    weight: 2,
    make: () => ({ name: "Drama school graduation", text: "A wave of new talent arrives at the agency." }),
    onStart: () => {
      for (let i = 0; i < 2; i++) addTalent(makeTalent("STAR", { rookie: true }));
      addTalent(makeTalent("DIRECTOR", { rookie: true }));
    }
  }
};

function drawEvent() {
  const ids = Object.keys(EVENT_DEFS);
  const id = weightedPick(ids, (k) => EVENT_DEFS[k].weight);
  return { id, ...EVENT_DEFS[id].make() };
}

function eventMods(e = state.event) {
  const def = e && EVENT_DEFS[e.id];
  return (def && def.mods ? def.mods(e) : null) || {};
}

function startEvent(e) {
  const def = EVENT_DEFS[e.id];
  logLine(`NEWS: ${e.name}. ${e.text}`, null, "news");
  if (def.onStart) def.onStart(e);
}
