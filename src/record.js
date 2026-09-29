// A shishō's practice record, computed from its book and its decisions only.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "./evidence.js";
import { loadBook, equity, START_BOOK } from "./engine.js";

const lines = f => existsSync(join(DATA, f)) ? readFileSync(join(DATA, f), "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];
export const decisions = () => lines("decisions.jsonl");
export const equityPoints = () => lines("equity.jsonl");

export function record(id) {
  const b = loadBook(id);
  const eq = equity(b);
  const closed = b.closed;
  const wins = closed.filter(c => c.pnl_usd > 0).length;
  const curve = equityPoints().filter(p => p.strategy === id).map(p => [p.at, p.equity]);
  let peak = START_BOOK, maxDd = 0;
  for (const [, v] of curve) { peak = Math.max(peak, v); maxDd = Math.max(maxDd, (peak - v) / peak * 100); }
  return {
    equity: eq, return_pct: +((eq / START_BOOK - 1) * 100).toFixed(2), started_at: b.started_at, cycles: b.cycles,
    trades: closed.length + b.positions.length, closed: closed.length, open: b.positions.length,
    win_rate: closed.length ? +(wins / closed.length * 100).toFixed(0) : null,
    max_drawdown_pct: +maxDd.toFixed(2), positions: b.positions, closed_trades: closed.slice(-20), curve,
  };
}
