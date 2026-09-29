// Shared helpers for the hosted (read-only) API. The hosted site reads the
// records the agent pushes; it can't write files, so follows are kept in the
// visitor's browser and publishing previews the rules only.
export const json = (res, code, data) => { res.statusCode = code; res.setHeader("content-type", "application/json"); res.setHeader("cache-control", "public, max-age=60"); res.end(JSON.stringify(data)); };
export async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let b = ""; for await (const c of req) { b += c; if (b.length > 20000) throw new Error("Too long."); }
  return JSON.parse(b || "{}");
}
