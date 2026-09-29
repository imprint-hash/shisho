import { json, body } from "./_lib.mjs";
import { compile, rightNow } from "../src/compile.js";
import { describe, showValue } from "../src/strategy.js";
import { state } from "../src/api.js";
// Preview only on the hosted site: rules are written and validated, but published from the agent's machine.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST a strategy" });
  try {
    const { text, handle } = await body(req);
    if (!/^[a-z0-9_]{3,20}$/.test(String(handle || "").trim().toLowerCase())) return json(res, 400, { error: "A handle is 3-20 letters, digits or underscores." });
    if (String(text || "").trim().length < 20) return json(res, 400, { error: "Describe the strategy in a sentence or two." });
    const r = await compile(text, String(handle).trim().toLowerCase());
    const now = rightNow(r.strategy, state().market);
    json(res, 200, { ...r, preview_only: true, right_now: now && { pass: now.pass, results: now.results.map(c => ({ ...c, text: describe(c), shown: showValue(c.field, c.actual) })) } });
  } catch (e) { json(res, 503, { error: e.message }); }
}
