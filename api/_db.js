// SQLite database for game sessions and rate limiting.
//
// Tables:
//   sessions         one row per multiplayer game; players, left_log and state are JSON text
//   rate_limit_hits  one row per rate-limited request, deleted once its window has passed
//
// Every query goes through one queue, so a handler's read-then-write inside
// transaction() can never interleave with another request.
//
// SQLite driver, first one found:
//   1. the `sqlite3` module  (Debian: sudo apt install node-sqlite3   anywhere else: npm install sqlite3)
//   2. Node's built-in `node:sqlite` (Node 22.13+), handy for local development

const fs = require("fs");
const path = require("path");

const DB_FILE = process.env.DB_FILE || path.join(__dirname, "..", "data", "game.db");
const SWEEP_INTERVAL_MS = 60 * 1000;

// --- driver -----------------------------------------------------------------

function openDriver(file) {
  let sqlite3;
  try {
    sqlite3 = require("sqlite3");
  } catch (e) {
    if (e.code !== "MODULE_NOT_FOUND") throw e;
  }

  if (sqlite3) {
    const db = new sqlite3.Database(file);
    const call = (method, sql, params = []) =>
      new Promise((resolve, reject) =>
        db[method](sql, params, function (err, rows) { err ? reject(err) : resolve(method === "run" ? this : rows); })
      );
    return {
      name: "sqlite3",
      exec: (sql) => new Promise((resolve, reject) => db.exec(sql, (err) => (err ? reject(err) : resolve()))),
      run: (sql, params) => call("run", sql, params),
      get: (sql, params) => call("get", sql, params),
      all: (sql, params) => call("all", sql, params),
      close: () => db.close()
    };
  }

  let DatabaseSync;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    throw new Error(
      "No SQLite driver found. On Debian run: sudo apt install node-sqlite3 " +
      "(elsewhere: npm install sqlite3, or use Node 22.13 or newer)."
    );
  }
  const db = new DatabaseSync(file);
  return {
    name: "node:sqlite",
    exec: async (sql) => db.exec(sql),
    run: async (sql, params = []) => db.prepare(sql).run(...params),
    get: async (sql, params = []) => db.prepare(sql).get(...params),
    all: async (sql, params = []) => db.prepare(sql).all(...params),
    close: () => db.close()
  };
}

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const driver = openDriver(DB_FILE);

const ready = driver.exec(`
  PRAGMA journal_mode = WAL;      -- fewer disk syncs, much faster on a spinning hard drive
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;

  DROP TABLE IF EXISTS docs;      -- old document-store table, replaced by the tables below

  CREATE TABLE IF NOT EXISTS sessions (
    code             TEXT    PRIMARY KEY,
    host_id          TEXT    NOT NULL,
    host_ip          TEXT,
    created_by_ip    TEXT    NOT NULL,
    status           TEXT    NOT NULL CHECK (status IN ('lobby', 'playing', 'done')),
    players          TEXT    NOT NULL DEFAULT '[]',  -- JSON [{ id, name, deviceId }], in turn order
    left_log         TEXT    NOT NULL DEFAULT '[]',  -- JSON [{ name, slot }]
    state            TEXT,                           -- JSON game state, null until started
    created_at       INTEGER NOT NULL,               -- ms since epoch
    last_activity_at INTEGER NOT NULL,
    expires_at       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_ip_status ON sessions (created_by_ip, status);
  CREATE INDEX IF NOT EXISTS sessions_expires   ON sessions (expires_at);

  CREATE TABLE IF NOT EXISTS rate_limit_hits (
    key        TEXT    NOT NULL,  -- "action:ip"
    hit_at     INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS rate_limit_hits_key     ON rate_limit_hits (key, hit_at);
  CREATE INDEX IF NOT EXISTS rate_limit_hits_expires ON rate_limit_hits (expires_at);
`).then(async () => {
  // Columns added after the table was first created
  const columns = (await driver.all("PRAGMA table_info(sessions)")).map((c) => c.name);
  if (!columns.includes("host_ip")) await driver.exec("ALTER TABLE sessions ADD COLUMN host_ip TEXT");
});

// --- query queue --------------------------------------------------------------

let queue = Promise.resolve();
function serial(fn) {
  const result = queue.then(() => ready).then(fn);
  queue = result.catch(() => {});
  return result;
}

const q = {
  run: (sql, params) => driver.run(sql, params),
  get: (sql, params) => driver.get(sql, params),
  all: (sql, params) => driver.all(sql, params)
};

// Runs fn(q) with exclusive access to the database, inside a transaction.
function transaction(fn) {
  return serial(async () => {
    await driver.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn(q);
      await driver.exec("COMMIT");
      return result;
    } catch (e) {
      await driver.exec("ROLLBACK").catch(() => {});
      throw e;
    }
  });
}

const db = {
  run: (sql, params) => serial(() => q.run(sql, params)),
  get: (sql, params) => serial(() => q.get(sql, params)),
  all: (sql, params) => serial(() => q.all(sql, params)),
  transaction
};

// --- sessions ---------------------------------------------------------------

// Turns a sessions row into the shape the API returns
function sessionFromRow(row) {
  if (!row) return null;
  return {
    code: row.code,
    hostId: row.host_id,
    hostIp: row.host_ip,
    createdByIp: row.created_by_ip,
    status: row.status,
    players: JSON.parse(row.players),
    leftLog: JSON.parse(row.left_log),
    state: row.state == null ? null : JSON.parse(row.state),
    createdAt: new Date(row.created_at).toISOString(),
    lastActivityAt: new Date(row.last_activity_at).toISOString()
  };
}

// Unexpired session by code, or null. Pass a transaction's q to read inside it.
async function getSession(code, conn = db) {
  const row = await conn.get(
    "SELECT * FROM sessions WHERE code = ? AND expires_at > ?",
    [code, Date.now()]
  );
  return sessionFromRow(row);
}

// --- housekeeping -------------------------------------------------------------

function sweep() {
  return serial(async () => {
    const now = Date.now();
    await q.run("DELETE FROM sessions WHERE expires_at <= ?", [now]);
    await q.run("DELETE FROM rate_limit_hits WHERE expires_at <= ?", [now]);
  }).catch((e) => console.error("db: sweep failed", e.message));
}
sweep();
setInterval(sweep, SWEEP_INTERVAL_MS).unref();

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.once(sig, () => {
    queue.finally(() => {
      try { driver.close(); } catch {}
      process.exit(0);
    });
  });
}

module.exports = { db, getSession, driverName: driver.name };
