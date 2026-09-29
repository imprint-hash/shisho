import { json } from "./_lib.mjs";
import { state } from "../src/api.js";
export default function handler(req, res) { try { json(res, 200, { ...state(), hosted: true }); } catch (e) { json(res, 500, { error: e.message }); } }
