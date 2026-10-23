// Shared request/response helpers

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
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
