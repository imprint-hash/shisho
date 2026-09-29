import { json } from "../_lib.mjs";
import { shisho } from "../../src/api.js";
export default function handler(req, res) {
  const id = String(req.query?.id || new URL(req.url, "http://x").pathname.split("/").pop());
  try { const s = shisho(id); s ? json(res, 200, s) : json(res, 404, { error: "No such shishō." }); } catch (e) { json(res, 500, { error: e.message }); }
}
