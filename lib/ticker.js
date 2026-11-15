// The wire at the foot of every page: headlines about coups, military rule and political instability from vetted outlets, next to
// lines from our own data (risk movers, the violence outlook, prediction markets, the registry). News comes from Google News RSS,
// one search per outlet in lib/outlets.js (a search with many outlets ignores its date limit), and each headline is tied to a
// country on our list so the ticker can show the model's current estimate beside it. Server only.
import "server-only";
import { watchlist } from "@/lib/console";
import { allMarkets, countryHits, modelAtHorizon, primaryMarket } from "@/lib/markets";
import { PRESS_SOURCES, decode, hostOf, sourceOf } from "@/lib/outlets";
import { getRegistry } from "@/lib/registry";
import violence from "@/webdata/violence.json";

const TTL = 15 * 60 * 1000;
const DAYS = 14;
const DOMAINS = ["reuters.com", "apnews.com", "bbc.com", "aljazeera.com", "france24.com", "dw.com", "theguardian.com", "nytimes.com",
  "africanews.com", "voanews.com", "rfi.fr", "theafricareport.com", "crisisgroup.org", "news.un.org"].filter((d) => d in PRESS_SOURCES);
const TOPICS = '"coup" OR "coup attempt" OR junta OR mutiny OR putsch OR "military takeover" OR "military rule" OR "state of emergency" OR "martial law" OR ECOWAS OR "transitional government"';
// Core: a coup, a military takeover or military rule. Wider: the army, emergency powers, contested elections, kept only for the countries the model ranks highest.
const CORE = /\b(coup|coups|putsch|junta|mutiny|mutineers?|military takeover|military rule|military government|seiz\w* power|overthr\w+|counter-coup|transitional (military )?(government|council)|ECOWAS)\b/i;
const WIDE = /\b(state of emergency|martial law|curfew|impeach\w*|no-confidence|constitutional crisis|term limits?|election (postponed|delayed)|mass protests?|stormed? (parliament|the presidential)|army deployed|army|armed forces|soldiers|troops|presidential guard|military (chief|leader|leaders|council|officers?|commander|chiefs?)|general strike)\b/i;
// "a diplomatic coup", "coup de grâce", "junta directiva" (a company board): the word without the event
const FIGURATIVE = /\b(intelligence|diplomatic|publicity|marketing|media|business|boardroom|major|big|huge|stunning|biggest|tech|ai)\s+coup\b|\bcoup\s+(de\s+gr[aâ]ce|de\s+th[eé][aâ]tre|for\b)|\bjunta\s+(directiva|general|de\s+(accionistas|gobierno|andaluc\w+))/i;
// retrospectives and anniversaries are not news about now
const HISTORICAL = /\b(19\d\d|20[01]\d|anniversar\w+|remember\w*|legacy|decades? (ago|after|since)|cold war|survivors?|recreating|outlook \|)/i;
const WIDE_RANK = 30;

const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const num = (v) => Math.round(v).toLocaleString("en-GB");

/** Lines from our own data. No network: safe to render on the server for the first paint. */
export function modelItems() {
  const list = watchlist(), items = [];
  const top = list[0];
  if (top) items.push({ k: "model", text: `Highest six-month coup risk: ${top.name}, ${pct(top.risk)}`, href: `/paese/${top.slug}` });
  const movers = list.filter((c) => c.risk_3m_ago != null && c.risk >= 0.01).map((c) => ({ c, d: c.risk - c.risk_3m_ago })).sort((a, b) => b.d - a.d);
  for (const { c, d } of movers.slice(0, 3)) {
    if (d > 0.002) items.push({ k: "model", text: `${c.name}: risk up ${(d * 100).toFixed(1)} points in three months, now ${pct(c.risk)}`, href: `/paese/${c.slug}` });
  }
  const rows = Object.entries(violence.countries || {}).map(([slug, c]) => {
    const f = c.fc?.o || [], six = f.length ? f.reduce((s, x) => s + x[0], 0) / f.length : null;
    return { slug, name: c.name, ma6: c.ma6, next: f[0]?.[0], change: c.ma6 >= 10 && six != null ? six / c.ma6 - 1 : null };
  });
  const rise = rows.filter((r) => r.change != null && r.change > 0.05).sort((a, b) => b.change - a.change).slice(0, 2);
  const level = rows.filter((r) => r.next != null).sort((a, b) => b.next - a.next)[0];
  if (level) items.push({ k: "violence", text: `Highest organised-violence outlook: ${level.name}, about ${num(level.next)} events in the next four weeks`, href: `/paese/${level.slug}#violence` });
  for (const r of rise) items.push({ k: "violence", text: `${r.name}: organised violence forecast ${(r.change * 100).toFixed(0)}% above its six-period average`, href: `/paese/${r.slug}#violence` });
  const issue = getRegistry().issues?.[0];
  if (issue) items.push({ k: "registry", text: `Forecast registry: issue ${issue.issue} filed ${issue.published}, ${issue.status === "open" ? `window open until ${issue.window[1]}` : "window closed"}`, href: "/registry" });
  return items;
}

