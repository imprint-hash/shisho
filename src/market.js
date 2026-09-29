// The marketplace: follow fees, their split, stakes, and following in practice.
// Fees and stakes are in RYO-CHAN. Nothing here moves tokens yet: RYO-CHAN
// staking isn't live, so stakes and fees are shown as what they would be, and
// every screen says so.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "./evidence.js";
import { equityPoints, decisions } from "./record.js";
import { replay } from "./replay.js";

// Of each follow fee: 70% to the shishō, 30% to the RYO platform. RYONOMICS puts
// 20% of platform fee revenue into buying back and burning RYO-CHAN.
export const SPLIT = { shisho: 0.70, platform: 0.30, buyback_of_platform: 0.20 };
export const SLASH_PER_BREACH = 0.10;   // share of the stake lost for each decision that breaks the published rules

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
