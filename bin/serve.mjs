// The Shishō website and its API, on http://localhost:3200
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { state, shisho } from "../src/api.js";
import { follow, pay } from "../src/market.js";
import { loadStrategies } from "../src/strategies.js";
import { compile, rightNow } from "../src/compile.js";
import { validate, describe, showValue } from "../src/strategy.js";
import { writeFileSync } from "node:fs";
import { DATA } from "../src/evidence.js";

const readBody = async req => { let b = ""; for await (const c of req) { b += c; if (b.length > 20000) throw new Error("Too long."); } return JSON.parse(b || "{}"); };
const handleOk = h => /^[a-z0-9_]{3,20}$/.test(String(h || "").trim().toLowerCase());

const PUB = join(process.cwd(), "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const json = (res, code, data) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(data)); };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/api/state") return json(res, 200, state());
    if (url.pathname.startsWith("/api/shisho/")) { const s = shisho(url.pathname.split("/").pop()); return s ? json(res, 200, s) : json(res, 404, { error: "No such shishō." }); }
    if (url.pathname === "/api/compile" && req.method === "POST") {
      const { text, handle } = await readBody(req);
      if (!handleOk(handle)) return json(res, 400, { error: "A handle is 3-20 letters, digits or underscores." });
      if (String(text || "").trim().length < 20) return json(res, 400, { error: "Describe the strategy in a sentence or two." });
      const r = await compile(text, String(handle).trim().toLowerCase());
      const now = rightNow(r.strategy, state().market);
      return json(res, 200, { ...r, right_now: now && { pass: now.pass, results: now.results.map(c => ({ ...c, text: describe(c), shown: showValue(c.field, c.actual) })) } });
    }
    if (url.pathname === "/api/publish" && req.method === "POST") {
      const { strategy: s, stake, wallet, signature, message } = await readBody(req);
      // The page sends back what it was shown; it's checked again here, never trusted.
      if (!s || !handleOk(s.creator?.handle) || !/^[a-z0-9-]{3,40}$/.test(s.id || "")) return json(res, 400, { error: "That strategy isn't valid." });
      const clean = { id: s.id, name: String(s.name).slice(0, 40), creator: { handle: s.creator.handle.toLowerCase(), demo: false }, thesis: String(s.thesis).slice(0, 300), source_text: String(s.source_text || "").slice(0, 800),
        universe: s.universe, market_filter: s.market_filter || [], entry: s.entry, exit: s.exit, sizing: s.sizing, follow_fee_ryochan: 5000000, stake_ryochan: Math.round(Number(stake) || 0), published_at: new Date().toISOString() };
      if (!(clean.stake_ryochan >= 10_000_000 && clean.stake_ryochan <= 200_000_000)) return json(res, 400, { error: "Stake between 10,000,000 and 200,000,000 RYO-CHAN to publish." });
      const errors = validate(clean);
      if (errors.length) return json(res, 400, { error: errors.join("; ") });
      if (state().shisho.some(x => x.id === clean.id)) return json(res, 409, { error: "Already published." });
      writeFileSync(join(DATA, "strategies", `${clean.id}.json`), JSON.stringify(clean, null, 1));
      pay({ type: "stake", strategy: clean.id, payer: clean.creator.handle, amount: clean.stake_ryochan, wallet, signature, message }, clean);
      return json(res, 200, { ok: true, id: clean.id });
    }
    if (url.pathname === "/api/pay" && req.method === "POST") {
      const b = await readBody(req);
      const s = loadStrategies().find(x => x.id === b.strategy);
      if (!s) return json(res, 404, { error: "No such shishō." });
      return json(res, 200, pay(b, s));
    }
    if (url.pathname === "/api/follow" && req.method === "POST") {
      const { handle, strategy } = await readBody(req);
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
