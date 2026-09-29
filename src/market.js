// The marketplace: follow fees, their split, stakes, and following in practice.
// Fees and stakes are in RYO-CHAN. Nothing here moves tokens yet: RYO-CHAN
// staking isn't live, so stakes and fees are shown as what they would be, and
// every screen says so.

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "./evidence.js";
import { equityPoints, decisions } from "./record.js";
import { replay } from "./replay.js";

// Of each follow fee: 70% to the shishō, 30% to the RYO platform. RYONOMICS puts
// 20% of platform fee revenue into buying back and burning RYO-CHAN.
export const SPLIT = { shisho: 0.70, platform: 0.30, buyback_of_platform: 0.20 };
export const SLASH_PER_BREACH = 0.10;   // share of the stake lost for each decision that breaks the published rules

// Tips after a good trade: 90% to the shishō, 10% to RYO (and 20% of that to buyback and burn).
export const TIP_SPLIT = { shisho: 0.90, platform: 0.10, buyback_of_platform: 0.20 };
export const LIMITS = { stake: [10_000_000, 200_000_000], tip: [100_000, 100_000_000] };

export function tipSplit(amount) {
  const platform = amount * TIP_SPLIT.platform;
  const buyback = platform * TIP_SPLIT.buyback_of_platform;
  return { amount, shisho: amount * TIP_SPLIT.shisho, platform_kept: platform - buyback, buyback_and_burn: buyback };
}

export function feeSplit(fee) {
  const platform = fee * SPLIT.platform;
  const buyback = platform * SPLIT.buyback_of_platform;
  return { fee, shisho: fee * SPLIT.shisho, platform_kept: platform - buyback, buyback_and_burn: buyback };
}

// The stake is only as good as the rules it backs: every recorded decision is
// replayed from its evidence, and each one that doesn't match costs the stake.
export function stakeStatus(s) {
  const mine = decisions().filter(d => d.strategy === s.id);
  let checked = 0, breaches = 0;
  for (const d of mine) { const r = replay(d); if (!r.replayable) continue; checked++; if (!r.identical) breaches++; }
  const slashed = Math.min(1, breaches * SLASH_PER_BREACH);
  return { staked: s.stake_ryochan, checked, breaches, slashed_share: slashed, remaining: Math.round(s.stake_ryochan * (1 - slashed)), simulated: true };
}

const followsFile = () => join(DATA, "follows.json");
export const follows = () => existsSync(followsFile()) ? JSON.parse(readFileSync(followsFile(), "utf8")) : [];

export function follow(handle, strategyId, at = new Date().toISOString()) {
  const h = String(handle || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(h)) throw new Error("A handle is 3-20 letters, digits or underscores.");
  const all = follows();
  if (all.some(f => f.handle === h && f.strategy === strategyId)) return all.find(f => f.handle === h && f.strategy === strategyId);
  const f = { handle: h, strategy: strategyId, at, practice: true };
  mkdirSync(DATA, { recursive: true });
  writeFileSync(followsFile(), JSON.stringify([...all, f], null, 1));
  return f;
}

// A follower's practice result: the shishō's equity now against its equity when they followed.
export function followerReturn(f) {
  const pts = equityPoints().filter(p => p.strategy === f.strategy);
  const start = pts.filter(p => p.at <= f.at).at(-1) || pts[0];
  const now = pts.at(-1);
  return start && now ? +((now.equity / start.equity - 1) * 100).toFixed(2) : 0;
}

// The payments ledger: follow fees, tips and stakes, each signed by the payer's
// wallet where one is connected. RYO-CHAN can't move until it lists on RYO's
// DEX, so every entry is a signed promise marked "settles at RYO-CHAN launch".
const payFile = () => join(DATA, "payments.jsonl");
export const payments = () => existsSync(payFile()) ? readFileSync(payFile(), "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];

export function pay({ type, strategy, payer, amount, wallet = null, signature = null, message = null, trade = null }, s) {
  if (!["follow", "tip", "stake"].includes(type)) throw new Error("Unknown payment type.");
  const who = String(payer || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(who)) throw new Error("A handle is 3-20 letters, digits or underscores.");
  let amt = Math.round(Number(amount));
  if (type === "follow") amt = s.follow_fee_ryochan;
  const lim = LIMITS[type];
  if (lim && (!(amt >= lim[0]) || amt > lim[1])) throw new Error(`Between ${lim[0].toLocaleString()} and ${lim[1].toLocaleString()} RYO-CHAN.`);
  if (wallet && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) throw new Error("That isn't a Solana wallet address.");
  const split = type === "follow" ? feeSplit(amt) : type === "tip" ? tipSplit(amt) : { amount: amt, locked: amt };
  const entry = { type, strategy, payer: who, wallet, amount: amt, split, trade, signed: !!signature, signature, message,
    at: new Date().toISOString(), status: "promised: settles at RYO-CHAN launch" };
  mkdirSync(DATA, { recursive: true });
  appendFileSync(payFile(), JSON.stringify(entry) + "\n");
  if (type === "follow") follow(who, strategy, entry.at);
  return entry;
}

// What a shishō has earned, from the ledger.
export function earnings(id, list = payments()) {
  const mine = list.filter(p => p.strategy === id);
  const sum = (type, key) => mine.filter(p => p.type === type).reduce((a, p) => a + (p.split?.[key] ?? 0), 0);
  return { fees: sum("follow", "shisho"), tips: sum("tip", "shisho"), tip_count: mine.filter(p => p.type === "tip").length,
    paid_followers: new Set(mine.filter(p => p.type === "follow").map(p => p.payer)).size,
    to_ryo: sum("follow", "platform_kept") + sum("tip", "platform_kept"), burned: sum("follow", "buyback_and_burn") + sum("tip", "buyback_and_burn") };
}
