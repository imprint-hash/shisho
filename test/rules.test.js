import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, strategy } from "./helpers.js";

setup();
const { check, checkAll, validate, describe } = await import("../src/strategy.js");
const { canonical } = await import("../src/evidence.js");
const { unconfirmed, plainNote } = await import("../src/note.js");
const { feeSplit, tipSplit, pay } = await import("../src/market.js");

test("rules compare real fields and treat missing data as a fail", () => {
  assert.equal(check({ field: "rsi_14", op: ">=", value: 50 }, { rsi_14: 61 }).pass, true);
  assert.equal(check({ field: "trend", op: "in", value: ["up"] }, { trend: "down" }).pass, false);
  const m = check({ field: "fear_greed", op: "<=", value: 75 }, { fear_greed: null });
  assert.equal(m.pass, false); assert.equal(m.missing, true);
  assert.equal(checkAll([], {}).pass, true);
});

test("validation refuses unknown fields, missing exits and oversized trades", () => {
  assert.deepEqual(validate(strategy()), []);
  assert.ok(validate(strategy({ entry: [{ field: "moon_score", op: ">", value: 1 }] })).length);
  assert.ok(validate(strategy({ exit: { max_hold_hours: 10 } })).length);
  assert.ok(validate(strategy({ sizing: { pct_per_trade: 90, max_positions: 1 } })).length);
  assert.deepEqual(validate(strategy({ exit: { take_profit_pct: 10, stop_loss_pct: 5, max_hold_hours: 24 } })), []);
});

test("rules read as plain words", () => {
  assert.equal(describe({ field: "fear_greed", op: "<=", value: 75 }), "Fear & Greed at most 75");
  assert.equal(describe({ field: "established_asset", op: "==", value: true }), "Established coin");
  assert.equal(describe({ field: "change_24h_pct", op: ">", value: 1 }), "24h change above +1%");
});

test("canonical JSON is stable whatever the key order, so fingerprints are too", () => {
  assert.equal(canonical({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } }), canonical({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }));
});

test("a note that invents a number is caught", () => {
  const d = { kind: "enter", symbol: "AAA", price: 10, checks: [{ field: "rsi_14", op: ">=", value: 50, actual: 61.5, pass: true }] };
  const s = strategy();
  assert.deepEqual(unconfirmed("RSI was 61.5, above 50.", d, s), []);
  assert.deepEqual(unconfirmed("RSI was 61.5 and it will rise 40%.", d, s), ["40"]);
  assert.match(plainNote(s, { ...d, take_profit: 11, stop_loss: 9.5 }), /Bought AAA/);
});

test("fee and tip splits add up, and 20% of RYO's share is burned", () => {
  const f = feeSplit(5_000_000);
  assert.equal(f.shisho + f.platform_kept + f.buyback_and_burn, 5_000_000);
  assert.equal(f.buyback_and_burn, 300_000);
  const t = tipSplit(1_000_000);
  assert.equal(t.shisho, 900_000);
  assert.equal(t.shisho + t.platform_kept + t.buyback_and_burn, 1_000_000);
});

test("payments reject bad handles, bad wallets and out-of-range amounts", () => {
  const s = strategy();
  assert.throws(() => pay({ type: "tip", strategy: s.id, payer: "x", amount: 1_000_000 }, s));
  assert.throws(() => pay({ type: "tip", strategy: s.id, payer: "tester_1", amount: 5 }, s));
  assert.throws(() => pay({ type: "tip", strategy: s.id, payer: "tester_1", amount: 1_000_000, wallet: "not-a-wallet" }, s));
  assert.throws(() => pay({ type: "stake", strategy: s.id, payer: "tester_1", amount: 1 }, s));
  const ok = pay({ type: "follow", strategy: s.id, payer: "tester_1", amount: 1 }, s);
  assert.equal(ok.amount, 5_000_000);           // a follow always costs the listed fee
  assert.match(ok.status, /settles at RYO-CHAN launch/);
});
