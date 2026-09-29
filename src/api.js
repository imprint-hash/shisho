// What the website reads. Everything comes from the recorded books, decisions
// and evidence; nothing is computed on the page that the agent didn't record.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "./evidence.js";
import { loadStrategies } from "./strategies.js";
import { record, decisions } from "./record.js";
import { feeSplit, stakeStatus, follows, followerReturn } from "./market.js";
import { replay } from "./replay.js";
import { describe, showValue } from "./strategy.js";
import { plainNote } from "./note.js";

const latest = () => existsSync(join(DATA, "latest.json")) ? JSON.parse(readFileSync(join(DATA, "latest.json"), "utf8")) : null;
const rulesText = s => ({ market: (s.market_filter || []).map(describe), entry: s.entry.map(describe), exit: s.exit, sizing: s.sizing });

function card(s, all, fl) {
  const r = record(s.id);
  const last = all.filter(d => d.strategy === s.id).at(-1) || null;
  const week = r.curve.filter(([at]) => Date.parse(at) >= Date.now() - 7 * 86400000);
  return {
    id: s.id, name: s.name, creator: s.creator, thesis: s.thesis, rules: rulesText(s), universe: s.universe,
    return_pct: r.return_pct, trades: r.trades, open: r.open, win_rate: r.win_rate, max_drawdown_pct: r.max_drawdown_pct,
    started_at: r.started_at, cycles: r.cycles, spark: week.map(([, v]) => v),
    followers: fl.filter(f => f.strategy === s.id).length,
    fee: feeSplit(s.follow_fee_ryochan), stake: stakeStatus(s),
    state: last?.kind || "new", last_at: last?.at || null, last_note: last?.note?.text || null,
  };
}

export function state() {
  const all = decisions(), fl = follows();
  return { updated_at: latest()?.at || null, market: latest()?.market || null, shisho: loadStrategies().map(s => card(s, all, fl)) };
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
    followers: fl.filter(f => f.strategy === id).map(f => ({ handle: f.handle, since: f.at, return_pct: followerReturn(f) })) };
}
