// A strategy is a creator's rulebook, written so code can check it: which coins
// it looks at, what the market must look like, what a coin must show before a
// practice buy, and when to get out. Every rule names a field that RYO's tools
// actually return, so any decision can be traced back to the evidence.

// Facts about the whole market, from market_overview and monitor_market_sentiment_shift.
export const MARKET_FIELDS = {
  fear_greed: "Fear & Greed index, 0-100",
  fear_greed_change_7d: "Fear & Greed change over seven days, points",
  sentiment_regime: "RYO's combined sentiment regime, e.g. mixed_sentiment",
  market_regime: "RYO's market regime, e.g. neutral",
  altseason_phase: "Altseason phase, e.g. transition",
  altseason_index: "Altseason index, 0-100",
  funding_crowding: "BTC perpetual funding crowding state, e.g. normal",
  liquidation_pressure: "BTC liquidation pressure state, e.g. normal",
  liquidated_side: "Side liquidated most over the last day, longs or shorts",
  breadth: "Share of top coins up over 24h, 0-1",
  btc_dominance: "Bitcoin dominance, %",
};

// Facts about one coin, from scan_market and analyze_token.
export const COIN_FIELDS = {
  price_usd: "Price, USD",
  change_1h_pct: "Change over 1 hour, %",
  change_24h_pct: "Change over 24 hours, %",
  change_7d_pct: "Change over 7 days, %",
  change_30d_pct: "Change over 30 days, %",
  market_cap_usd: "Market cap, USD",
  volume_24h_usd: "24h trading volume, USD",
  turnover_ratio: "24h volume divided by market cap",
  momentum_score: "RYO momentum score, 0-1",
  established_asset: "RYO marks it as an established asset",
  rank: "Market cap rank",
  rsi_14: "RSI over 14 periods",
  atr_14_pct: "Average true range over 14 periods, % of price",
  trend: "Trend, up or down",
  verdict: "RYO's own read, e.g. neutral",
};

export const OPS = [">", ">=", "<", "<=", "==", "!=", "in", "not_in"];

export function check(cond, facts) {
  const actual = facts[cond.field];
  if (actual === undefined || actual === null) return { ...cond, actual: null, pass: false, missing: true };
  const v = cond.value;
  let pass;
  switch (cond.op) {
    case ">": pass = actual > v; break;
    case ">=": pass = actual >= v; break;
    case "<": pass = actual < v; break;
    case "<=": pass = actual <= v; break;
    case "==": pass = actual === v; break;
    case "!=": pass = actual !== v; break;
    case "in": pass = Array.isArray(v) && v.includes(actual); break;
    case "not_in": pass = Array.isArray(v) && !v.includes(actual); break;
    default: pass = false;
  }
  return { ...cond, actual, pass };
}

export const checkAll = (conds, facts) => {
  const results = (conds || []).map(c => check(c, facts));
  return { pass: results.every(r => r.pass), results };
};

// Structural checks: a strategy that names a field RYO doesn't return, or has
// no way out, is refused before it can run.
export function validate(s) {
  const errors = [];
  const need = (ok, msg) => { if (!ok) errors.push(msg); };
  need(/^[a-z0-9-]{3,40}$/.test(s.id || ""), "id must be 3-40 lowercase letters, digits or dashes");
  need(typeof s.name === "string" && s.name.length >= 3, "name is required");
  need(typeof s.thesis === "string" && s.thesis.length >= 20, "thesis must explain the idea in a sentence");
  const u = s.universe || {};
  need(u.source === "scan" || (u.source === "list" && Array.isArray(u.symbols) && u.symbols.length > 0 && u.symbols.length <= 8), "universe is a RYO scan, or a list of 1-8 symbols");
  if (u.source === "scan") need(!u.top_n || (u.top_n >= 1 && u.top_n <= 10), "a scan looks at 1-10 candidates");
  for (const c of s.market_filter || []) need(c.field in MARKET_FIELDS && OPS.includes(c.op), `market rule on unknown field or operator: ${c.field} ${c.op}`);
  need(Array.isArray(s.entry) && s.entry.length > 0, "at least one entry rule");
  for (const c of s.entry || []) need(c.field in COIN_FIELDS && OPS.includes(c.op), `entry rule on unknown field or operator: ${c.field} ${c.op}`);
  const x = s.exit || {};
  need(x.take_profit_atr > 0 && x.stop_loss_atr > 0, "exits need a take-profit and a stop-loss, in ATRs");
  need(x.max_hold_hours > 0 && x.max_hold_hours <= 24 * 30, "a position is held 1 hour to 30 days at most");
  const z = s.sizing || {};
  need(z.pct_per_trade > 0 && z.pct_per_trade <= 50, "each practice trade uses 1-50% of the book");
  need(z.max_positions >= 1 && z.max_positions <= 5, "1-5 open positions");
  return errors;
}

// Plain words for a rule, for people reading the strategy page.
const SHORT = {
  fear_greed: "Fear & Greed", fear_greed_change_7d: "Fear & Greed change (7d)", sentiment_regime: "Sentiment", market_regime: "Market regime",
  altseason_phase: "Altseason", altseason_index: "Altseason index", funding_crowding: "Funding", liquidation_pressure: "Liquidations",
  liquidated_side: "Side liquidated", breadth: "Coins up today", btc_dominance: "BTC dominance",
  price_usd: "Price", change_1h_pct: "1h change", change_24h_pct: "24h change", change_7d_pct: "7d change", change_30d_pct: "30d change",
  market_cap_usd: "Market cap", volume_24h_usd: "24h volume", turnover_ratio: "Volume/market cap", momentum_score: "Momentum score",
  established_asset: "Established coin", rank: "Rank", rsi_14: "RSI", atr_14_pct: "Daily range (ATR)", trend: "Trend", verdict: "RYO's read",
};
const PCT = new Set(["change_1h_pct", "change_24h_pct", "change_7d_pct", "change_30d_pct", "atr_14_pct", "btc_dominance"]);
const show = (field, v) => {
  if (Array.isArray(v)) return v.map(x => String(x).replace(/_/g, " ")).join(" or ");
  if (typeof v === "string") return v.replace(/_/g, " ");
  if (field === "breadth") return `${Math.round(v * 100)}%`;
  if (PCT.has(field)) return `${v > 0 && field.startsWith("change") ? "+" : ""}${v}%`;
  return String(v);
};
export function describe(c) {
  const label = SHORT[c.field] || c.field;
  if (typeof c.value === "boolean") return (c.op === "==") === c.value ? label : `Not ${label.toLowerCase()}`;
  const op = { ">": "above", ">=": "at least", "<": "below", "<=": "at most", "==": "is", "!=": "is not", in: "is", not_in: "is not" }[c.op];
  return `${label} ${op} ${show(c.field, c.value)}`;
}
export const showValue = (field, v) => v === null || v === undefined ? "no data" : typeof v === "boolean" ? (v ? "yes" : "no") : typeof v === "number" ? show(field, +v.toFixed(Math.abs(v) < 1 ? 4 : 2)) : show(field, v);
