// Rewrites webdata/markets-snapshot.json from a deployed copy of the site, which can reach Polymarket and Kalshi when a
// local network cannot (for example behind a betting-site block). Usage: node scripts/snapshot-markets.mjs https://your-site
// Only coup and leader-exit questions that name a tracked country are kept, with the two real-money venues.
import { writeFileSync } from "node:fs";
const site = (process.argv[2] || "").replace(/\/$/, "");
if (!site) { console.error("Give the site address, for example: node scripts/snapshot-markets.mjs https://coup.vercel.app"); process.exit(1); }
const index = await (await fetch(`${site}/api/markets`)).json();
const slugs = Object.keys(index.countries || {}), rows = [], seen = new Set();
for (const slug of slugs) {
  const j = await (await fetch(`${site}/api/markets/${slug}`)).json();
  for (const m of j.markets || []) {
    if (!["Polymarket", "Kalshi"].includes(m.source) || !(m.p > 0 && m.p < 1)) continue;
    const key = `${m.source}|${m.question}`; if (seen.has(key)) continue; seen.add(key);
    rows.push({ source: m.source, question: m.question, p: m.p, volume: m.volume ?? null, closes: m.closes });
  }
}
const out = { asOf: index.asOf, note: "Last good readings of Polymarket and Kalshi, taken from the deployed site on this date. Used only when a source cannot be reached live. Regenerate with node scripts/snapshot-markets.mjs <site url>.", rows };
writeFileSync(new URL("../webdata/markets-snapshot.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`${rows.length} rows from ${slugs.length} countries, as of ${index.asOf}`);
