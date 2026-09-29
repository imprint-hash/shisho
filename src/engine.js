// The agent. Each cycle it reads the market once through RYO's tools, then for
// every strategy: marks open practice positions and closes them at the
// strategy's own take-profit, stop-loss or time limit; checks the market rules;
// and, if the market allows, checks each candidate coin against the entry
// rules and opens at most one practice position. Code makes every decision from
// the stored evidence; a model only writes the plain-English note afterwards.

import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Cycle, marketFacts, coinFacts, DATA, store } from "./evidence.js";
import { checkAll } from "./strategy.js";
import { council } from "./council.js";

const MAX_COUNCILS = 2;   // councils per strategy per cycle: each uses RYO's slower fan-out tools

export const START_BOOK = 10000;          // practice USD every strategy starts with
const MAX_ANALYSES = Number(process.env.SHISHO_MAX_ANALYSES || 5);   // candidates examined per strategy per cycle

const bookFile = id => join(DATA, "books", `${id}.json`);
export function loadBook(id) {
  return existsSync(bookFile(id)) ? JSON.parse(readFileSync(bookFile(id), "utf8"))
    : { strategy: id, cash: START_BOOK, positions: [], closed: [], started_at: null, cycles: 0 };
}
function saveBook(b) { mkdirSync(join(DATA, "books"), { recursive: true }); writeFileSync(bookFile(b.strategy), JSON.stringify(b, null, 1)); }

function record(d) {
  mkdirSync(DATA, { recursive: true });
  appendFileSync(join(DATA, "decisions.jsonl"), JSON.stringify(d) + "\n");
  return d;
}

export const equity = b => round(b.cash + b.positions.reduce((a, p) => a + p.units * (p.last_price ?? p.entry_price), 0), 2);

const hoursBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 3600000;
const round = (v, d = 6) => +v.toFixed(d);

// Where a position closes, fixed at entry from the ATR the evidence showed then.
// A strategy sets exits either in ATRs (the coin's normal daily range) or in plain percent.
export const levels = (s, entryPrice, atrPct) => ({
  take_profit: round(entryPrice * (1 + (s.exit.take_profit_pct ?? s.exit.take_profit_atr * atrPct) / 100)),
  stop_loss: round(entryPrice * (1 - (s.exit.stop_loss_pct ?? s.exit.stop_loss_atr * atrPct) / 100)),
});

export function exitReason(s, pos, price, at) {
  if (price >= pos.take_profit) return "take_profit";
  if (price <= pos.stop_loss) return "stop_loss";
  if (hoursBetween(pos.opened_at, at) >= s.exit.max_hold_hours) return "time_limit";
  return null;
}

async function scanRows(s, cycle) {
  const u = s.universe;
  if (u.source === "list") return { rows: u.symbols.map(symbol => ({ symbol })), id: null, status: "ok" };
  const args = { top_n: u.top_n || 5 };
  if (u.chain) args.chain = u.chain;
  if (u.theme) args.theme = u.theme;
  if (u.direction) args.filter_direction = u.direction;
  const { result, id } = await cycle.get("scan_market", args);
  return { rows: result.status === "ok" ? result.data?.candidates || [] : [], id, status: result.status, reason: result.reason };
}

