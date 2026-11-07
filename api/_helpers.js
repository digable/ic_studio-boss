// Shared request/response helpers

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// X-Forwarded-For is only honoured when the request arrives from a reverse proxy on this
// machine or a private network (loopback, RFC 1918, Tailscale's 100.64.0.0/10). A client
// connecting directly could otherwise put any address in the header and dodge rate limits.
function isTrustedProxy(addr) {
  if (!addr) return false;
  const ip = addr.startsWith("::ffff:") ? addr.slice(7) : addr;
  if (ip === "::1" || ip.startsWith("127.")) return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  const [a, b] = ip.split(".").map(Number);
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return /^f[cd]/i.test(ip); // IPv6 unique local
}

function getIp(req) {
  const peer = req.socket?.remoteAddress;
  const forwarded = isTrustedProxy(peer) ? req.headers["x-forwarded-for"]?.split(",")[0].trim() : null;
  return forwarded || peer || "unknown";
}

function send(res, status, body) {
  res.status(status).json(body);
}

function err(res, status, message, extra = {}) {
  res.status(status).json({ error: message, ...extra });
}

// Generate a random 4-char alphanumeric code (uppercase, no 0/O/I/1 ambiguity)
function generateCode() {
  const chars = "ACDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

module.exports = { cors, getIp, send, err, generateCode };
