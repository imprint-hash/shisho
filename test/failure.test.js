import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, strategy, fakeRyo, market, coin } from "./helpers.js";

setup();
const { call, stats, reachable } = await import("../src/ryo.js");
const { runCycle } = await import("../src/engine.js");

test("a rate-limited tool is retried, then answers", async () => {
  let n = 0;
  fakeRyo({ scan_market: () => (++n < 3 ? "Rate limit exceeded (6/min for mcp_fanout). Retry after the window resets." : { status: "ok", data: { candidates: [] } }) });
  const r = await call("scan_market", { top_n: 3 });
  assert.equal(r.status, "ok");
  assert.equal(r.attempts, 3);
  assert.ok(stats.rate_limited >= 2);
});

test("a server error is retried with backoff", async () => {
  let n = 0;
  fakeRyo({ analyze_token: () => (++n < 2 ? new Response("busy", { status: 503 }) : coin("AAA")) });
  const r = await call("analyze_token", { symbol: "AAA" });
  assert.equal(r.status, "ok");
  assert.equal(r.attempts, 2);
});

test("a dead network gives an honest 'unavailable', never a made-up answer", async () => {
  fakeRyo({ analyze_token: () => new TypeError("fetch failed") });
  const r = await call("analyze_token", { symbol: "AAA" });
  assert.equal(r.status, "unavailable");
  assert.equal(r.data, null);
  assert.match(r.reason, /fetch failed/);
});

test("reachable() reports a missing network, so the cycle can wait", async () => {
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  assert.equal(await reachable(), false);
});

test("when a market tool is down, a strategy that needs it stands aside and says why", async () => {
  fakeRyo({ market_overview: new Response("down", { status: 502 }), monitor_market_sentiment_shift: new Response("down", { status: 502 }), analyze_token: a => coin(a.symbol) });
  const r = await runCycle([strategy({ id: "outage-test" })]);
  const d = r.decisions.find(x => x.strategy === "outage-test");
  assert.equal(d.kind, "stand_aside");
  assert.match(d.reason, /unavailable/);
  assert.equal(d.checks[0].missing, true);
});

test("a coin RYO can't price is held unmarked, not closed at a guess", async () => {
  const s = strategy({ id: "unmarked-test", universe: { source: "list", symbols: ["AAA"] } });
  fakeRyo({ ...market(60), analyze_token: () => coin("AAA"), deep_analysis: { status: "ok", data: {} }, compare_tokens: { status: "ok", data: {} } });
  await runCycle([s]);
  fakeRyo({ ...market(60), analyze_token: () => new TypeError("fetch failed") });
  const r = await runCycle([s]);
  assert.ok(r.decisions.some(d => d.kind === "unmarked"));
  assert.ok(!r.decisions.some(d => d.kind === "exit"));
});
