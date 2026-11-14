// Server-side payloads for the console: the ranked watchlist and the quarterly risk matrix
// behind the Temporal Atlas. Nothing is recomputed: values come straight from the pipeline export.
import countries from "@/webdata/countries.json";
import details from "@/webdata/details.json";

const REGION_ORDER = ["Western Africa", "Middle Africa", "Eastern Africa", "Southern Africa", "Northern Africa", "Middle East",
  "Caucasus and Central Asia", "South Asia", "Southeast Asia", "East Asia", "Europe", "South America", "Central America",
  "Caribbean", "North America", "Oceania"];
const EXCLUDED = new Set(["International Waters", "Antarctica"]);

export function watchlist() {
  return countries
    .filter((c) => !c.historical && c.risk != null && !EXCLUDED.has(c.region))
    .sort((a, b) => a.rank - b.rank)
    .map(({ drivers, groups, ...c }, i) => ({ ...c, pos: i + 1 }));
}

/**
 * Quarterly mean of the published monthly risk series, 1975 -> latest, for every country with at
 * least ten years of history. Values are probabilities x 10000 (integers); -1 marks "no forecast".
 * Rows are grouped by region; inside a region the historically riskiest country comes first.
 */
export function atlasMatrix() {
  const START = 1975;
  const rows = [];
  let quarters = 0;
  for (const c of countries) {
    const h = details[c.slug]?.risk_hist;
    if (c.historical || EXCLUDED.has(c.region) || !h?.values?.length || h.values.length < 120) continue;
    const [y, m] = h.start.split("-").map(Number), offset = (y - START) * 12 + (m - 1);
    const n = Math.ceil((offset + h.values.length) / 3), v = new Array(n).fill(-1);
    let sum = 0, cnt = 0;
    for (let q = 0; q < n; q++) {
      let s = 0, k = 0;
      for (let i = q * 3 - offset; i < q * 3 - offset + 3; i++) if (i >= 0 && h.values[i] != null) { s += h.values[i]; k++; }
      if (k) { v[q] = Math.round((s / k) * 10000); sum += s / k; cnt++; }
    }
    quarters = Math.max(quarters, n);
    rows.push({ slug: c.slug, name: c.name, region: c.region, mean: cnt ? sum / cnt : 0, v });
  }
  rows.sort((a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region) || b.mean - a.mean);
  return { start: START, quarters, rows: rows.map(({ mean, v, ...r }) => ({ ...r, v: v.concat(new Array(quarters - v.length).fill(-1)) })) };
}
