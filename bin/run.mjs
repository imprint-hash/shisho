// One agent cycle over every published strategy.
// Guarded by flock in bin/loop.sh so two cycles never overlap.
//   node bin/run.mjs
import { loadStrategies } from "../src/strategies.js";
import { runCycle } from "../src/engine.js";
import { llmNote } from "../src/note.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "../src/evidence.js";

const strategies = loadStrategies();
const r = await runCycle(strategies, { note: llmNote });
const f = r.market.facts;
writeFileSync(join(DATA, "latest.json"), JSON.stringify({ at: r.at, market: f, market_evidence: r.market.evidence, calls: r.calls }, null, 1));
console.log(`${r.at} · Fear & Greed ${f.fear_greed} · ${f.sentiment_regime} · altseason ${f.altseason_phase} · ${r.calls} RYO answers`);
for (const d of r.decisions) console.log(`  ${d.strategy.padEnd(15)} ${d.kind.padEnd(12)} ${d.symbol || ""} ${d.reason || (d.checks || []).filter(c => !c.pass).map(c => `${c.field} ${c.actual}`).join(", ")}`);
