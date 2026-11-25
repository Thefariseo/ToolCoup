// Files the hybrid reading for the current issue in registry/hybrid/<issue>.json and records its SHA-256 in registry/hybrid/index.json, the way
// pipeline/registry.py files the forecast itself. It never overwrites a file: a month that already has a snapshot keeps it.
//
//   HYBRID_SNAPSHOT=1 npx next start -p 3100 &        (the site built from this checkout; the variable switches the route on)
//   node scripts/hybrid-snapshot.mjs http://localhost:3100 [--top 40] [--no-analyst]
//
// Needs OPENAI_API_KEY in the environment of the server for the analyst; without it the snapshot holds the model and the markets only.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [base = "http://localhost:3100", ...rest] = process.argv.slice(2);
const topIdx = rest.indexOf("--top");
const body = { top: topIdx >= 0 ? Number(rest[topIdx + 1]) : 40, analyst: !rest.includes("--no-analyst") };

// The route answers only when every country is done, which can take several minutes (one language-model call per country). The built-in fetch gives up on a
// response that sends no headers for five minutes, so the request goes through node:http, which has no such limit; a hard stop after thirty minutes is the guard.
const post = (url, payload) => new Promise((resolve, reject) => {
  const u = new URL(url), lib = u.protocol === "https:" ? https : http;
  const req = lib.request(u, { method: "POST", headers: { "content-type": "application/json" } }, (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
  });
  req.on("error", reject);
  req.setTimeout(0);
  req.end(payload);
});
const guard = setTimeout(() => { console.error("snapshot did not finish within 30 minutes"); process.exit(1); }, 30 * 60 * 1000);
const res = await post(`${base}/api/hybrid/snapshot`, JSON.stringify(body));
clearTimeout(guard);
if (res.status !== 200) { console.error(`snapshot route answered ${res.status}`); process.exit(1); }
const doc = JSON.parse(res.text);

const dir = join(root, "registry", "hybrid"), file = join(dir, `${doc.issue}.json`), indexPath = join(dir, "index.json");
mkdirSync(dir, { recursive: true });
if (existsSync(file)) { console.log(`Hybrid ledger: ${doc.issue} is already filed, not rewritten`); process.exit(0); }
writeFileSync(file, JSON.stringify(doc, null, 1) + "\n");
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];
index.push({ issue: doc.issue, asof: doc.asof, n: doc.countries.length, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") });
writeFileSync(indexPath, JSON.stringify(index.sort((a, b) => a.issue.localeCompare(b.issue)), null, 1) + "\n");
const withAnalyst = doc.countries.filter((c) => c.analyst).length, withMarket = doc.countries.filter((c) => c.market).length;
console.log(`Hybrid ledger: filed ${doc.issue} (${doc.countries.length} countries, ${withMarket} with a market, ${withAnalyst} with an analyst forecast)`);
