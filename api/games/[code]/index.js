// GET /api/games/:code?playerId=...  — poll session (status, players, state redacted for that player)
// Also advances the quarter when the planning timer has run out.

const { db, getSession } = require("../../_db");
const { checkRateLimit } = require("../../_rateLimit");
const { withState } = require("../../_engine");
const { cors, getIp, send, err } = require("../../_helpers");

function publicSession(session, playerId) {
  let state = null;
  if (session.state) {
    state = withState(session.state, (g) => g.redactStateFor(g.playerIndexBySession(playerId)));
  }
  return {
    code: session.code,
    status: session.status,
    players: session.players.map((p) => ({ name: p.name, left: !!p.left, you: p.id === playerId })),
    state
  };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return err(res, 405, "Method not allowed");

  const code = String(req.query.code || "").toUpperCase();
  if (!code) return err(res, 400, "Missing game code");
  const playerId = String(req.query.playerId || "");
  const ip = getIp(req);

  try {
    await checkRateLimit(ip, "poll", 120, 60);

    const session = await db.transaction(async (q) => {
      const s = await getSession(code, q);
      if (!s || s.status !== "playing" || !s.state) return s;
      const advanced = withState(s.state, (g) => g.checkTimer(Date.now()));
      if (advanced) {
        if (s.state.phase === "GAME_OVER") s.status = "done";
        await q.run(
          "UPDATE sessions SET state = ?, status = ?, last_activity_at = ? WHERE code = ?",
          [JSON.stringify(s.state), s.status, Date.now(), code]
        );
      }
      return s;
    });
    if (!session) return err(res, 404, "Game not found");
    return send(res, 200, publicSession(session, playerId));
  } catch (e) {
    if (e.status === 429) return err(res, 429, e.message, { retryAfter: e.retryAfter });
    console.error(`GET /api/games/${code}`, e);
    return err(res, 500, "Internal server error");
  }
};

module.exports.publicSession = publicSession;
