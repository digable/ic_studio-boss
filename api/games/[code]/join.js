// POST /api/games/:code/join

const { db, getSession } = require("../../_db");
const { checkRateLimit } = require("../../_rateLimit");
const { cors, getIp, send, err } = require("../../_helpers");
const { withState } = require("../../_engine");
const { randomUUID } = require("crypto");

const MAX_PLAYERS = 6;
const MAX_NAME_LEN = 32;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return err(res, 405, "Method not allowed");

  const code = String(req.query.code || "").toUpperCase();
  if (!code) return err(res, 400, "Missing game code");
  const ip = getIp(req);

  try {
    await checkRateLimit(ip, "join", 50, 3600);

    const { displayName, deviceId } = req.body || {};
    if (!displayName || typeof displayName !== "string") {
      return err(res, 400, "displayName is required");
    }
    const name = displayName.trim().slice(0, MAX_NAME_LEN);
    if (!name) return err(res, 400, "displayName cannot be empty");

    const result = await db.transaction(async (q) => {
      const session = await getSession(code, q);
      if (!session) return { status: 404, error: "Game not found" };
      if (session.status === "done") return { status: 409, error: "Game has ended" };

      // Always allow rejoin by deviceId regardless of status
      const existingPlayer = session.players.find((p) => p.deviceId === deviceId);
      if (existingPlayer) {
        // Coming back mid-game takes the studio back from the AI caretaker
        if (existingPlayer.left && session.status === "playing") {
          const players = session.players.map((p) => (p.id === existingPlayer.id ? { ...p, left: false } : p));
          withState(session.state, (g) => g.humanReturns(g.playerIndexBySession(existingPlayer.id)));
          await q.run(
            "UPDATE sessions SET players = ?, state = ?, last_activity_at = ? WHERE code = ?",
            [JSON.stringify(players), JSON.stringify(session.state), Date.now(), code]
          );
        }
        return { body: { playerId: existingPlayer.id, rejoined: true, status: session.status } };
      }

      // New player — only allowed while in lobby
      if (session.status !== "lobby") return { status: 409, error: "Game already started — ask the host to create a new game" };
      if (session.players.length >= MAX_PLAYERS) return { status: 409, error: "Lobby is full" };

      const playerId = randomUUID();
      const players = [...session.players, { id: playerId, name, deviceId: deviceId || null }];
      await q.run(
        "UPDATE sessions SET players = ?, last_activity_at = ? WHERE code = ?",
        [JSON.stringify(players), Date.now(), code]
      );
      return { body: { playerId } };
    });

    if (result.error) return err(res, result.status, result.error);
    return send(res, 200, result.body);
  } catch (e) {
    if (e.status === 429) return err(res, 429, e.message, { retryAfter: e.retryAfter });
    console.error(`POST /api/games/${code}/join`, e);
    return err(res, 500, "Internal server error");
  }
};