export async function runStrategy(s, cycle, market, note = null) {
  const book = loadBook(s.id);
  book.started_at ??= cycle.at;
  book.cycles += 1;
  const out = [];
  // The exact rulebook this decision was made under, stored like any other evidence.
  const base = { strategy: s.id, strategy_version: store(s), at: cycle.at };

  // 1. Open positions: mark, and close at the strategy's own levels.
  for (const pos of [...book.positions]) {
    const { result, id } = await cycle.get("analyze_token", { symbol: pos.symbol });
    const f = coinFacts(null, result);
    if (f.price_usd == null) {
      out.push(({ ...base, kind: "unmarked", symbol: pos.symbol, evidence: [id], reason: `RYO couldn't price ${pos.symbol} this cycle (${result.status}${result.reason ? `: ${result.reason}` : ""}), so the position stays open unmarked.` }));
      continue;
    }
    pos.last_price = f.price_usd; pos.last_marked_at = cycle.at;
    const why = exitReason(s, pos, f.price_usd, cycle.at);
    if (!why) continue;
    const proceeds = pos.units * f.price_usd;
    book.cash = round(book.cash + proceeds, 2);
    book.positions = book.positions.filter(p => p !== pos);
    const closed = { ...pos, closed_at: cycle.at, exit_price: f.price_usd, exit_reason: why, pnl_usd: round(proceeds - pos.cost_usd, 2), pnl_pct: round((f.price_usd / pos.entry_price - 1) * 100, 2), exit_evidence: id };
    book.closed.push(closed);
    out.push(({ ...base, kind: "exit", symbol: pos.symbol, reason_code: why, price: f.price_usd, entry_price: pos.entry_price,
      checks: [{ field: "price_usd", op: why === "take_profit" ? ">=" : "<=", value: why === "take_profit" ? pos.take_profit : pos.stop_loss, actual: f.price_usd, pass: why !== "time_limit" }, ...(why === "time_limit" ? [{ field: "hours_held", op: ">=", value: s.exit.max_hold_hours, actual: round(hoursBetween(pos.opened_at, cycle.at), 1), pass: true }] : [])],
      pnl_pct: closed.pnl_pct, take_profit: pos.take_profit, stop_loss: pos.stop_loss, opened_at: pos.opened_at, evidence: [id], coin_evidence: id }));
  }

  // 2. Is the market one this strategy trades in?
  const m = checkAll(s.market_filter, market.facts);
  if (!m.pass) {
    out.push(({ ...base, kind: "stand_aside", checks: m.results, evidence: market.evidence, market_evidence: market.evidence,
      reason: m.results.some(r => r.missing) ? "Some market evidence was unavailable, so the strategy stands aside rather than guess." : "The market doesn't match this strategy's rules." }));
    return finish();
  }
  if (book.positions.length >= s.sizing.max_positions) {
    out.push(({ ...base, kind: "full", evidence: market.evidence, reason: `Already holding ${book.positions.length} of ${s.sizing.max_positions} positions.` }));
    return finish();
  }

  // 3. Candidates, in RYO's order, against the entry rules. At most one entry per cycle.
  const scan = await scanRows(s, cycle);
  if (scan.status !== "ok") {
    out.push(({ ...base, kind: "no_candidates", evidence: [...market.evidence, scan.id].filter(Boolean), reason: `RYO's market scan was unavailable (${scan.reason || scan.status}), so nothing was bought.` }));
    return finish();
  }
  const held = new Set(book.positions.map(p => p.symbol));
  const looked = [];
  let councils = 0;
  for (const row of scan.rows.filter(r => !held.has(r.symbol)).slice(0, MAX_ANALYSES)) {
    const { result, id } = await cycle.get("analyze_token", { symbol: row.symbol });
    const f = coinFacts(row, result);
    const e = checkAll(s.entry, f);
    looked.push({ symbol: row.symbol, pass: e.pass, checks: e.results, evidence: id, status: result.status });
    if (!e.pass) continue;
    if (f.price_usd == null || f.atr_14_pct == null) continue;   // can't size exits without a real ATR
    if (councils >= MAX_COUNCILS) break;
    councils++;
    // The rules allow it. Now the council weighs it: it can only shrink or veto the trade.
    const draft = { symbol: row.symbol, checks: [...m.results, ...e.results] };
    const c = await council(s, draft, cycle, market.facts);
    const councilRecord = { verdict: c.verdict, size: c.size, reason: c.reason, by: c.by, bull: c.bull, bear: c.bear, evidence: c.evidence, sources: c.sources };
    const common = { symbol: row.symbol, price: f.price_usd, checks: draft.checks, evidence: [...market.evidence, scan.id, id, ...c.sources, c.evidence].filter(Boolean),
      market_evidence: market.evidence, scan_evidence: scan.id, coin_evidence: id, council: councilRecord };
    if (c.size === 0) { out.push(({ ...base, kind: "vetoed", ...common })); continue; }
    const cost = round(book.cash * s.sizing.pct_per_trade / 100 * c.size, 2);
    if (cost < 1) break;
    const pos = { symbol: row.symbol, opened_at: cycle.at, entry_price: f.price_usd, atr_at_entry_pct: f.atr_14_pct, units: round(cost / f.price_usd, 10), cost_usd: cost, ...levels(s, f.price_usd, f.atr_14_pct), last_price: f.price_usd, last_marked_at: cycle.at, entry_evidence: id, council: c.verdict };
    book.cash = round(book.cash - cost, 2);
    book.positions.push(pos);
    out.push(({ ...base, kind: "enter", ...common, cost_usd: cost, take_profit: pos.take_profit, stop_loss: pos.stop_loss, looked: looked.map(({ checks, ...x }) => x) }));
    return finish();
  }
  out.push(({ ...base, kind: "no_entry", evidence: [...market.evidence, scan.id].filter(Boolean), scan_evidence: scan.id, looked,
    reason: looked.length ? `None of the ${looked.length} coins checked met every entry rule.` : "RYO's scan returned no new coins to check." }));
  return finish();

  async function finish() {
    saveBook(book);
    // One point on the equity curve per cycle, marked at the prices RYO gave this cycle.
    appendFileSync(join(DATA, "equity.jsonl"), JSON.stringify({ strategy: s.id, at: cycle.at, equity: equity(book), open: book.positions.length }) + "\n");
    if (note) for (const d of out) if (["enter", "exit", "stand_aside", "no_entry", "vetoed"].includes(d.kind)) {
      try { d.note = await note(s, d, market.facts); } catch { /* the note is optional; the decision stands without it */ }
    }
    return out.map(record);
  }
}

// One full cycle over every strategy.
export async function runCycle(strategies, { at = new Date(), note = null } = {}) {
  const cycle = new Cycle(at);
  const [ov, se] = await Promise.all([cycle.get("market_overview"), cycle.get("monitor_market_sentiment_shift")]);
  const market = { facts: marketFacts(ov.result, se.result), evidence: [ov.id, se.id] };
  const decisions = [];
  for (const s of strategies) decisions.push(...await runStrategy(s, cycle, market, note));
  return { at: cycle.at, market, decisions, calls: cycle.cache.size };
}
