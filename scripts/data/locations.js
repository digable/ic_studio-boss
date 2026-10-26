// Filming locations. A location can be attached to any number of projects in
// development, but only one production can be filming there at a time.
// fit: genres that shoot well here (+quality); draw: how much talent likes working here (0-3)
// fee: $M per production in today's dollars (game-design estimate)

const LOCATIONS = [
  { id: "L_CAPITOL",  name: "Old Capitol",          fee: 1.0, draw: 2, fit: ["DRAMA", "HORROR"] },
  { id: "L_KINNICK",  name: "Kinnick Stadium",      fee: 1.5, draw: 3, fit: ["ACTION", "FAMILY", "COMEDY"] },
  { id: "L_PEDMALL",  name: "Ped Mall",             fee: 0.5, draw: 2, fit: ["COMEDY", "ROMANCE"] },
  { id: "L_LAKE",     name: "Coralville Lake",      fee: 0.8, draw: 2, fit: ["ROMANCE", "FAMILY", "HORROR"] },
  { id: "L_CAVES",    name: "Beer Caves",           fee: 0.5, draw: 1, fit: ["HORROR", "SCIFI"] },
  { id: "L_OAKLAND",  name: "Oakland Cemetery",     fee: 0.25, draw: 0, fit: ["HORROR", "DRAMA"] },
  { id: "L_RIVER",    name: "Iowa River Bridges",   fee: 0.8, draw: 1, fit: ["ACTION", "DRAMA"] },
  { id: "L_LIBRARY",  name: "Main Library",         fee: 0.5, draw: 1, fit: ["SCIFI", "DRAMA", "COMEDY"] },
  { id: "L_FARM",     name: "Johnson County Farm",  fee: 0.3, draw: 0, fit: ["HORROR", "DRAMA", "FAMILY"] },
  { id: "L_SOUNDSTAGE", name: "North Liberty Soundstage", fee: 2.0, draw: 2, fit: ["SCIFI", "ACTION", "FAMILY"] }
];
