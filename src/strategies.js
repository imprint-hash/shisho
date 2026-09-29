// Published strategies, one JSON file each under data/strategies. Every file is
// validated before it can run.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "./evidence.js";
import { validate } from "./strategy.js";

export function loadStrategies() {
  const dir = join(DATA, "strategies");
  return readdirSync(dir).filter(f => f.endsWith(".json")).sort().map(f => {
    const s = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const errors = validate(s);
    if (errors.length) throw new Error(`${f}: ${errors.join("; ")}`);
    return s;
  });
}
