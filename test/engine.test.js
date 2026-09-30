import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setup, strategy, fakeRyo, market, coin } from "./helpers.js";

const dir = setup();
const { runCycle, levels, exitReason, loadBook } = await import("../src/engine.js");
const { replay } = await import("../src/replay.js");
const decisions = () => readFileSync(join(dir, "decisions.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));

test("a coin that passes every rule is bought, with exits fixed from its ATR", async () => {
  fakeRyo({ ...market(60), analyze_token: a => coin(a.symbol, { price: 10, atr: 5 }), deep_analysis: { status: "ok", data: {} }, compare_tokens: { status: "ok", data: {} } });
  const s = strategy();
  const r = await runCycle([s]);
  const d = r.decisions.find(x => x.kind === "enter");
  assert.ok(d, "expected an entry");
  assert.equal(d.symbol, "AAA");
  assert.equal(d.take_profit, 11);      // +2 ATR of 5%
  assert.equal(d.stop_loss, 9.5);       // −1 ATR
  assert.equal(d.council.verdict, "take");   // no council model configured: the rules decide
  assert.equal(loadBook(s.id).positions.length, 1);
});

test("every recorded decision replays identically from its stored evidence", () => {
  const replayable = decisions().map(replay).filter(r => r.replayable);
  assert.ok(replayable.length > 0);
  for (const r of replayable) assert.equal(r.identical, true);
});

test("a tampered decision no longer replays identically", () => {
  const d = decisions().find(x => x.kind === "enter");
  const forged = { ...d, checks: d.checks.map(c => c.field === "rsi_14" ? { ...c, actual: 99 } : c) };
  assert.equal(replay(forged).identical, false);
});

test("a market outside the rules means standing aside, with the failing check named", async () => {
  fakeRyo({ ...market(90), analyze_token: a => coin(a.symbol) });
  const r = await runCycle([strategy({ id: "greedy-test" })]);
  const d = r.decisions.find(x => x.strategy === "greedy-test");
  assert.equal(d.kind, "stand_aside");
  assert.equal(d.checks[0].actual, 90);
  assert.equal(d.checks[0].pass, false);
});

test("exits: take-profit, stop-loss, time limit, and percent exits", () => {
  const s = strategy();
  const pos = { take_profit: 11, stop_loss: 9.5, opened_at: "2026-01-01T00:00:00Z" };
  assert.equal(exitReason(s, pos, 11.2, "2026-01-01T01:00:00Z"), "take_profit");
  assert.equal(exitReason(s, pos, 9.4, "2026-01-01T01:00:00Z"), "stop_loss");
  assert.equal(exitReason(s, pos, 10, "2026-01-04T01:00:00Z"), "time_limit");
  assert.equal(exitReason(s, pos, 10, "2026-01-01T01:00:00Z"), null);
  assert.deepEqual(levels(strategy({ exit: { take_profit_pct: 10, stop_loss_pct: 5, max_hold_hours: 24 } }), 100, 3), { take_profit: 110, stop_loss: 95 });
});

test("a price that jumps past the stop between checks is recorded as a gap", async () => {
  const s = strategy({ id: "gap-test", universe: { source: "list", symbols: ["GAP"] } });
  fakeRyo({ ...market(60), analyze_token: () => coin("GAP", { price: 10, atr: 5 }), deep_analysis: { status: "ok", data: {} }, compare_tokens: { status: "ok", data: {} } });
  await runCycle([s]);
  fakeRyo({ ...market(60), analyze_token: () => coin("GAP", { price: 7, atr: 5 }) });
  const r = await runCycle([s], { at: new Date(Date.now() + 3600e3) });
  const exit = r.decisions.find(x => x.kind === "exit");
  assert.equal(exit.reason_code, "stop_loss");
  assert.equal(exit.gap.stop, 9.5);
  assert.equal(exit.gap.filled, 7);
});
