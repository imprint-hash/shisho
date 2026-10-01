// The council: when a coin passes a shishō's rules, three agents look at it
// before any practice money moves. A Bull argues for the trade and a Bear
// argues against it, from the same evidence: the rule checks plus RYO's deep
// analysis (confluence, catalysts, risks, derivatives) and a side-by-side
// comparison with Bitcoin. A Judge weighs both and says take, half or skip.
//
// The Judge may only reduce risk: the rules already allowed the trade, so the
// council can shrink or veto it, never enlarge it. Every number any agent
// writes must appear in the evidence it was given; an argument that invents a
// number is struck out. The whole debate is stored as evidence, so a replay
// rebuilds the same decision without calling any model.

import { store } from "./evidence.js";
import { unconfirmed } from "./note.js";
import { showValue, describe } from "./strategy.js";

const URL = process.env.SHISHO_LLM_URL;
const KEY = process.env.SHISHO_LLM_KEY;
const MODEL = process.env.SHISHO_LLM_MODEL || "openai/gpt-oss-120b";

export const SIZE = { take: 1, half: 0.5, skip: 0 };

async function ask(system, input, schema) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(URL, { method: "POST", signal: ctl.signal, headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(input) }],
        response_format: { type: "json_schema", json_schema: { name: schema.name, strict: true, schema: schema.schema } } }) });
    const j = await r.json();
    return JSON.parse(j.choices?.[0]?.message?.content || "null");
  } finally { clearTimeout(t); }
}

const ARGUMENT = { name: "argument", schema: { type: "object", additionalProperties: false, required: ["points"], properties: { points: { type: "array", items: { type: "string" } } } } };
const VERDICT = { name: "verdict", schema: { type: "object", additionalProperties: false, required: ["verdict", "reason"], properties: { verdict: { type: "string", enum: ["take", "half", "skip"] }, reason: { type: "string" } } } };

const BULL = `You are the Bull on a trading council. A coin has passed a strategy's rules for a practice trade. Using only the evidence given, make the strongest honest case FOR taking the trade, in at most three short points. Use only numbers that appear in the evidence, written the same way. No predictions of price, no hype.`;
const BEAR = `You are the Bear on a trading council. A coin has passed a strategy's rules for a practice trade. Using only the evidence given, make the strongest honest case AGAINST it: risks, weak confluence, crowded derivatives, a coin that is lagging Bitcoin, anything the rules don't see. At most three short points. Use only numbers that appear in the evidence, written the same way.`;
const JUDGE = `You are the Judge on a trading council. The strategy's rules already allow this practice trade. Weigh the Bull and the Bear on the evidence and decide: "take" (full size), "half" (half size: real doubts but the case still stands), or "skip" (the Bear shows a concrete risk the rules miss). Default to "take" unless the Bear's points are specific and backed by the evidence. Give the reason in one plain sentence a beginner understands, using only numbers from the evidence.`;

// The evidence the council sees, trimmed to what matters and already in plain units.
export function brief(s, d, facts, deep, cmp) {
  const dd = deep?.status === "ok" ? deep.data : null;
  const cc = cmp?.status === "ok" ? cmp.data : null;
  return {
    strategy: { name: s.name, idea: s.thesis },
    coin: d.symbol,
    rules_passed: d.checks.filter(c => c.pass).map(c => `${describe(c)}: ${showValue(c.field, c.actual)}`),
    deep_analysis: dd ? {
      verdict: dd.verdict ?? null, confluence: dd.confluence ? { state: dd.confluence.state, score: dd.confluence.score } : null,
      catalysts: dd.intelligence?.catalysts || [], risks: dd.intelligence?.risks || [],
      derivatives: dd.derivatives?.status === "ok" ? dd.derivatives : null,
    } : "unavailable",
    compared_with_bitcoin: cc ? { pick: cc.overall_pick ?? cc.pick ?? null, rationale: cc.rationale ?? null, tokens: (cc.tokens || []).map(t => ({ symbol: t.symbol, change_7d_pct: t.changes?.d7 != null ? +t.changes.d7.toFixed(2) : null, rsi_14: t.metrics?.rsi_14 ?? null, atr_14_pct: t.metrics?.atr_14_pct ?? null, verdict: t.verdict })) } : "unavailable",
  };
}

// Strike any point that quotes a number the evidence doesn't contain.
function clean(points, ev) {
  const fake = { checks: [], ev };
  return (points || []).slice(0, 3).map(p => ({ text: p, struck: unconfirmed(p, fake, { sizing: {}, exit: {} }).length > 0 }));
}

// Returns { verdict, size, reason, bull, bear, by, evidence } and stores the whole debate.
export async function council(s, d, cycle, facts) {
  const [deep, cmp] = await Promise.all([
    cycle.get("deep_analysis", { symbol: d.symbol, include_perp: true }),
    d.symbol === "BTC" ? Promise.resolve({ result: { status: "skipped" }, id: null }) : cycle.get("compare_tokens", { symbols: `${d.symbol}, BTC`, intent: "swing" }),
  ]);
  const ev = brief(s, d, facts, deep.result, cmp.result);
  const sources = [deep.id, cmp.id].filter(Boolean);
  let out;
  if (!URL || !KEY) out = { verdict: "take", reason: "No council model is configured, so the rules alone decide.", bull: [], bear: [], by: "rules" };
  else {
    try {
      const [bull, bear] = await Promise.all([ask(BULL, ev, ARGUMENT), ask(BEAR, ev, ARGUMENT)]);
      const b1 = clean(bull?.points, ev), b2 = clean(bear?.points, ev);
      const judged = await ask(JUDGE, { evidence: ev, bull: b1.filter(p => !p.struck).map(p => p.text), bear: b2.filter(p => !p.struck).map(p => p.text) }, VERDICT);
      const ok = judged && SIZE[judged.verdict] !== undefined && !unconfirmed(judged.reason || "", { checks: [], ev }, { sizing: {}, exit: {} }).length;
      out = ok ? { verdict: judged.verdict, reason: judged.reason, bull: b1, bear: b2, by: MODEL }
        : { verdict: "take", reason: "The judge's answer didn't hold up against the evidence, so the rules alone decide.", bull: b1, bear: b2, by: "rules" };
    } catch {
      out = { verdict: "take", reason: "The council couldn't be reached this hour, so the rules alone decide.", bull: [], bear: [], by: "rules" };
    }
  }
  out.size = SIZE[out.verdict];
  out.brief = ev;
  out.evidence = store({ council: out, sources });   // the debate itself is evidence, for replay
  out.sources = sources;
  return out;
}
