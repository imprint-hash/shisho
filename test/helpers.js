// Test helpers: a temporary data folder and a fake RYO that answers like the
// real MCP endpoint, so every test runs offline and deterministically.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function setup() {
  const dir = mkdtempSync(join(tmpdir(), "shisho-test-"));
  mkdirSync(join(dir, "strategies"), { recursive: true });
  process.env.SHISHO_DATA = dir;
  process.env.RYO_API_KEY = "ryo_mcp_test";
  process.env.RYO_BACKOFF_MS = "1";
  process.env.RYO_RATE_WAIT_MS = "1";
  delete process.env.SHISHO_LLM_URL; delete process.env.SHISHO_LLM_KEY;
  return dir;
}

export const strategy = (over = {}) => ({
  id: "test-trend", name: "Test Trend", creator: { handle: "tester", demo: true },
  thesis: "A strategy used only by the tests, buying calm uptrends.",
  universe: { source: "list", symbols: ["AAA", "BBB"] },
  market_filter: [{ field: "fear_greed", op: "<=", value: 75 }],
  entry: [{ field: "trend", op: "==", value: "up" }, { field: "rsi_14", op: ">=", value: 50 }],
  exit: { take_profit_atr: 2, stop_loss_atr: 1, max_hold_hours: 72 },
  sizing: { pct_per_trade: 20, max_positions: 2 },
  follow_fee_ryochan: 5000000, stake_ryochan: 50000000, ...over,
});

export const saveStrategy = (dir, s) => writeFileSync(join(dir, "strategies", `${s.id}.json`), JSON.stringify(s));

const envelope = body => new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: typeof body === "string" ? body : JSON.stringify(body) }] } })}\n\n`, { status: 200 });

export const market = (fg = 60) => ({
  market_overview: { status: "ok", as_of: "t", data: { regime: "neutral", sentiment: { fear_greed_index: fg }, market: { breadth: 0.6, btc_dominance_pct: 58 } } },
  monitor_market_sentiment_shift: { status: "ok", as_of: "t", data: { evidence: { fear_greed: { value: fg, change_7d_points: -3 }, sentiment_regime: "mixed_sentiment", altseason: { phase: "transition", index: 60 }, funding: { crowding_state: "normal" }, liquidation: { pressure_state: "normal", dominant_liquidated_side: "longs" } } } },
});
export const coin = (symbol, { price = 10, trend = "up", rsi = 60, atr = 5 } = {}) => ({ status: "ok", as_of: "t", data: { asset: { symbol, rank: 50 }, market: { price_usd: price, market_cap_usd: 1e9, volume_24h_usd: 1e8 }, performance: { change_24h_pct: 3, change_7d_pct: 5 }, technical_analysis: { trend, rsi_14: rsi, atr_14_pct: atr }, verdict: "neutral" } });

// answers: { tool: body | (args) => body | Response }. Records every call.
export function fakeRyo(answers) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const req = JSON.parse(opts.body || "{}");
    if (!req.params) return new Response("{}", { status: 400 });   // the reachability probe
    const { name, arguments: args } = req.params;
    calls.push({ name, args });
    let a = answers[name];
    if (typeof a === "function") a = a(args, calls);
    if (a instanceof Response) return a;
    if (a instanceof Error) throw a;
    return envelope(a ?? `couldn't analyze ${args.symbol || name} right now`);
  };
  return calls;
}
