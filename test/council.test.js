import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, strategy, fakeRyo, market, coin } from "./helpers.js";

setup();
process.env.SHISHO_LLM_URL = "https://llm.test/v1/chat/completions";
process.env.SHISHO_LLM_KEY = "test";
const { council, SIZE } = await import("../src/council.js");
const { Cycle } = await import("../src/evidence.js");

// A fake model: the Bull and Bear argue, the Judge rules as told.
function models(judge, bear = "RSI is 61.5, but a +12.53% day adds reversal risk.") {
  const ryo = fakeRyo({ ...market(60), analyze_token: a => coin(a.symbol), deep_analysis: { status: "ok", data: { verdict: "neutral", intelligence: { risks: ["High volatility"] } } }, compare_tokens: { status: "ok", data: { tokens: [] } } });
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (!String(url).includes("llm.test")) return real(url, opts);
    const sys = JSON.parse(opts.body).messages[0].content;
    const content = sys.includes("the Judge") ? judge : sys.includes("the Bull") ? { points: ["Trend is up and RSI is 61.5."] } : { points: [bear] };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
  };
  return ryo;
}
const draft = { symbol: "AAA", checks: [{ field: "rsi_14", op: ">=", value: 50, actual: 61.5, pass: true }, { field: "change_24h_pct", op: ">", value: 1, actual: 12.53, pass: true }] };

test("the Judge can only shrink or veto: take, half and skip map to 1, 0.5 and 0", async () => {
  assert.deepEqual(SIZE, { take: 1, half: 0.5, skip: 0 });
  for (const [verdict, size] of [["take", 1], ["half", 0.5], ["skip", 0]]) {
    models({ verdict, reason: "RSI is 61.5 and the day was +12.53%." });
    const c = await council(strategy(), draft, new Cycle(), {});
    assert.equal(c.verdict, verdict); assert.equal(c.size, size);
  }
});

test("a Judge who invents a number is overruled by the rules", async () => {
  models({ verdict: "skip", reason: "It will fall 80% tomorrow." });
  const c = await council(strategy(), draft, new Cycle(), {});
  assert.equal(c.verdict, "take"); assert.equal(c.by, "rules");
});

test("an argument with an invented number is struck out", async () => {
  models({ verdict: "take", reason: "RSI is 61.5." }, "Whales will dump 45% of supply.");
  const c = await council(strategy(), draft, new Cycle(), {});
  assert.equal(c.bear[0].struck, true);
});

test("the whole debate is stored as evidence for replay", async () => {
  models({ verdict: "half", reason: "RSI is 61.5." });
  const c = await council(strategy(), draft, new Cycle(), {});
  const { load } = await import("../src/evidence.js");
  assert.equal(load(c.evidence).council.verdict, "half");
});
