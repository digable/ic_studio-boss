// POST /api/games/:code/action  { playerId, action }
// The server applies the action with the shared game rules and returns the
// player's updated (redacted) view. Every studio can act at the same time.

const { db, getSession } = require("../../_db");
const { checkRateLimit } = require("../../_rateLimit");
const { withState } = require("../../_engine");
const { cors, getIp, send, err } = require("../../_helpers");

const MAX_ACTION_BYTES = 2048;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return err(res, 405, "Method not allowed");

  const code = String(req.query.code || "").toUpperCase();
  if (!code) return err(res, 400, "Missing game code");
  const ip = getIp(req);

  try {
    await checkRateLimit(ip, "action", 240, 60);

    const { playerId, action } = req.body || {};
    if (!playerId) return err(res, 400, "playerId is required");
    if (!action || typeof action !== "object" || typeof action.type !== "string") return err(res, 400, "action is required");
    if (Buffer.byteLength(JSON.stringify(action)) > MAX_ACTION_BYTES) return err(res, 413, "Action too large");

    const result = await db.transaction(async (q) => {
      const session = await getSession(code, q);
      if (!session) return { status: 404, error: "Game not found" };
      if (session.status !== "playing" || !session.state) return { status: 409, error: "Game is not in progress" };

      const out = withState(session.state, (g) => {
        const pi = g.playerIndexBySession(playerId);
        if (pi < 0) return null;
        if (g.state.players[pi].left) return { left: true };
        g.checkTimer(Date.now());
        const r = g.applyAction(pi, action);
        return { ...r, view: g.redactStateFor(pi), over: g.state.phase === "GAME_OVER" };
      });
      if (!out) return { status: 403, error: "Player not in this game" };
      if (out.left) return { status: 403, error: "You left this game — rejoin with your invite link" };

      await q.run(
        "UPDATE sessions SET state = ?, status = ?, last_activity_at = ? WHERE code = ?",
        [JSON.stringify(session.state), out.over ? "done" : "playing", Date.now(), code]
      );
      return { body: { ok: out.ok, msg: out.msg, state: out.view } };
    });

    if (result.error) return err(res, result.status, result.error);
    return send(res, 200, result.body);
  } catch (e) {
    if (e.status === 429) return err(res, 429, e.message, { retryAfter: e.retryAfter });
    console.error(`POST /api/games/${code}/action`, e);
    return err(res, 500, "Internal server error");
  }
};