/** One line per country that has a prediction market: the venue with the most volume, next to the model at the same horizon. */
async function marketItems() {
  const { by } = await allMarkets(), list = watchlist(), items = [];
  for (const [slug, rows] of Object.entries(by || {})) {
    const m = primaryMarket(rows), me = list.find((c) => c.slug === slug);
    if (!m || !me) continue;
    const model = modelAtHorizon(me.risk, m.months);
    items.push({ k: "market", text: `${me.name}, ${m.source}: "${m.question.replace(/\s*\?\s*$/, "").slice(0, 72)}" ${pct(m.p)}${model != null ? `; our model, coup attempt over the same horizon, ${pct(model)}` : ""}`, href: `/paese/${slug}#crowd`, vol: m.volume || 0 });
  }
  return items.sort((a, b) => b.vol - a.vol).slice(0, 4).map(({ vol, ...i }) => i);
}

const words = (t) => new Set(t.toLowerCase().match(/[a-z]{4,}/g) || []);
const similar = (a, b) => { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(1, Math.min(A.size, B.size)) >= 0.6; };

async function fetchWire() {
  const list = watchlist(), country = new Map(list.map((c) => [c.slug, c]));
  const xmls = await Promise.all(DOMAINS.map(async (d) => {
    const q = `(${TOPICS}) site:${d} when:${DAYS}d`;
    try {
      const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Praevex/1.0)" }, signal: AbortSignal.timeout(9000), cache: "no-store" });
      return res.ok ? await res.text() : "";
    } catch { return ""; }
  }));
  if (!xmls.some((x) => x.trim())) return null;
  const found = [];
  for (const m of xmls.join("\n").matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1], outlet = sourceOf(hostOf(it.match(/<source url="([^"]*)"/)?.[1] || ""));
    if (!outlet) continue;
    const title = decode(it.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").replace(/\s+-\s+[^-]{2,40}$/, "");
    const at = new Date(it.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ""), href = decode(it.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "");
    const hit = countryHits(title)[0], c = hit && country.get(hit[0]);
    if (!title || !href || isNaN(at) || at.getTime() < Date.now() - DAYS * 864e5) continue;
    if (FIGURATIVE.test(title) || HISTORICAL.test(title) || !c) continue;
    if (!CORE.test(title) && !(WIDE.test(title) && c.rank <= WIDE_RANK)) continue;
    found.push({ k: "news", text: title, href, ext: true, src: outlet, t: at.toISOString(), slug: c.slug, name: c.name, risk: c.risk ?? null });
  }
  found.sort((a, b) => b.t.localeCompare(a.t));
  const out = [], perCountry = {};
  for (const n of found) {
    if (out.some((o) => similar(o.text, n.text)) || (perCountry[n.slug] || 0) >= 2) continue;
    perCountry[n.slug] = (perCountry[n.slug] || 0) + 1;
    out.push(n);
    if (out.length >= 16) break;
  }
  return out;
}

/** Two headlines, then one line of our own, and so on. */
function mix(news, own) {
  const out = []; let n = 0, o = 0;
  while (n < news.length || o < own.length) {
    for (let i = 0; i < 2 && n < news.length; i++) out.push(news[n++]);
    if (o < own.length) out.push(own[o++]);
  }
  return out.slice(0, 30);
}

let cache = null;
export async function buildTicker() {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  const [news, markets] = await Promise.all([
    fetchWire().catch((e) => { console.error("[ticker] news failed:", e?.message || e); return null; }),
    marketItems().catch((e) => { console.error("[ticker] markets failed:", e?.message || e); return []; }),
  ]);
  const kept = news ?? cache?.news ?? [];                       // a failed refresh keeps the last good headlines
  const own = [...modelItems(), ...markets];
  const data = { asOf: new Date().toISOString(), headlines: kept.length, items: mix(kept, own) };
  cache = { at: news ? Date.now() : Date.now() - TTL + 60 * 1000, data, news: kept };      // a failed news refresh is retried after a minute, not a quarter of an hour
  return data;
}
