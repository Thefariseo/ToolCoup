// Extracts of the published files for the home page: each outlook by country, and the open coup markets. Nothing is
// recomputed except the restatement of our own six-month figure for a market's horizon, as the markets page does.
import "server-only";
import "@/lib/coup-fix";
import countries from "@/webdata/countries.json";
import violence from "@/webdata/violence.json";
import unrest from "@/webdata/unrest.json";
import snapshot from "@/webdata/markets-snapshot.json";
import { watchlist } from "@/lib/console";
import { countriesIn, modelAtHorizon, primaryMarket } from "@/lib/markets";

const MONTH_MS = 30.44 * 864e5;

/** Every country's next-period violence forecast, with the map's code, highest first. */
export function violenceAll() {
  const iso = new Map(countries.map((c) => [c.slug, c.iso]));
  return Object.entries(violence.countries)
    .map(([slug, c]) => ({ slug, name: c.name, iso: iso.get(slug), next: c.fc.o[0][0] }))
    .sort((a, b) => b.next - a.next);
}

/** Every country's chance of a protest wave in three months, highest first. */
export function unrestAll() {
  const iso = new Map(countries.map((c) => [c.slug, c.iso]));
  return Object.entries(unrest.countries)
    .filter(([, c]) => c.wave)
    .map(([slug, c]) => ({ slug, name: c.name, iso: iso.get(slug), p: c.wave.p }))
    .sort((a, b) => b.p - a.p);
}

/** Coup markets from the dated snapshot, one per country, with our figure restated for the market's horizon on the day of the reading. */
export function marketTop(n = 3) {
  const list = new Map(watchlist().map((c) => [c.slug, c])), asOf = Date.parse(snapshot.asOf), by = {};
  for (const row of snapshot.rows) {
    if (!/\bcoup\b/i.test(row.question)) continue;
    const closes = row.closes ? Date.parse(row.closes) : null;
    if (!closes || closes <= asOf) continue;
    for (const slug of countriesIn(row.question)) (by[slug] ||= []).push({ ...row, kind: "coup", months: (closes - asOf) / MONTH_MS });
  }
  const rows = Object.entries(by).map(([slug, all]) => {
    const m = primaryMarket(all.sort((a, b) => (b.volume || 0) - (a.volume || 0))), me = list.get(slug);
    return m && me ? { slug, name: me.name, iso: me.iso, p: m.p, volume: m.volume, closes: m.closes, source: m.source, model: modelAtHorizon(me.risk, m.months) } : null;
  }).filter((r) => r && r.model != null).sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, n);
  return { asOf: snapshot.asOf, rows };
}
