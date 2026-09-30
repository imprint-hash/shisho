// Replay every recorded decision from its stored evidence and report.
//   node bin/replay.mjs            all decisions
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "../src/evidence.js";
import { replay } from "../src/replay.js";

const rows = readFileSync(join(DATA, "decisions.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
let ok = 0, bad = 0, skipped = 0;
for (const d of rows) {
  const r = replay(d);
  if (!r.replayable) { skipped++; continue; }
  if (r.identical) ok++; else { bad++; console.log("DIFFERENT:", d.at, d.strategy, d.kind, d.symbol || "", JSON.stringify(r).slice(0, 300)); }
}
console.log(`${ok} identical · ${bad} different · ${skipped} with nothing to replay (holding, watching, full)`);
process.exit(bad ? 1 : 0);
