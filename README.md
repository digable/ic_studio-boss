# IC Studio Boss

A browser-based multiplayer movie studio game. Every player runs a studio: bid on scripts, woo directors and stars, scout Iowa City locations, greenlight films, and fight for the box office and the Golden Cob Awards. Everyone plans at the same time — no waiting for other players to finish their turn.

![Build](https://img.shields.io/badge/Build-None%20Required-brightgreen)

Open `index.html` locally for solo or same-device play — no build step required. For online multiplayer, run `npm start` to launch the self-hosted server (see [Running](#running)).

---

## Features

- **Simultaneous planning** — every studio plans its quarter at once and hits Ready; the quarter resolves when everyone is ready (or the optional planning timer runs out)
- **Initiative draw** — each quarter studios draw an initiative order that breaks ties in bidding and greenlights
- **Starting hands** — each studio is dealt 3 starter cards (script, star or director under contract, or investor cash), so every studio opens differently
- **Sealed bids & offers** — scripts go to the highest bidder; talent signs with the *most appealing* offer, not just the biggest one
- **Talent appeal** — fee, genre they love, location, friends and feuds among the attached cast, the writer, the director, studio prestige, and a bit of mood; the casting dialog shows each person's verdict and reasons live as you change the fee
- **Booked only while filming** — people and locations can be attached to many projects but can only film one at a time, so long shoots tie up your stars
- **Scripts with real requirements** — 1–4 main roles (Lead, Co-Lead, Supporting), base shoot length, and a writer who specializes in big-budget or indie films
- **Budgets & production time** — Indie / Studio / Blockbuster change cost, quality, audience reach and shoot length; fast or slow directors and production events change it further
- **Many films at once** — no project limit; your cash, action points and free talent are the limits
- **Box office** — seasonal genre demand, same-genre competition, critics' scores and word of mouth over a 3-quarter run
- **Industry news** — genre crazes, writers' strikes, Iowa film tax credits, recessions, streaming deals…
- **Scandal cards (toggle)** — random scandals hit stars and productions; playable cards (Leak to the Tabloids, Bad Test Screening, Poach, Publicity Stunt, Damage Control)
- **Golden Cob Awards** — Best Picture, Golden Popcorn and Best Indie every Q4, awarding prestige
- **Endless mode** — no last quarter; the host ends it whenever they like
- **Real history mode** — start in any year from 1930; every quarter is a real calendar quarter with real world and industry events (wars, recessions, strikes, *Jaws*, *Star Wars*, VHS, DVD, streaming, COVID-19…) changing what audiences want and what films can be made
- **Inflation-accurate money** — in real history, all money is shown in that year's dollars using the official BLS Consumer Price Index (CPI-U); loan rates follow the era's approximate prime rate
- **Realistic scale** — budgets, star fees and worldwide box office in real-world ranges (Indie ~$8M, Blockbuster ~$160M in today's dollars; stars from a few hundred thousand to $20M+)
- **AI rival studios** — blockbuster, indie and balanced personalities; they also take over for players who leave
- **Online multiplayer** — 4-character room codes, invite links, server-authoritative state, 1.5 s polling, hidden offers
- **Money always in view** — a bank bar (cash, money held in offers, debt, upkeep, value) stays on screen; running short opens a Financing panel with loans, investor pitches and co-financing, then retries what you were doing
- **Hot-seat** — pass-the-device screen between players on one device
- **Mobile UI** — bottom tab bar (Plan / Studio / Market / Info)

---

## Each Quarter

| Step | What happens |
|------|--------------|
| 1 | **News & initiative** — an industry event (and maybe a scandal) is revealed; initiative order drawn |
| 2 | **Plan** — everyone spends action points at the same time, then readies up |
| 3 | **Resolve** — script bids → talent offers → production → greenlights → box office → upkeep → awards (Q4) |

### Action points

3 AP per quarter, +1 per A-list star (fame 7+) on your books, up to +2.

| Costs 1 AP | Free (anytime while planning) |
|------------|-------------------------------|
| Bid on a script | Marketing |
| Make a talent offer | Loans / repayments |
| Scout a location | Pitch investors (cash now for 15% of the box office) |
| Greenlight (optionally co-financed: a partner pays 50% of the budget for 25% of the box office) | Attach contracted talent |
| Release a film | Withdraw an offer (AP refunded) |
| Rewrite | |
| Play a scandal card | |

---

## Winning

Highest **studio value** at the end of the last quarter:

`cash − debt + 10 × prestige + 10% of lifetime box office`

Game length: Short (8 quarters), Standard (12), Long (16), or **Endless** — keep making movies until the host clicks **Call it a wrap**.

Era: **Fictional, present day**, or **Real history** starting in any year from 1930 to 2026.

Studios that are still broke after maxing out their loans ($100M) go through bankruptcy restructuring: debt halved, cash reset to $5M, −3 prestige.

---

## Data sources

Inflation uses the official **BLS CPI-U** (series CUUR0000SA0). Historical events use real dates. Many other numbers — effect sizes, fees, budgets, the box-office formula — are **game-design estimates**, and all people, studios and films are fictional.

**[DATA_SOURCES.md](DATA_SOURCES.md)** lists exactly what is official data, what is approximated from real figures, and what is made up.

---

## Running

```
npm start            # http://localhost:3000
npm test             # headless simulation + invariant checks
```

`server.js` uses only Node's built-in modules. SQLite comes from the `sqlite3` module if it's installed (Debian: `sudo apt install node-sqlite3`), otherwise from Node's built-in `node:sqlite` (Node 22.13+). The database is created automatically at `data/game.db`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `DB_FILE` | `data/game.db` | SQLite database path |
| `ALLOWED_ORIGIN` | `*` | CORS `Access-Control-Allow-Origin` for `/api` |

---

## Project Structure

```
ic_studio-boss/
├── index.html                  # Game UI (title/lobby, controls, studio board, market/info sidebar)
├── server.js                   # Self-hosting server: static files + /api routes
├── package.json                # npm start / npm test
├── api/
│   ├── _db.js                  # SQLite connection, sessions + rate-limit tables, serialized query queue
│   ├── _engine.js              # Loads the shared game rules into a vm context (server authority)
│   ├── _helpers.js             # CORS, error helpers, room code generator
│   ├── _rateLimit.js           # Per-IP rate limiting
│   ├── games.js                # POST /api/games — create session
│   └── games/[code]/
│       ├── index.js            # GET poll (state redacted per player; advances on timer)
│       ├── join.js             # POST join / rejoin (takes your studio back from the AI)
│       ├── start.js            # POST start (host only) — server builds the game
│       ├── action.js           # POST action — validated and applied by the server
│       └── leave.js            # POST leave — AI caretaker takes over the studio
├── scripts/
│   ├── constants.js            # All tuning numbers: genres, budgets, roles, AP costs, awards…
│   ├── core.js                 # `state`, RNG and lookup helpers
│   ├── data/                   # names, locations, industry events, scandal cards
│   │   └── real/               # cpi.js (generated, BLS CPI-U) and history.js (real events)
│   ├── rules/                  # appeal (talent decisions), quality, box office
│   ├── actions/                # setup, planning actions, resolution, AI, engine API
│   ├── client/                 # browser session, local save, online multiplayer
│   ├── render/                 # panels, dialogs, render orchestrator
│   └── bootstrap.js            # event wiring and boot
├── styles/                     # base tokens, layout, components
├── tests/sim.js                # plays hundreds of AI games and checks invariants
├── tools/
│   ├── build-cpi.js            # builds scripts/data/real/cpi.js from the BLS table (and verifies it)
│   └── data/cpi-u-nsa.tsv      # BLS CPI-U monthly data, as supplied
└── DATA_SOURCES.md             # what's real data, what's approximated, what's invented
```

---

## Technical Notes

- **Pure vanilla JS** — no frameworks, no bundler; scripts load in order via `<script defer>` and share globals, like IC Zombies
- **One rules engine, two hosts** — everything in `scripts/constants.js` … `scripts/actions/engine.js` is DOM-free. The browser runs it for local games; the server loads the same files into a `vm` context (`api/_engine.js`) and is the single authority online. Keep `LOGIC_SCRIPTS` in `api/_engine.js` in sync with the logic `<script>` tags in `index.html`.
- **Hidden information** — `redactStateFor()` strips other players' sealed offers, scandal hands, deal results and session ids before state leaves the server
- **Serialized writes** — every action runs inside `db.transaction()`, so simultaneous actions never interleave
- **Lazy timer** — the planning timer is checked on each poll and action; no background jobs

---

## License

MIT © 2026 digable — see [LICENSE](LICENSE) for full text.

---

*Made with ❤️ for Iowa City*
