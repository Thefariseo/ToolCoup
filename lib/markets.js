// Prediction markets on coups and leader exits, read from public endpoints (no key needed for reading):
// Polymarket (Gamma API), Kalshi (public market data) and Manifold. Markets are matched to countries by name and
// shown NEXT TO the model, never blended into it: a market's horizon, wording and liquidity differ from our target.
import "server-only";
import { watchlist } from "@/lib/console";
import { ALIASES } from "@/lib/aliases";
import standing from "@/webdata/standing.json";

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
// Adjectives that markets use instead of the country name ("Will the Iranian regime be overthrown?").
const DEMONYMS = {
  "united-states": ["American", "USA", "U.S."], iran: ["Iranian"], russia: ["Russian"], china: ["Chinese"], ukraine: ["Ukrainian"], venezuela: ["Venezuelan"], syria: ["Syrian"], israel: ["Israeli"], turkey: ["Turkish"],
  egypt: ["Egyptian"], "saudi-arabia": ["Saudi"], nigeria: ["Nigerian"], niger: ["Nigerien"], mali: ["Malian"], sudan: ["Sudanese"], ethiopia: ["Ethiopian"], pakistan: ["Pakistani"],
  india: ["Indian"], afghanistan: ["Afghan"], iraq: ["Iraqi"], libya: ["Libyan"], "burkina-faso": ["Burkinabe"], gabon: ["Gabonese"], chad: ["Chadian"], cameroon: ["Cameroonian"],
  uganda: ["Ugandan"], kenya: ["Kenyan"], ghana: ["Ghanaian"], senegal: ["Senegalese"], "ivory-coast": ["Ivorian"], madagascar: ["Malagasy"], "sri-lanka": ["Sri Lankan"],
  bangladesh: ["Bangladeshi"], cuba: ["Cuban"], nicaragua: ["Nicaraguan"], bolivia: ["Bolivian"], peru: ["Peruvian"], colombia: ["Colombian"], brazil: ["Brazilian"],
  argentina: ["Argentine", "Argentinian"], haiti: ["Haitian"], "north-korea": ["North Korean"], "south-korea": ["South Korean"], taiwan: ["Taiwanese"], thailand: ["Thai"],
  myanmar: ["Burmese"], cambodia: ["Cambodian"], philippines: ["Filipino", "Philippine"], indonesia: ["Indonesian"], vietnam: ["Vietnamese"], serbia: ["Serbian"],
  armenia: ["Armenian"], azerbaijan: ["Azerbaijani"], belarus: ["Belarusian"], moldova: ["Moldovan"], hungary: ["Hungarian"], poland: ["Polish"], tunisia: ["Tunisian"],
  algeria: ["Algerian"], morocco: ["Moroccan"], zimbabwe: ["Zimbabwean"], mozambique: ["Mozambican"], somalia: ["Somali"], yemen: ["Yemeni"], lebanon: ["Lebanese"], jordan: ["Jordanian"],
  "democratic-republic-of-congo": ["Congolese"], "central-african-republic": ["Central African"], "guinea-bissau": ["Bissau-Guinean"], burundi: ["Burundian"], rwanda: ["Rwandan"],
  eritrea: ["Eritrean"], "south-sudan": ["South Sudanese"], tanzania: ["Tanzanian"], zambia: ["Zambian"], angola: ["Angolan"], togo: ["Togolese"], benin: ["Beninese"], mauritania: ["Mauritanian"],
};
const SURNAME_SKIP = new Set(["Santos", "Garcia", "Silva"]);
function leaderNames(slug) {
  const l = standing.countries?.[slug]?.leaders; if (!l) return [];
  const out = [];
  for (const full of [l.head_of_state, l.head_of_government]) {
    if (!full) continue;
    out.push(full);
    const sur = full.trim().split(/\s+/).at(-1);
    if (sur.length >= 5 && !SURNAME_SKIP.has(sur)) out.push(sur);                 // markets say "Putin", "Tiani", "Macron"
  }
  return out;
}
let matchers = null;
function buildMatchers() {
  if (matchers) return matchers;
  matchers = watchlist().map((c) => {
    const extra = [...(DEMONYMS[c.slug] || []), ...leaderNames(c.slug)].map(esc);
    const extraRe = extra.length ? `(?<![A-Za-z-])(${[...new Set(extra)].join("|")})(?![A-Za-z])` : null;
    let base;
    if (c.slug in SPECIAL) base = SPECIAL[c.slug] ? SPECIAL[c.slug].source : null;
    else base = `(?<![A-Za-z-])(${[...new Set([c.name, ...(ALIASES[c.slug] || [])])].map(esc).join("|")})(?![A-Za-z])`;
    const parts = [base, extraRe].filter(Boolean);
    return parts.length ? [c.slug, new RegExp(parts.join("|"))] : null;
  }).filter(Boolean);
  return matchers;
}
export const countriesIn = (text) => buildMatchers().filter(([, re]) => re.test(text)).map(([slug]) => slug);
// "Which of these leaders will leave office next?" is one market split across candidates (the probabilities sum to 1): not comparable with a yes/no horizon, so skipped.
const MULTI = /^(which|who|if|conditional)\b/i;                 // also conditional questions ("If X happens, will Y?"): their probability is conditional
const kindOf = (q) => (MULTI.test(q.trim()) ? null : COUP.test(q) ? "coup" : EXIT.test(q) ? "exit" : null);

async function getJson(url, ms = 12000) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms), cache: "no-store" });
    if (res.ok) return res.json();
    if (attempt === 0 && (res.status === 429 || res.status >= 500)) { await new Promise((r) => setTimeout(r, 1500)); continue; }   // one retry on rate limits and server errors
    throw new Error(`HTTP ${res.status}`);
  }
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

const SOURCES = [["Polymarket", polymarket], ["Kalshi", kalshi], ["Manifold", manifold]];
const srcCache = {};                         // last good rows per source, reused for up to a day when a source is down
let lastTry = 0;

/** All open coup / leader-exit markets that name a country, grouped by country slug. Cached for 30 minutes; a failing source falls back to its last good rows. */
export async function allMarkets() {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  if (cache && Date.now() - lastTry < 60000) return cache.data;                // do not hammer the sources right after a failed refresh
  lastTry = Date.now();
  const status = {}, rows = [];
  await Promise.all(SOURCES.map(async ([name, fn]) => {
    try {
      const r = await fn(); srcCache[name] = { at: Date.now(), rows: r };
      status[name] = { ok: true, n: r.length }; rows.push(...r);
    } catch (e) {
      const err = String(e.message || e).slice(0, 80), old = srcCache[name];
      if (old && Date.now() - old.at < 24 * 36e5) { status[name] = { ok: true, stale: true, n: old.rows.length, error: err }; rows.push(...old.rows); }
      else status[name] = { ok: false, error: err };
    }
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
