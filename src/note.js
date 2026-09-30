// The plain-English note on each decision. Code has already decided; a model
// only explains it for people. Any OpenAI-compatible endpoint works
// (SHISHO_LLM_URL, SHISHO_LLM_KEY, SHISHO_LLM_MODEL). Every number the model
// writes is checked against the decision's own values; a note with a number
// that isn't there is thrown away and a plain template note is used instead.

import { describe, showValue } from "./strategy.js";

const URL = process.env.SHISHO_LLM_URL;
const KEY = process.env.SHISHO_LLM_KEY;
const MODEL = process.env.SHISHO_LLM_MODEL || "gpt-6-luna";

const fmt = v => typeof v === "number" ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : String(+v.toFixed(4))) : String(v);

// The template: always available, always true.
export function plainNote(s, d) {
  const passed = (d.checks || []).filter(c => c.pass), failed = (d.checks || []).filter(c => !c.pass);
  switch (d.kind) {
    case "enter": return `Bought ${d.symbol} at $${fmt(d.price)} with ${s.sizing.pct_per_trade}% of the practice book: ${passed.map(c => `${describe(c)} (${showValue(c.field, c.actual)})`).join("; ")}. Take-profit $${fmt(d.take_profit)}, stop $${fmt(d.stop_loss)}.`;
    case "vetoed": return `The rules allowed ${d.symbol}, but the council said skip: ${d.council?.reason || ""}`;
    case "exit": return `Sold ${d.symbol} at $${fmt(d.price)} (${d.reason_code.replace("_", " ")}), ${d.pnl_pct >= 0 ? "+" : ""}${fmt(d.pnl_pct)}% on the practice trade.${d.gap ? ` The price had jumped past the $${fmt(d.gap.stop)} stop in the ${fmt(d.gap.hours_since_last_mark)} hours since the last check, so the stop filled at the first price seen.` : ""}`;
    case "stand_aside": return `Standing aside: ${failed.map(c => c.missing ? `${describe(c)} (no data)` : `${describe(c)}, but it is ${showValue(c.field, c.actual)}`).join("; ")}.`;
    case "no_entry": return d.reason;
    default: return d.reason || "";
  }
}

// Numbers a note may use: everything in the decision, written the ways people write it.
function allowed(d, s) {
  const set = new Set();
  const add = v => { if (typeof v !== "number") return; const a = Math.abs(v); for (const x of [a, +a.toFixed(0), +a.toFixed(1), +a.toFixed(2), +a.toFixed(4)]) set.add(String(x)); };
  const shown = (d.checks || []).map(c => [describe(c), showValue(c.field, c.actual)]);
  JSON.stringify({ d, shown, sizing: s.sizing, exit: s.exit }).match(/-?\d+(\.\d+)?(e-?\d+)?/g)?.forEach(n => add(Number(n)));
  return set;
}
export const unconfirmed = (text, d, s) => {
  const ok = allowed(d, s);
  return (text.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(\.\d+)?/g) || []).filter(n => !ok.has(String(Number(n))));
};

const SYSTEM = `You explain one practice-trading decision to a beginner, in two short plain sentences. The decision was already made by code from the listed checks; explain why, using the strategy's idea and the checks that mattered. Only use numbers that appear in the input, written the same way. No advice, no predictions, no hype.`;

export async function llmNote(s, d, marketFacts) {
  const fallback = { text: plainNote(s, d), by: "template" };
  if (!URL || !KEY) return fallback;
  const input = { strategy: { name: s.name, idea: s.thesis }, decision: { kind: d.kind, symbol: d.symbol, price: d.price, take_profit: d.take_profit, stop_loss: d.stop_loss, pnl_pct: d.pnl_pct, reason: d.reason_code || d.reason,
    checks: (d.checks || []).map(c => ({ rule: describe(c), actual: showValue(c.field, c.actual), passed: c.pass })) } };
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
    const r = await fetch(URL, { method: "POST", signal: ctl.signal, headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(input) }] }) });
    clearTimeout(t);
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content?.trim();
    if (!text || text.length < 40 || /can.?t (share|help)|cannot (share|help)/i.test(text)) return fallback;
    const bad = unconfirmed(text, d, s);
    return bad.length ? { ...fallback, rejected: { text, numbers_not_in_evidence: bad } } : { text, by: MODEL };
  } catch { return fallback; }
}
