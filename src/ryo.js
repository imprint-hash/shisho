// The RYO-CHAN research tools, over MCP. Every call is rate-limited below the
// key's 60 per minute, retried with backoff when a source is busy or drops, and
// returned as it came: when a tool cannot answer, the result says so with its
// status and reason. Nothing here ever fills a gap with an invented number.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENDPOINT = process.env.RYO_MCP_URL || "https://app-ryochan.com/api/mcp";
const PER_MINUTE = Number(process.env.RYO_PER_MINUTE || 50);   // the key allows 60; leave headroom
const RETRIES = 4;
const BACKOFF_MS = Number(process.env.RYO_BACKOFF_MS || 1000);       // first retry wait; doubles each time
const RATE_WAIT_MS = Number(process.env.RYO_RATE_WAIT_MS || 20000);   // wait after RYO says a window is full

function key() {
  if (process.env.RYO_API_KEY) return process.env.RYO_API_KEY.trim();
  try { return readFileSync(join(homedir(), ".chainops", "ryo_key"), "utf8").trim(); }
  catch { throw new Error("Set RYO_API_KEY (ryo_mcp_...)."); }
}

// A sliding one-minute window shared by every caller in this process.
// Tools that fan out to several sources share a tighter limit on RYO's side (6 a minute).
const FANOUT = new Set(["scan_market", "market_overview", "deep_analysis", "compare_tokens"]);
const FANOUT_PER_MINUTE = Number(process.env.RYO_FANOUT_PER_MINUTE || 5);
const windows = { all: [], fanout: [] };
async function take(win, limit) {
  for (;;) {
    const now = Date.now();
    while (win.length && now - win[0] > 60000) win.shift();
    if (win.length < limit) { win.push(now); return; }
    await new Promise(r => setTimeout(r, 60000 - (now - win[0]) + 50));
  }
}
async function slot(tool) {
  if (FANOUT.has(tool)) await take(windows.fanout, FANOUT_PER_MINUTE);
  await take(windows.all, PER_MINUTE);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
let seq = 0;

// What this process saw from RYO, for the health log.
export const stats = { calls: 0, retries: 0, rate_limited: 0, unavailable: [], network_errors: 0 };

function parse(text) {
  const m = text.match(/data: (\{.*\})/);
  const envelope = JSON.parse(m ? m[1] : text);
  if (envelope.error) throw Object.assign(new Error(envelope.error.message || "MCP error"), { retry: false });
  const content = envelope.result?.content?.[0]?.text ?? "";
  try { return JSON.parse(content); }
  // The tools answer in plain text when they cannot analyse something.
  catch { return { status: "unavailable", reason: content.slice(0, 300) }; }
}

// Call one tool. Always resolves: { tool, args, status, as_of, data, warnings, reason, attempts, ms }.
export async function call(tool, args = {}, { timeoutMs = 90000 } = {}) {
  const t0 = Date.now();
  let last;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    await slot(tool);
    stats.calls++; if (attempt > 1) stats.retries++;
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST", signal: ctl.signal,
        headers: { Authorization: `Bearer ${key()}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++seq, method: "tools/call", params: { name: tool, arguments: args } }),
      });
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`RYO answered ${res.status}`), { retry: true });
      if (!res.ok) throw Object.assign(new Error(`RYO answered ${res.status}: ${text.slice(0, 160)}`), { retry: false });
      const body = parse(text);
      // A busy source answers in words, not a status code; wait for its window and try again.
      if (body.status === "unavailable" && /rate limit/i.test(body.reason || "")) { stats.rate_limited++; throw Object.assign(new Error(body.reason), { retry: true, wait: RATE_WAIT_MS }); }
      return {
        tool, args, status: body.status || "ok", as_of: body.as_of || null, data: body.data ?? null,
        summary: body.summary ?? null, warnings: body.warnings || [], reason: body.reason || null,
        attempts: attempt, ms: Date.now() - t0,
      };
    } catch (e) {
      last = e;
      if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network|abort/i.test(String(e.message))) stats.network_errors++;
      if (e.retry === false) break;
      if (attempt < RETRIES) await sleep(e.wait || BACKOFF_MS * 2 ** (attempt - 1));
    } finally { clearTimeout(timer); }
  }
  stats.unavailable.push(tool);
  return { tool, args, status: "unavailable", as_of: null, data: null, summary: null, warnings: [], reason: String(last?.message || last).slice(0, 300), attempts: RETRIES, ms: Date.now() - t0 };
}

export const TOOLS = ["market_overview", "scan_market", "analyze_token", "deep_analysis", "compare_tokens", "monitor_market_sentiment_shift"];

// Can we reach RYO at all? Used before a cycle, so a machine that has just woken
// up without a network waits instead of recording an hour of "unavailable".
export async function reachable() {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(ENDPOINT, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json" }, body: "{}" });
    clearTimeout(t); return r.status > 0;
  } catch { return false; }
}
