// Public-discourse monitor: shifts in attention and tone around a country, read without any polling.
//   Wikipedia daily pageviews of the country article (open API, reliable): a proxy for sudden public attention.
//   GDELT DOC timelines (news volume and tone for security/politics queries; best effort, the API is rate limited).
// These are descriptive alerts. They are NOT inputs to the coup model: tested signals of this kind did not improve it (docs/triggers.md).
import "server-only";
import { watchlist } from "@/lib/console";

const UA = { "User-Agent": "Praevex/1.0 (research; +https://github.com/Thefariseo/ToolCoup)", Accept: "application/json" };
const TITLE = { georgia: "Georgia_(country)", "ivory-coast": "Ivory_Coast", "democratic-republic-of-congo": "Democratic_Republic_of_the_Congo", "republic-of-congo": "Republic_of_the_Congo",
  "united-states": "United_States", "united-kingdom": "United_Kingdom", gambia: "The_Gambia", bahamas: "The_Bahamas", "east-timor": "East_Timor", myanmar: "Myanmar" };
const cache = new Map(), TTL = 3 * 3600 * 1000;
const median = (a) => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length ? (b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2) : null; };
const ymd = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");

function shift(values) {
  if (values.length < 60) return null;
  const recent = values.slice(-7), base = values.slice(0, -14), med = median(base), mad = median(base.map((v) => Math.abs(v - med))) || 1;
  const r = recent.reduce((a, b) => a + b, 0) / recent.length;
  const z = (r - med) / (1.4826 * mad);
  return { median: Math.round(med * 100) / 100, recent: Math.round(r * 100) / 100, ratio: med > 0 ? Math.round((r / med) * 100) / 100 : null, z: Math.round(z * 10) / 10, alert: z >= 3 && med > 0 && r / med >= 1.6 };
}

async function wikipedia(slug, name) {
  const title = TITLE[slug] || name.replaceAll(" ", "_"), end = new Date(), start = new Date(end - 120 * 864e5);
  const res = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title)}/daily/${ymd(start)}/${ymd(end)}`, { headers: UA, signal: AbortSignal.timeout(10000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = (await res.json()).items || [], values = items.map((i) => i.views);
  return { article: title, days: items.map((i) => ({ d: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}-${i.timestamp.slice(6, 8)}`, v: i.views })), ...shift(values) };
}

async function gdelt(name, mode) {
  const q = `"${name}" (coup OR military OR junta OR army OR protest OR unrest OR mutiny)`;
  const res = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=${mode}&format=json&timespan=3months`, { headers: UA, signal: AbortSignal.timeout(15000), cache: "no-store" });
  const text = await res.text();
  let j; try { j = JSON.parse(text); } catch { throw new Error("rate limited or empty"); }
  const data = j.timeline?.[0]?.data || [];
  if (!data.length) throw new Error("no data");
  return data.map((p) => ({ d: `${p.date.slice(0, 4)}-${p.date.slice(4, 6)}-${p.date.slice(6, 8)}`, v: p.value }));
}

export async function discourse(slug) {
  const me = watchlist().find((c) => c.slug === slug); if (!me) return null;
  const hit = cache.get(slug); if (hit && Date.now() - hit.at < TTL) return hit.data;
  const out = { slug, name: me.name, asOf: new Date().toISOString(), wiki: null, news: null, errors: {} };
  await Promise.all([
    wikipedia(slug, me.name).then((w) => { out.wiki = w; }).catch((e) => { out.errors.wikipedia = String(e.message).slice(0, 60); }),
    (async () => {
      try {
        const vol = await gdelt(me.name, "timelinevol"), tone = await gdelt(me.name, "timelinetone");
        out.news = { vol: vol.slice(-90), tone: tone.slice(-90), volShift: shift(vol.map((p) => p.v)), toneRecent: Math.round((tone.slice(-7).reduce((a, p) => a + p.v, 0) / Math.max(1, tone.slice(-7).length)) * 100) / 100, toneBase: Math.round((median(tone.slice(0, -14).map((p) => p.v)) ?? 0) * 100) / 100 };
      } catch (e) { out.errors.gdelt = String(e.message).slice(0, 60); }
    })(),
  ]);
  if (out.wiki || out.news) cache.set(slug, { at: Date.now(), data: out });
  return out;
}
