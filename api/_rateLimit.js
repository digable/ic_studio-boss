// Per-IP rate limiting backed by the rate_limit_hits table.
// Call checkRateLimit(ip, action, max, windowSecs) — throws on limit exceeded.

const { db } = require("./_db");

async function checkRateLimit(ip, action, max, windowSecs) {
  const key = `${action}:${ip}`;
  const now = Date.now();
  const windowMs = windowSecs * 1000;

  const { count, oldest } = await db.transaction(async (q) => {
    await q.run("DELETE FROM rate_limit_hits WHERE key = ? AND hit_at <= ?", [key, now - windowMs]);
    const row = await q.get(
      "SELECT COUNT(*) AS count, MIN(hit_at) AS oldest FROM rate_limit_hits WHERE key = ?",
      [key]
    );
    const count = Number(row.count);
    // Blocked requests aren't recorded, so a flood can't grow the table past max rows per key
    if (count < max) {
      await q.run(
        "INSERT INTO rate_limit_hits (key, hit_at, expires_at) VALUES (?, ?, ?)",
        [key, now, now + windowMs]
      );
    }
    return { count, oldest: row.oldest };
  });

  if (count >= max) {
    const retryAfter = Math.ceil((Number(oldest) + windowMs - now) / 1000);
    const err = new Error("Too many requests");
    err.status = 429;
    err.retryAfter = Math.max(1, retryAfter);
    throw err;
  }
}

module.exports = { checkRateLimit };
