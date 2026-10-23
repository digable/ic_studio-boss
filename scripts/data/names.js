// Name tables: film titles, loglines, talent, writers, studios.

const TITLE_PARTS = {
  ACTION: {
    patterns: ["{A} {N}", "The {N} Protocol", "{N} Down", "{A} {N} {S}", "No {N}", "Operation {N}"],
    A: ["Maximum", "Lethal", "Terminal", "Rogue", "Iron", "Deadly", "Final", "Hard", "Black", "Total"],
    N: ["Velocity", "Impact", "Vengeance", "Fury", "Strike", "Payback", "Ultimatum", "Fallout", "Getaway", "Justice"]
  },
  COMEDY: {
    patterns: ["My {A} {N}", "The {N} Party", "{A} {N}", "{N} Trouble", "Dude, Where's My {N}?", "Meet the {N}"],
    A: ["Totally", "Awkward", "Accidental", "Weekend", "Super", "Bad", "Big", "Wild"],
    N: ["Roommate", "Wedding", "Neighbor", "Intern", "Road Trip", "Tailgate", "Uncle", "Landlord", "Minivan"]
  },
  DRAMA: {
    patterns: ["The {N} of {P}", "A {A} {N}", "{A} {N}", "{N} in {P}", "The Last {N}"],
    A: ["Quiet", "Broken", "Silent", "Long", "Golden", "Distant", "Bitter"],
    N: ["Winter", "Promise", "River", "Harvest", "Letter", "Season", "Silence", "Inheritance"],
    P: ["Iowa", "the Prairie", "Coralville", "Solon", "the Heartland", "Riverside", "Johnson County"]
  },
  HORROR: {
    patterns: ["{N} of the Dead", "The {N}", "Night of the {N}", "It Came from {P}", "{N} {S}", "Don't Go in the {N}"],
    N: ["Corn", "Cellar", "Scarecrow", "Hollow", "Cabin", "Harvest", "Basement", "Grain Silo"],
    P: ["the Cornfield", "the Beer Caves", "the Iowa River", "Oakland Cemetery", "the Ped Mall", "Below Kinnick"]
  },
  SCIFI: {
    patterns: ["{N} {S}", "{A} {N}", "Beyond {P}", "The {N} Paradox", "{A} Signal"],
    A: ["Dark", "Quantum", "Hyper", "Neon", "Lost", "Last", "Silent"],
    N: ["Horizon", "Orbit", "Colony", "Eclipse", "Nexus", "Drift", "Frontier", "Machine"],
    P: ["the Stars", "Andromeda", "Tomorrow", "the Void", "Europa"]
  },
  FAMILY: {
    patterns: ["The {A} {N}", "{N} and Friends", "A {N}'s Tale", "Little {N}", "{N} Saves Christmas"],
    A: ["Magic", "Brave", "Little", "Lost", "Flying", "Secret", "Tiny"],
    N: ["Pony", "Dragon", "Robot", "Puppy", "Penguin", "Tractor", "Gopher", "Hawkeye"]
  },
  ROMANCE: {
    patterns: ["{A} in {P}", "Love {N}", "The {N} Between Us", "{A} {N}", "Falling for {P}"],
    A: ["Summer", "Autumn", "Sweet", "Midnight", "Second Chance", "Starlight"],
    N: ["Letters", "Promises", "Hearts", "Kisses", "Days", "Vows"],
    P: ["Paris", "Iowa City", "Tuscany", "Des Moines", "the City", "Lake MacBride"]
  }
};
const TITLE_SEQUELS = ["2", "3", "II", "Returns", "Rising", "Reloaded", "Forever"];

