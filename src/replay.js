// Replay: rebuild a decision from nothing but its stored evidence and the
// stored version of the strategy, and compare. The same inputs must give the
// same checks and the same outcome, every time, with no network and no model.

import { load, marketFacts, coinFacts } from "./evidence.js";
import { checkAll } from "./strategy.js";
import { exitReason } from "./engine.js";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const strip = rs => rs.map(({ field, op, value, actual, pass }) => ({ field, op, value, actual, pass }));

export function replay(d) {
  if (!d.strategy_version) return { replayable: false, reason: "recorded before strategies were versioned" };
  const s = load(d.strategy_version);
  const market = () => { const [ov, se] = d.market_evidence.map(load); return marketFacts(ov, se); };
  let checks, outcome;
  switch (d.kind) {
    case "stand_aside": {
      const m = checkAll(s.market_filter, market());
      checks = m.results; outcome = m.pass ? "trade_allowed" : "stand_aside";
      break;
    }
    case "enter": {
      const m = checkAll(s.market_filter, market());
      const scan = d.scan_evidence ? load(d.scan_evidence) : null;
      const row = scan?.data?.candidates?.find(c => c.symbol === d.symbol) || { symbol: d.symbol };
      const e = checkAll(s.entry, coinFacts(row, load(d.coin_evidence)));
      checks = [...m.results, ...e.results]; outcome = m.pass && e.pass ? "enter" : "no_entry";
      break;
    }
    case "exit": {
      const f = coinFacts(null, load(d.coin_evidence));
      const why = exitReason(s, { take_profit: d.take_profit, stop_loss: d.stop_loss, opened_at: d.opened_at }, f.price_usd, d.at);
      checks = null; outcome = why ? "exit" : "hold";
      return { replayable: true, identical: outcome === "exit" && why === d.reason_code, outcome, reason_code: why };
    }
    default: return { replayable: false, reason: `nothing to replay for a ${d.kind} record` };
  }
  const identical = outcome === d.kind && same(strip(checks), strip(d.checks));
  return { replayable: true, identical, outcome, checks };
}
