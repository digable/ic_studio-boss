// All immutable game configuration. Loads first (browser and server engine).

const GAME_NAME = "IC Studio Boss";

const MAX_PLAYERS = 6;
const STARTING_CASH = 40;
const STARTING_HAND = 3;          // starter cards dealt to each studio
const BASE_AP = 3;                // action points per quarter
const MAX_BONUS_AP = 2;           // +1 AP per A-list star on your books, up to this many
const A_LIST_FAME = 7;
const OVERHEAD = 2;               // $M per quarter
const LOAN_SIZE = 20;
const REPAY_SIZE = 10;
const MAX_DEBT = 100;
const LOAN_INTEREST = 0.05;       // per quarter
const PRESTIGE_VALUE = 10;        // studio value per prestige point
const LIBRARY_RATE = 0.1;         // studio value per $ of lifetime gross
const RUN_LENGTH = 3;             // quarters a film stays in theaters
const INVESTOR_SHARE = 0.15;      // cut of gross taken by investors after a pitch
const REWRITE_COST = 2;
const HAND_LIMIT = 3;
const MAX_LOG = 120;
const ACCEPT_THRESHOLD = 0;       // talent signs if appeal >= this
const INTERESTED_THRESHOLD = 6;   // "interested" badge when appeal at asking fee >= this

const MARKET_SIZE = { scripts: 4 };

const GAME_LENGTHS = {
  SHORT:    { label: "Short (2 years)",    quarters: 8 },
  STANDARD: { label: "Standard (3 years)", quarters: 12 },
  LONG:     { label: "Long (4 years)",     quarters: 16 }
};

const TIMER_OPTIONS = [0, 60, 90, 120, 180]; // planning timer seconds, 0 = off

const QUARTERS = [
  { short: "Q1", name: "Winter" },
  { short: "Q2", name: "Spring" },
  { short: "Q3", name: "Summer" },
  { short: "Q4", name: "Holiday" }
];

// season: box office multiplier per quarter; appeal: overall audience size; critic: critics' bias
const GENRES = {
  ACTION:  { name: "Action",  season: [0.8, 1.0, 1.4, 1.0], appeal: 1.10, critic: -5 },
  COMEDY:  { name: "Comedy",  season: [1.0, 1.1, 1.1, 1.0], appeal: 1.00, critic: 0 },
  DRAMA:   { name: "Drama",   season: [1.1, 0.9, 0.8, 1.3], appeal: 0.85, critic: 8 },
  HORROR:  { name: "Horror",  season: [0.9, 0.9, 1.0, 1.35], appeal: 0.95, critic: -3, indieFriendly: true },
  SCIFI:   { name: "Sci-Fi",  season: [0.9, 1.1, 1.3, 1.0], appeal: 1.05, critic: 0 },
  FAMILY:  { name: "Family",  season: [0.9, 1.0, 1.2, 1.4], appeal: 1.00, critic: 0 },
  ROMANCE: { name: "Romance", season: [1.3, 1.0, 0.9, 1.0], appeal: 0.90, critic: 2, indieFriendly: true }
};
const GENRE_KEYS = Object.keys(GENRES);

// shootMod adjusts the script's base shoot length; reach scales the audience
const BUDGETS = {
  INDIE:       { name: "Indie",       cost: 8,  shootMod: -1, quality: -3, reach: 0.7 },
  STUDIO:      { name: "Studio",      cost: 20, shootMod: 0,  quality: 3,  reach: 1.0 },
  BLOCKBUSTER: { name: "Blockbuster", cost: 45, shootMod: 1,  quality: 8,  reach: 1.5 }
};
const BUDGET_KEYS = Object.keys(BUDGETS);

// Cast roles. weight = share of the cast's contribution; feeMult scales a star's asking fee
const ROLES = {
  LEAD:    { name: "Lead",       weight: 1.0,  feeMult: 1.0 },
  COLEAD:  { name: "Co-Lead",    weight: 0.6,  feeMult: 0.75 },
  SUPPORT: { name: "Supporting", weight: 0.35, feeMult: 0.5 }
};
// Possible cast layouts for a script (1-4 main roles)
const CAST_LAYOUTS = [
  ["LEAD"],
  ["LEAD", "COLEAD"],
  ["LEAD", "COLEAD", "SUPPORT"],
  ["LEAD", "COLEAD", "SUPPORT", "SUPPORT"]
];
const UNKNOWN_SKILL = 3;          // an unfilled role is played by an unknown at this skill
const UNKNOWN_QUALITY_PENALTY = 4;

const MARKETING = {
  SMALL: { name: "Trailer push",     cost: 4,  hype: 10 },
  BIG:   { name: "Full campaign",    cost: 12, hype: 28 }
};

// Project lifecycle
const STATUS = {
  DEV: "DEV",             // in development: script owned, attaching people
  FILMING: "FILMING",
  CANNED: "CANNED",       // in the can, waiting for a release slot
  SCHEDULED: "SCHEDULED", // opens at the end of this quarter
  THEATERS: "THEATERS",
  LIBRARY: "LIBRARY"
};
const STATUS_LABEL = {
  DEV: "In development",
  FILMING: "Filming",
  CANNED: "In the can",
  SCHEDULED: "Opening this quarter",
  THEATERS: "In theaters",
  LIBRARY: "Library"
};

// Action point cost of each action type (0 = anytime / free)
const AP_COST = {
  BID_SCRIPT: 1,
  OFFER: 1,
  SCOUT: 1,
  GREENLIGHT: 1,
  RELEASE: 1,
  REWRITE: 1,
  PLAY_CARD: 1,
  WITHDRAW: 0,
  ATTACH: 0,
  MARKETING: 0,
  LOAN: 0,
  REPAY: 0,
  PITCH: 0,
  READY: 0
};

const AWARDS = {
  BEST_PICTURE: { name: "Best Picture",       prestige: 3 },
  GOLDEN_POPCORN: { name: "Golden Popcorn",   prestige: 2 },
  BEST_INDIE: { name: "Best Indie",           prestige: 1 }
};

const PLAYER_COLORS = ["P1", "P2", "P3", "P4", "P5", "P6"];
