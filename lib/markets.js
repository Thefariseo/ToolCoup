// Prediction markets on coups and leader exits, read from public endpoints (no key needed for reading):
// Polymarket (Gamma API), Kalshi (public market data) and Manifold. Markets are matched to countries by name and
// shown NEXT TO the model, never blended into it: a market's horizon, wording and liquidity differ from our target.
import "server-only";
import { watchlist } from "@/lib/console";
import { ALIASES } from "@/lib/aliases";

const COUP = /\b(coup|coups|overthrow|overthrown|ouster|ousted|military takeover|seize power|seizes power|junta)\b/i;
const EXIT = /\b(leave office|step down|resign|resigns|removed from (power|office)|out as (president|prime minister)|regime (change|collapse|fall))\b/i;
const UA = { "User-Agent": "Mozilla/5.0 (compatible; ToolCoup/1.0)", Accept: "application/json" };
const TERMS = ["coup", "overthrown", "ousted"];
const TTL = 30 * 60 * 1000;
let cache = null;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Names that need context to avoid false matches (US state, partial country names)
const SPECIAL = {
  georgia: /Tbilisi|Georgian Dream|Kobakhidze|country of Georgia|Republic of Georgia/,
  guinea: /(?<!Equatorial |Papua New |Bissau-)\bGuinea\b(?!-Bissau|\s+Bissau)/,
  niger: /\bNiger\b(?!ia)/, sudan: /(?<!South )\bSudan\b/, congo: null,
  "democratic-republic-of-congo": /\b(DR Congo|DRC|Democratic Republic of (the )?Congo|Congo-Kinshasa|Kinshasa)\b/,
  "republic-of-congo": /\b(Republic of (the )?Congo|Congo-Brazzaville|Brazzaville)\b/,
};
let matchers = null;
function buildMatchers() {
  if (matchers) return matchers;
  matchers = watchlist().map((c) => {
    if (c.slug in SPECIAL) return SPECIAL[c.slug] ? [c.slug, SPECIAL[c.slug]] : null;
    const names = [...new Set([c.name, ...(ALIASES[c.slug] || [])])];
    return [c.slug, new RegExp(`(?<![A-Za-z-])(${names.map(esc).join("|")})(?![A-Za-z])`)];
  }).filter(Boolean);
  return matchers;
}
export const countriesIn = (text) => buildMatchers().filter(([, re]) => re.test(text)).map(([slug]) => slug);
const kindOf = (q) => (COUP.test(q) ? "coup" : EXIT.test(q) ? "exit" : null);

async function getJson(url, ms = 12000) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const num = (v) => (v == null || v === "" ? null : Number(v));
const parseList = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v); } catch { return []; } };

export async function polymarket() {
  const out = [], seen = new Set();
  for (const term of TERMS) {
    const j = await getJson(`https://gamma-api.polymarket.com/public-search?q=${term}&limit_per_type=50&events_status=active&keep_closed_markets=0`);
    for (const ev of Array.isArray(j) ? j : j.events || []) for (const m of ev.markets || []) {
      if (seen.has(m.id) || m.closed || m.active === false) continue;
      const q = m.question || ev.title || "", names = parseList(m.outcomes), prices = parseList(m.outcomePrices).map(Number), i = names.findIndex((n) => /^yes$/i.test(n));
      if (i < 0 || !Number.isFinite(prices[i])) continue;
      seen.add(m.id);
      out.push({ source: "Polymarket", question: q, p: prices[i], volume: num(m.volumeNum ?? m.volume), closes: m.endDate || ev.endDate || null, url: `https://polymarket.com/event/${ev.slug || m.slug}` });
    }
  }
  return out;
}
export async function kalshi() {
  const out = [], t0 = Date.now(); let cursor = "";
  for (let page = 0; page < 30 && Date.now() - t0 < 20000; page++) {          // Kalshi lists thousands of events: scan pages for at most 20 seconds
    const j = await getJson(`https://api.elections.kalshi.com/trade-api/v2/events?status=open&with_nested_markets=true&limit=200${cursor ? `&cursor=${cursor}` : ""}`);
    for (const ev of j.events || []) {
      if (!kindOf(`${ev.title} ${ev.sub_title || ""}`)) continue;
      for (const m of ev.markets || []) {
        const bid = num(m.yes_bid_dollars ?? (m.yes_bid != null ? m.yes_bid / 100 : null)), ask = num(m.yes_ask_dollars ?? (m.yes_ask != null ? m.yes_ask / 100 : null));
        const last = num(m.last_price_dollars ?? (m.last_price != null ? m.last_price / 100 : null));
        const p = bid != null && ask != null && ask > 0 ? (bid + ask) / 2 : last;
        if (p == null) continue;
        out.push({ source: "Kalshi", question: [ev.title, m.yes_sub_title || m.subtitle].filter(Boolean).join(": "), p, volume: num(m.volume), closes: m.close_time || m.expiration_time || null, url: `https://kalshi.com/markets/${(ev.series_ticker || ev.event_ticker || "").toLowerCase()}` });
      }
    }
    cursor = j.cursor; if (!cursor) break;
  }
  return out;
}
export async function manifold() {
  const out = [], seen = new Set();
  for (const term of TERMS) {
    const j = await getJson(`https://api.manifold.markets/v0/search-markets?term=${term}&limit=100&filter=open&sort=liquidity`);
    for (const m of j) {
      if (seen.has(m.id) || m.outcomeType !== "BINARY" || m.isResolved || typeof m.probability !== "number") continue;
      seen.add(m.id);
      out.push({ source: "Manifold", question: m.question, p: m.probability, volume: num(m.volume), closes: m.closeTime ? new Date(m.closeTime).toISOString() : null, url: m.url });
    }
  }
  return out;
}

/** All open coup / leader-exit markets that name a country, grouped by country slug. Cached for 30 minutes. */
export async function allMarkets() {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  const status = {}, rows = [];
  await Promise.all([["Polymarket", polymarket], ["Kalshi", kalshi], ["Manifold", manifold]].map(async ([name, fn]) => {
    try { const r = await fn(); status[name] = { ok: true, n: r.length }; rows.push(...r); } catch (e) { status[name] = { ok: false, error: String(e.message || e).slice(0, 80) }; }
  }));
  const by = {}, unmatched = [];
  for (const m of rows) {
    const kind = kindOf(m.question); if (!kind) continue;
    const closes = m.closes ? Date.parse(m.closes) : null;
    if (closes && closes < Date.now()) continue;
    const slugs = countriesIn(m.question);
    if (!slugs.length) unmatched.push({ source: m.source, kind, question: m.question, p: m.p });
    for (const slug of slugs) (by[slug] ||= []).push({ ...m, kind, months: closes ? Math.max(0, (closes - Date.now()) / (30.44 * 864e5)) : null });
  }
  for (const k of Object.keys(by)) by[k].sort((a, b) => (b.volume || 0) - (a.volume || 0));
  const data = { asOf: new Date().toISOString(), status, by, unmatched, rowsSeen: rows.length };
  if (Object.values(status).some((s) => s.ok)) cache = { at: Date.now(), data };
  return data;
}

/** The model's 6-month probability restated for a market horizon, assuming a constant hazard. */
export const modelAtHorizon = (p6, months) => (p6 == null || months == null || months <= 0 || months > 48 ? null : 1 - Math.pow(1 - p6, months / 6));