const LOGLINES = {
  ACTION: [
    "An ex-cop has one night to stop a heist on the Iowa River bridges.",
    "A retired spy is dragged back in for one last impossible job.",
    "Two rival bounty hunters chase the same fugitive across the Midwest.",
    "A stunt driver discovers her getaway client is the target."
  ],
  COMEDY: [
    "Two best friends accidentally book the same wedding venue.",
    "A buttoned-up accountant inherits a failing tailgate catering truck.",
    "A family road trip goes wrong in every possible direction.",
    "A grad student fakes a fiancé to impress her advisor."
  ],
  DRAMA: [
    "A farm family faces one last harvest before the bank takes the land.",
    "A writer returns home to care for the father she never forgave.",
    "Three generations of a family share one long, quiet winter.",
    "A small-town teacher fights to keep her school open."
  ],
  HORROR: [
    "Something is living in the corn, and it has learned to knock.",
    "College friends explore the Beer Caves and only some come back.",
    "A night guard at the museum hears the portraits whispering.",
    "A family's new farmhouse comes with a locked cellar door."
  ],
  SCIFI: [
    "A deep-space colony receives a signal from Earth that shouldn't exist.",
    "An engineer wakes up a century late on a silent generation ship.",
    "A physicist's experiment opens a door to yesterday.",
    "The last pilot of a dying fleet must trust an alien machine."
  ],
  FAMILY: [
    "A lonely kid befriends a tiny dragon living in the barn.",
    "A retired robot sets out to find the family that built him.",
    "A penguin gets lost at the state fair and finds his courage.",
    "Siblings must save the town parade after a magic mishap."
  ],
  ROMANCE: [
    "Two rival bookstore owners keep meeting at the farmers market.",
    "A summer fling becomes complicated when he's her new boss.",
    "Pen pals for twenty years finally agree to meet.",
    "A wedding planner falls for the groom's brother."
  ]
};

const FIRST_NAMES = [
  "Ana", "Ben", "Cleo", "Dev", "Ella", "Felix", "Gia", "Hank", "Iris", "Jules", "Kai", "Lena",
  "Marco", "Nina", "Owen", "Priya", "Quinn", "Rosa", "Sam", "Tess", "Uma", "Vic", "Wren", "Xavi",
  "Yara", "Zane", "Mabel", "Theo", "Ruby", "Omar", "Hazel", "Leo", "Nadia", "Rex", "Sadie", "Jonah"
];
const LAST_NAMES = [
  "Ruiz", "Park", "Okafor", "Lindqvist", "Moreau", "Hale", "Vance", "Castillo", "Byrne", "Nakamura",
  "Sterling", "Quill", "Duarte", "Fontaine", "Kowalski", "Reyes", "Abara", "Whitlock", "Marsh", "Delacroix",
  "Holloway", "Tran", "Brennan", "Iverson", "Sato", "Blackwood", "Ferro", "Mendez", "Novak", "Ashby"
];

const STUDIO_NAMES = [
  "Old Capitol Pictures", "Black Angel Films", "Pentacrest Productions", "Cornfield Pictures",
  "Riverside Studios", "Ped Mall Pictures", "Coralville Lake Entertainment", "Kinnick Motion Co.",
  "Hawkeye Studios", "Prairie Sky Films", "Benton Street Pictures", "Iowa River Media"
];
const AI_STUDIO_NAMES = [
  "Megaplex Media", "Titan Pictures", "Galaxy Global", "Silver Screen Corp", "Neon Lion Films", "Paramountain"
];

function makePersonName() {
  const taken = new Set([
    ...Object.values(state.talent).map((t) => t.name),
    ...Object.values(state.writers).map((w) => w.name)
  ]);
  for (let i = 0; i < 40; i++) {
    const n = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    if (!taken.has(n)) return n;
  }
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} Jr.`;
}

function makeTitle(genre) {
  const parts = TITLE_PARTS[genre];
  const fill = (pat) => pat
    .replace("{A}", () => pick(parts.A || ["Great"]))
    .replace("{N}", () => pick(parts.N))
    .replace("{P}", () => pick(parts.P || ["Iowa"]))
    .replace("{S}", () => pick(TITLE_SEQUELS));
  for (let i = 0; i < 30; i++) {
    const t = fill(pick(parts.patterns));
    if (!state.usedTitles.includes(t)) { state.usedTitles.push(t); return t; }
  }
  const t = `${fill(pick(parts.patterns))} ${pick(TITLE_SEQUELS)}`;
  state.usedTitles.push(t);
  return t;
}

function studioTag(name) {
  const words = name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean);
  return (words.length >= 3 ? words.slice(0, 3).map((w) => w[0]).join("") : name.replace(/\s/g, "").slice(0, 3)).toUpperCase();
}
