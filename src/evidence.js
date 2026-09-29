// Evidence: every RYO answer a decision rests on is stored whole, under the
// SHA-256 of its canonical JSON, so a decision can later be rebuilt from exactly
// what the agent saw. Facts are read out of that stored evidence by code, never
// retyped by a model.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { call } from "./ryo.js";

export const DATA = process.env.SHISHO_DATA || join(process.cwd(), "data");

// Keys sorted at every level, so the same answer always has the same fingerprint.
export const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`
  : JSON.stringify(v);

export function store(result) {
  const body = canonical(result);
  const id = createHash("sha256").update(body).digest("hex").slice(0, 16);
  const dir = join(DATA, "evidence");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id}.json`);
  if (!existsSync(file)) writeFileSync(file, body);
  return id;
}

export const load = id => JSON.parse(readFileSync(join(DATA, "evidence", `${id}.json`), "utf8"));

// One pass over the market for a cycle: each tool answer is fetched once and
// shared by every strategy, which keeps the whole run inside the rate limit.
export class Cycle {
  constructor(at = new Date()) { this.at = at.toISOString(); this.cache = new Map(); }
  async get(tool, args = {}) {
    const k = tool + canonical(args);
    if (!this.cache.has(k)) this.cache.set(k, call(tool, args).then(r => ({ result: r, id: store(r) })));
    return this.cache.get(k);
  }
}

const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);

// The market facts a strategy's market rules are checked against.
export function marketFacts(overview, sentiment) {
  const o = overview?.status === "ok" ? overview.data : null;
  const e = sentiment?.status === "ok" ? sentiment.data?.evidence : null;
  return {
    fear_greed: num(e?.fear_greed?.value ?? o?.sentiment?.fear_greed_index),
    fear_greed_change_7d: num(e?.fear_greed?.change_7d_points),
    sentiment_regime: e?.sentiment_regime ?? null,
    market_regime: o?.regime ?? null,
    altseason_phase: e?.altseason?.phase ?? null,
    altseason_index: num(e?.altseason?.index),
    funding_crowding: e?.funding?.crowding_state ?? null,
    liquidation_pressure: e?.liquidation?.pressure_state ?? null,
    liquidated_side: e?.liquidation?.dominant_liquidated_side ?? null,
    breadth: num(o?.market?.breadth),
    btc_dominance: num(o?.market?.btc_dominance_pct),
  };
}

// The coin facts an entry rule is checked against: the scan row (if any) plus analyze_token.
export function coinFacts(scanRow, analysis) {
  const a = analysis?.status === "ok" ? analysis.data : null;
  return {
    symbol: a?.asset?.symbol || scanRow?.symbol || null,
    price_usd: num(a?.market?.price_usd ?? scanRow?.price_usd),
    change_1h_pct: num(a?.performance?.change_1h_pct),
    change_24h_pct: num(a?.performance?.change_24h_pct ?? scanRow?.change_24h_pct),
    change_7d_pct: num(a?.performance?.change_7d_pct),
    change_30d_pct: num(a?.performance?.change_30d_pct),
    market_cap_usd: num(a?.market?.market_cap_usd ?? scanRow?.market_cap_usd),
    volume_24h_usd: num(a?.market?.volume_24h_usd ?? scanRow?.volume_24h_usd),
    turnover_ratio: num(scanRow?.turnover_ratio ?? (a?.market?.volume_24h_usd && a?.market?.market_cap_usd ? +(a.market.volume_24h_usd / a.market.market_cap_usd).toFixed(4) : null)),
    momentum_score: num(scanRow?.momentum_score),
    established_asset: scanRow?.established_asset ?? null,
    rank: num(a?.asset?.rank ?? scanRow?.rank),
    rsi_14: num(a?.technical_analysis?.rsi_14),
    atr_14_pct: num(a?.technical_analysis?.atr_14_pct),
    trend: a?.technical_analysis?.trend ?? null,
    verdict: a?.verdict ?? a?.data?.verdict ?? null,
  };
}
