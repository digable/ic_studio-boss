// Self-hosting server: serves the game files and runs the /api handlers,
// using only Node's built-in modules.
//
//   node server.js            (listens on port 3000)
//   PORT=8080 node server.js
//
// Game data is stored in SQLite at data/game.db (see api/_db.js).

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const MAX_BODY_BYTES = 1024 * 1024; // action bodies are tiny; this leaves headroom

// URL pattern -> handler file
const routes = [
  { pattern: /^\/api\/games\/?$/,                     file: "api/games.js" },
  { pattern: /^\/api\/games\/([^/]+)\/?$/,            file: "api/games/[code]/index.js" },
  { pattern: /^\/api\/games\/([^/]+)\/join\/?$/,      file: "api/games/[code]/join.js" },
  { pattern: /^\/api\/games\/([^/]+)\/leave\/?$/,     file: "api/games/[code]/leave.js" },
  { pattern: /^\/api\/games\/([^/]+)\/start\/?$/,     file: "api/games/[code]/start.js" },
  { pattern: /^\/api\/games\/([^/]+)\/action\/?$/,    file: "api/games/[code]/action.js" }
].map((r) => ({ ...r, handler: require(path.join(ROOT, r.file)) }));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md":   "text/markdown; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".mp3":  "audio/mpeg",
  ".ogg":  "audio/ogg",
  ".wav":  "audio/wav"
};

// Never served as static files
const BLOCKED = /^\/(api|data|node_modules)(\/|$)|\/\.|^\/(server\.js|package(-lock)?\.json)$/;

// Add the Express-style helpers the handlers expect
function decorate(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve(undefined);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("Invalid JSON body"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, url, route, match) {
  decorate(res);
  req.query = Object.fromEntries(url.searchParams);
  if (match[1]) req.query.code = decodeURIComponent(match[1]);
  try {
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      req.body = await readJsonBody(req);
    }
    await route.handler(req, res);
  } catch (e) {
    if (!res.headersSent) res.status(e.status || 500).json({ error: e.status ? e.message : "Internal server error" });
    if (!e.status) console.error(req.method, url.pathname, e);
  }
}

function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    return res.end("Method not allowed");
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { res.writeHead(400); return res.end("Bad request"); }
  if (pathname.endsWith("/")) pathname += "index.html";

  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT + path.sep) || BLOCKED.test(pathname)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const headers = {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size
    };
    // Always fetch fresh game scripts
    if (pathname.startsWith("/scripts/")) headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    for (const route of routes) {
      const match = url.pathname.match(route.pattern);
      if (match) return handleApi(req, res, url, route, match);
    }
    decorate(res).status(404).json({ error: "Not found" });
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
  const dbFile = process.env.DB_FILE || "data/game.db";
  console.log(`IC Studio Boss running at http://${HOST}:${PORT} using SQLite (${dbFile})`);
});
