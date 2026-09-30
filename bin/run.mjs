// One agent cycle over every published strategy.
// Guarded by flock in bin/loop.sh so two cycles never overlap.
//   node bin/run.mjs
import { loadStrategies } from "../src/strategies.js";
import { runCycle } from "../src/engine.js";
import { llmNote } from "../src/note.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "../src/evidence.js";
import { reachable, stats } from "../src/ryo.js";
import { appendFileSync, mkdirSync } from "node:fs";

const health = e => { mkdirSync(DATA, { recursive: true }); appendFileSync(join(DATA, "health.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n"); };

// No network (a machine that has just woken up): record nothing, let the loop try again in a minute.
if (!(await reachable())) { health({ event: "network_wait", detail: "RYO unreachable; the cycle waits and retries next minute." }); console.log(new Date().toISOString(), "RYO unreachable, will retry"); process.exit(75); }

const strategies = loadStrategies();
const t0 = Date.now();
const r = await runCycle(strategies, { note: llmNote });
health({ event: "cycle", ms: Date.now() - t0, decisions: r.decisions.length, calls: stats.calls, retries: stats.retries, rate_limited: stats.rate_limited, network_errors: stats.network_errors, unavailable: [...new Set(stats.unavailable)], notes_by_template: r.decisions.filter(d => d.note?.by === "template").length, councils_fell_back: r.decisions.filter(d => d.council?.by === "rules").length });
const f = r.market.facts;
writeFileSync(join(DATA, "latest.json"), JSON.stringify({ at: r.at, market: f, market_evidence: r.market.evidence, calls: r.calls }, null, 1));
console.log(`${r.at} · Fear & Greed ${f.fear_greed} · ${f.sentiment_regime} · altseason ${f.altseason_phase} · ${r.calls} RYO answers`);
for (const d of r.decisions) console.log(`  ${d.strategy.padEnd(15)} ${d.kind.padEnd(12)} ${d.symbol || ""} ${d.reason || (d.checks || []).filter(c => !c.pass).map(c => `${c.field} ${c.actual}`).join(", ")}`);
