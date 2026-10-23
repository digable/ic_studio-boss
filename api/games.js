// POST /api/games — create a new multiplayer session
// Returns { code, hostId }

const { db } = require("./_db");
const { checkRateLimit } = require("./_rateLimit");
const { cors, getIp, send, err, generateCode } = require("./_helpers");
const { randomUUID } = require("crypto");

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return err(res, 405, "Method not allowed");

  const ip = getIp(req);

  try {
    await checkRateLimit(ip, "create_game", 20, 3600);

    const hostId = randomUUID();
    const result = await db.transaction(async (q) => {
      const now = Date.now();

      // Max 10 active sessions per IP
      const { active } = await q.get(
        `SELECT COUNT(*) AS active FROM sessions
         WHERE created_by_ip = ? AND status IN ('lobby', 'playing') AND expires_at > ?`,
        [ip, now]
      );
      if (Number(active) >= 10) return { status: 429, error: "Too many active sessions from this IP" };

      // Generate a unique code (retry up to 5 times on collision)
      let code;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateCode();
        const taken = await q.get("SELECT 1 FROM sessions WHERE code = ?", [candidate]);
        if (!taken) { code = candidate; break; }
      }
      if (!code) return { status: 500, error: "Could not generate a unique game code — try again" };

      await q.run(
        `INSERT INTO sessions (code, host_id, host_ip, created_by_ip, status, created_at, last_activity_at, expires_at)
         VALUES (?, ?, ?, ?, 'lobby', ?, ?, ?)`,
        [code, hostId, ip, ip, now, now, now + SESSION_TTL_MS]
      );
      return { code };
    });

    if (result.error) return err(res, result.status, result.error);
    return send(res, 201, { code: result.code, hostId });
  } catch (e) {
    if (e.status === 429) return err(res, 429, e.message, { retryAfter: e.retryAfter });
    console.error("POST /api/games", e);
    return err(res, 500, "Internal server error");
  }
};
