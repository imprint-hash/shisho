// The Shishō website and its API, on http://localhost:3200
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { state, shisho } from "../src/api.js";
import { follow } from "../src/market.js";

const PUB = join(process.cwd(), "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const json = (res, code, data) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(data)); };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/api/state") return json(res, 200, state());
    if (url.pathname.startsWith("/api/shisho/")) { const s = shisho(url.pathname.split("/").pop()); return s ? json(res, 200, s) : json(res, 404, { error: "No such shishō." }); }
    if (url.pathname === "/api/follow" && req.method === "POST") {
      let body = ""; for await (const c of req) body += c;
      const { handle, strategy } = JSON.parse(body || "{}");
      if (!state().shisho.some(s => s.id === strategy)) return json(res, 404, { error: "No such shishō." });
      return json(res, 200, follow(handle, strategy));
    }
    const path = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
    const file = join(PUB, path);
    if (!file.startsWith(PUB) || !existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  } catch (e) { json(res, 400, { error: e.message }); }
}).listen(Number(process.env.PORT || 3200), () => console.log(`Shishō on http://localhost:${process.env.PORT || 3200}`));
