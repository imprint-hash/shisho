// Publishing: a creator describes their strategy in plain English, a model turns
// it into exact rules using only fields RYO's tools return, and code validates
// the result before it can ever run. The model proposes; validate() decides.

import { MARKET_FIELDS, COIN_FIELDS, OPS, validate, describe, checkAll } from "./strategy.js";

const URL = process.env.SHISHO_LLM_URL;
const KEY = process.env.SHISHO_LLM_KEY;
const MODEL = process.env.SHISHO_LLM_MODEL || "openai/gpt-oss-120b";

const cond = fields => ({ type: "object", additionalProperties: false, required: ["field", "op", "value"], properties: {
  field: { type: "string", enum: Object.keys(fields) }, op: { type: "string", enum: OPS },
  value: { anyOf: [{ type: "number" }, { type: "string" }, { type: "boolean" }, { type: "array", items: { type: "string" } }] } } });

const SCHEMA = { name: "strategy", schema: { type: "object", additionalProperties: false,
  required: ["name", "thesis", "universe", "market_filter", "entry", "exit", "sizing", "assumptions"],
  properties: {
    name: { type: "string" }, thesis: { type: "string" },
    universe: { type: "object", additionalProperties: false, required: ["source", "symbols", "top_n", "direction"], properties: {
      source: { type: "string", enum: ["scan", "list"] }, symbols: { type: "array", items: { type: "string" } },
      top_n: { type: "number" }, direction: { type: "string", enum: ["all", "positive", "negative"] } } },
    market_filter: { type: "array", items: cond(MARKET_FIELDS) },
    entry: { type: "array", items: cond(COIN_FIELDS) },
    exit: { type: "object", additionalProperties: false, required: ["take_profit_atr", "stop_loss_atr", "take_profit_pct", "stop_loss_pct", "max_hold_hours"], properties: {
      take_profit_atr: { type: ["number", "null"] }, stop_loss_atr: { type: ["number", "null"] },
      take_profit_pct: { type: ["number", "null"] }, stop_loss_pct: { type: ["number", "null"] }, max_hold_hours: { type: "number" } } },
    sizing: { type: "object", additionalProperties: false, required: ["pct_per_trade", "max_positions"], properties: {
      pct_per_trade: { type: "number" }, max_positions: { type: "number" } } },
    assumptions: { type: "array", items: { type: "string" } },
  } } };

const SYSTEM = `You turn one trader's plain-English crypto strategy into exact rules for a practice-trading agent. Use only these fields.
Market fields: ${Object.entries(MARKET_FIELDS).map(([k, v]) => `${k} (${v})`).join("; ")}.
Coin fields: ${Object.entries(COIN_FIELDS).map(([k, v]) => `${k} (${v})`).join("; ")}.
Rules:
1. Keep every number the trader gave exactly. Never invent a trigger; if something is missing, use a sensible default and say so in assumptions.
2. universe: "list" with 1-8 symbols if they named coins, otherwise "scan" with top_n 5-10 (direction "positive" for momentum ideas, else "all"); symbols empty for a scan.
3. Exits: if the trader gave percentages, set take_profit_pct / stop_loss_pct and leave the ATR fields null. Otherwise use multiples of the coin's ATR (daily range): default take_profit_atr 2, stop_loss_atr 1, pct fields null. max_hold_hours defaults to 72.
4. sizing: default pct_per_trade 20, max_positions 3.
5. Anything the agent cannot do (real money, shorting, leverage, a specific time of day) goes in assumptions as "Not supported: ...".
6. name is 2-4 words; thesis is one sentence explaining the idea.`;

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "strategy";

export async function compile(text, creator) {
  if (!URL || !KEY) throw new Error("Publishing needs the rules model, which isn't configured here.");
  const r = await fetch(URL, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `The strategy: """${String(text).slice(0, 800)}"""` }],
      response_format: { type: "json_schema", json_schema: { name: SCHEMA.name, strict: true, schema: SCHEMA.schema } } }) });
  const j = await r.json();
  const p = JSON.parse(j.choices?.[0]?.message?.content || "null");
  if (!p) throw new Error("The rules model didn't answer. Try again.");
  const s = {
    id: `${slug(p.name)}-${Date.now().toString(36).slice(-4)}`, name: p.name, creator: { handle: creator, demo: false }, thesis: p.thesis, source_text: text,
    universe: p.universe.source === "list" ? { source: "list", symbols: p.universe.symbols.map(x => x.toUpperCase()).slice(0, 8) } : { source: "scan", top_n: p.universe.top_n, ...(p.universe.direction !== "all" ? { direction: p.universe.direction } : {}) },
    market_filter: p.market_filter, entry: p.entry, exit: Object.fromEntries(Object.entries(p.exit).filter(([, v]) => v !== null)), sizing: p.sizing,
    follow_fee_ryochan: 5000000, stake_ryochan: 50000000,
  };
  return { strategy: s, assumptions: p.assumptions, errors: validate(s), readable: { market: s.market_filter.map(describe), entry: s.entry.map(describe) } };
}

// Would the market rules let it trade right now? Checked against the latest recorded market.
export const rightNow = (s, market) => market ? checkAll(s.market_filter, market) : null;
