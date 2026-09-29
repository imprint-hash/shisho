// What the website reads. Everything comes from the recorded books, decisions
// and evidence; nothing is computed on the page that the agent didn't record.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "./evidence.js";
import { loadStrategies } from "./strategies.js";
import { record, decisions } from "./record.js";
import { feeSplit, tipSplit, stakeStatus, follows, followerReturn, earnings, payments, LIMITS } from "./market.js";
import { replay } from "./replay.js";
import { describe, showValue } from "./strategy.js";
import { plainNote } from "./note.js";

const latest = () => existsSync(join(DATA, "latest.json")) ? JSON.parse(readFileSync(join(DATA, "latest.json"), "utf8")) : null;
const exitText = x => `take profit ${x.take_profit_pct != null ? `+${x.take_profit_pct}%` : `+${x.take_profit_atr} ATR`}, stop ${x.stop_loss_pct != null ? `−${x.stop_loss_pct}%` : `−${x.stop_loss_atr} ATR`}, ${x.max_hold_hours}h max`;
const rulesText = s => ({ market: (s.market_filter || []).map(describe), entry: s.entry.map(describe), exit: s.exit, exit_text: exitText(s.exit), sizing: s.sizing });

function card(s, all, fl) {
  const r = record(s.id);
  const last = all.filter(d => d.strategy === s.id).at(-1) || null;
  const week = r.curve.filter(([at]) => Date.parse(at) >= Date.now() - 7 * 86400000);
  return {
    id: s.id, name: s.name, creator: s.creator, thesis: s.thesis, rules: rulesText(s), universe: s.universe,
    return_pct: r.return_pct, trades: r.trades, open: r.open, win_rate: r.win_rate, max_drawdown_pct: r.max_drawdown_pct,
    started_at: r.started_at, cycles: r.cycles, spark: week.map(([, v]) => v),
    followers: fl.filter(f => f.strategy === s.id).length,
    fee: feeSplit(s.follow_fee_ryochan), stake: stakeStatus(s), earnings: earnings(s.id),
    get rules_kept() { return { checked: this.stake.checked, kept: this.stake.checked - this.stake.breaches }; },
    state: last?.kind || "new", last_at: last?.at || null, last_note: last?.note?.text || null,
  };
}

// What changed in the latest cycle, most important first: money moved (sold,
// bought, vetoed) before a shishō that changed its stance, before no change.
const RANK = { exit: 0, enter: 1, vetoed: 2, unmarked: 3, no_candidates: 3, stand_aside: 4, no_entry: 5, full: 6 };
function changes(all, strategies) {
  const cycles = [...new Set(all.map(d => d.at))].sort();
  const now = cycles.at(-1), before = cycles.at(-2);
  if (!now) return { at: null, items: [], quiet: [] };
  const byId = Object.fromEntries(strategies.map(s => [s.id, s]));
  const items = [], quiet = [];
  for (const s of strategies) {
    const mine = all.filter(d => d.strategy === s.id && d.at === now);
    const prev = all.filter(d => d.strategy === s.id && d.at === before).map(d => d.kind);
    for (const d of mine) {
      const changed = !prev.includes(d.kind) || ["exit", "enter", "vetoed"].includes(d.kind);
      const row = { strategy: s.id, name: s.name, kind: d.kind, symbol: d.symbol || null, at: d.at, rank: RANK[d.kind] ?? 7,
        text: d.note?.text || plainNote(byId[s.id], d), pnl_pct: d.pnl_pct ?? null, council: d.council?.verdict || null, was: prev[0] || null };
      (changed ? items : quiet).push(row);
    }
  }
  items.sort((a, b) => a.rank - b.rank);
  return { at: now, items, quiet };
}

export function state() {
  const all = decisions(), fl = follows(), strategies = loadStrategies();
  return { updated_at: latest()?.at || null, market: latest()?.market || null, changes: changes(all, strategies), shisho: strategies.map(s => card(s, all, fl)) };
}

export function shisho(id) {
  const s = loadStrategies().find(x => x.id === id);
  if (!s) return null;
  const all = decisions(), fl = follows();
  const mine = all.filter(d => d.strategy === id);
  const recent = mine.slice(-40).reverse().map(d => ({ ...d,
    checks: (d.checks || []).map(c => ({ ...c, text: describe(c), shown: showValue(c.field, c.actual) })),
    note: d.note || { text: plainNote(s, d), by: "template" },
    replay: ["enter", "exit", "stand_aside"].includes(d.kind) ? replay(d) : null }));
  return { ...card(s, all, fl), record: record(id), decisions: recent,
    followers: fl.filter(f => f.strategy === id).map(f => ({ handle: f.handle, since: f.at, return_pct: followerReturn(f) })),
    tip_split: tipSplit(1_000_000), limits: LIMITS,
    ledger: payments().filter(p => p.strategy === id).slice(-12).reverse().map(({ signature, message, ...p }) => ({ ...p, signature: signature ? signature.slice(0, 12) + "…" : null })) };
}
