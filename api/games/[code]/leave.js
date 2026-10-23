// POST /api/games/:code/leave  { playerId }
// In the lobby the player is removed. Mid-game their studio is handed to the AI,
// so the remaining players never wait on someone who's gone.

const { db, getSession } = require("../../_db");
const { withState } = require("../../_engine");
const { cors, send, err } = require("../../_helpers");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return err(res, 405, "Method not allowed");

  const code = String(req.query.code || "").toUpperCase();
  if (!code) return err(res, 400, "Missing game code");

  try {
    const { playerId } = req.body || {};

    const result = await db.transaction(async (q) => {
      const session = await getSession(code, q);
      if (!session) return { status: 404, error: "Game not found" };

      if (session.status === "lobby") {
        const players = session.players.filter((p) => p.id !== playerId);
        await q.run(
          "UPDATE sessions SET players = ?, last_activity_at = ? WHERE code = ?",
          [JSON.stringify(players), Date.now(), code]
        );
        return {};
      }

      if (session.status !== "playing") return {};
      const slot = session.players.findIndex((p) => p.id === playerId);
      if (slot === -1 || session.players[slot].left) return {};

      const players = session.players.map((p, i) => (i === slot ? { ...p, left: true } : p));
      const leftLog = [...session.leftLog, { name: session.players[slot].name, slot }];
      if (session.state) {
        withState(session.state, (g) => g.aiTakeOver(g.playerIndexBySession(playerId)));
      }
      const anyoneLeft = players.some((p) => !p.left);
      const over = !anyoneLeft || session.state?.phase === "GAME_OVER";

      await q.run(
        "UPDATE sessions SET players = ?, left_log = ?, state = ?, status = ?, last_activity_at = ? WHERE code = ?",
        [JSON.stringify(players), JSON.stringify(leftLog), JSON.stringify(session.state), over ? "done" : "playing", Date.now(), code]
      );
      return {};
    });

    if (result.error) return err(res, result.status, result.error);
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error(`POST /api/games/${code}/leave`, e);
    return err(res, 500, "Internal server error");
  }
};
