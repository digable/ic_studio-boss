// POST /api/games/:code/start  (host only)  { hostId, settings: { aiCount, length, scandals, timer, startYear } }
// The server builds the starting state with the shared rules.

const { db, getSession } = require("../../_db");
const { withState } = require("../../_engine");
const { cors, send, err } = require("../../_helpers");

const MAX_PLAYERS = 6;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return err(res, 405, "Method not allowed");

  const code = String(req.query.code || "").toUpperCase();
  if (!code) return err(res, 400, "Missing game code");

  try {
    const { hostId, settings = {} } = req.body || {};
    if (!hostId) return err(res, 400, "hostId is required");

    const result = await db.transaction(async (q) => {
      const session = await getSession(code, q);
      if (!session) return { status: 404, error: "Game not found" };
      if (session.hostId !== hostId) return { status: 403, error: "Not the host" };
      if (session.status !== "lobby") return { status: 409, error: "Game already started" };
      if (session.players.length < 1) return { status: 409, error: "Need at least 1 player to start" };

      const humans = session.players.map((p) => ({ name: p.name, sessionId: p.id }));
      const aiCount = Math.max(0, Math.min(MAX_PLAYERS - humans.length, Number(settings.aiCount) || 0));
      const ai = Array.from({ length: aiCount }, (_, i) => ({ name: `AI ${i + 1}`, ai: true }));
      if (humans.length + ai.length < 2) return { status: 409, error: "Add an AI studio or wait for another player" };

      const state = withState(null, (g) => g.createGame({
        players: [...humans, ...ai],
        length: settings.length,
        scandals: !!settings.scandals,
        startYear: settings.startYear ?? null,
        timer: settings.timer
      }));

      await q.run(
        "UPDATE sessions SET status = 'playing', state = ?, last_activity_at = ? WHERE code = ?",
        [JSON.stringify(state), Date.now(), code]
      );
      return {};
    });

    if (result.error) return err(res, result.status, result.error);
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error(`POST /api/games/${code}/start`, e);
    return err(res, 500, "Internal server error");
  }
};
