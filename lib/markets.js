// Prediction markets on coups and leader exits, read from public endpoints (no key needed for reading):
// Polymarket (Gamma API) and Kalshi (public market data); both trade real money. Manifold, which trades play money, is not read. Markets are matched to countries by name and
// shown NEXT TO the model, never blended into it: a market's horizon, wording and liquidity differ from our target.
import "server-only";
import https from "node:https";
import { watchlist } from "@/lib/console";
import { ALIASES } from "@/lib/aliases";
import { kalshiQuote, modelAtHorizon as horizon, primaryMarket } from "@/lib/market-pick";
import terms from "@/webdata/terms.json";
import snapshot from "@/webdata/markets-snapshot.json";
import standing from "@/webdata/standing.json";

// "junta" alone is not a coup question: "Will the junta still be in control?" prices the opposite event
const COUP = /\b(coup|coups|overthrow|overthrown|ouster|ousted|military takeover|seize power|seizes power)\b/i;
const STAY = /\b(still|remain|remains|remaining|stay|stays|survive|survives|continue|continues)\b[^?]*\b(power|control|office|in charge)\b/i;
const EXIT = /\b(leave office|step down|resign|resigns|removed from (power|office)|out as (president|prime minister)|regime (change|collapse|fall))\b/i;
const UA = { "User-Agent": "Mozilla/5.0 (compatible; Praevex/1.0)", Accept: "application/json" };
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
/** The countries named in a text, in order of first appearance: [[slug, index], ...]. */
export const countryHits = (text) => buildMatchers().map(([slug, re]) => [slug, text.search(re)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
// "Which of these leaders will leave office next?" is one market split across candidates (the probabilities sum to 1): not comparable with a yes/no horizon, so skipped.
const MULTI = /^(which|who|if|conditional)\b/i;                 // also conditional questions ("If X happens, will Y?"): their probability is conditional
const kindOf = (q) => (MULTI.test(q.trim()) || STAY.test(q) ? null : COUP.test(q) ? "coup" : EXIT.test(q) ? "exit" : null);

/** True when the failure is the network refusing the connection to a betting site (the certificate served is the regulator's block page). */
const blocked = (e) => /sito-inibito|adm\.gov|ERR_TLS_CERT|altnames|certificate/i.test(`${e?.cause?.code || ""} ${e?.cause?.reason || ""} ${e?.cause?.message || ""} ${e?.message || ""}`);
// Where the network refuses these hosts (Italy: the regulator's resolver and block page), the addresses are looked up over encrypted DNS and the
// request goes to the real servers directly. It only starts after a direct request fails with the block's signature, so on a normal network (and on
// Vercel) nothing changes. Set MARKETS_NO_DOH=1 to turn it off.
let viaDoh = false;
const ips = new Map();
async function realIp(host) {
  const hit = ips.get(host); if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.ip;
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(6000), cache: "no-store" });
  const ip = (await res.json()).Answer?.find((a) => a.type === 1)?.data;
  if (!ip) throw new Error(`no address for ${host}`);
  ips.set(host, { ip, at: Date.now() }); return ip;
}
async function getJsonDoh(url, ms) {
  const u = new URL(url), ip = await realIp(u.hostname);
  return new Promise((resolve, reject) => {
    const req = https.get(u, { headers: UA, timeout: ms, lookup: (_h, opts, cb) => (opts?.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4)) }, (res) => {
      if (res.statusCode >= 400) { res.resume(); reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode })); return; }
      const chunks = []; res.on("data", (c) => chunks.push(c));
      res.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (e) { reject(e); } });
    });
    req.on("timeout", () => req.destroy(new Error("timeout"))); req.on("error", reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, ms = 12000) {
  for (let attempt = 0; ; attempt++) {
    try {
      if (viaDoh) return await getJsonDoh(url, ms);
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms), cache: "no-store" });
      if (res.ok) return res.json();
      throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    } catch (e) {
      if (!viaDoh && blocked(e) && process.env.MARKETS_NO_DOH !== "1") { viaDoh = true; continue; }
      const again = attempt < 3 && (e.status === 429 || e.status >= 500 || (!e.status && viaDoh));   // rate limit, server error, dropped connection: wait and retry
      if (again) { await sleep(1200 * (attempt + 1)); continue; }
      throw e;
    }
  }
}
const num = (v) => (v == null || v === "" ? null : Number(v));
const parseList = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v); } catch { return []; } };

export async function polymarket() {
  const out = [], seen = new Set();
  const pages = [];
  for (const term of TERMS) for (let page = 1; page <= 3; page++) pages.push([term, page]);
  const results = await Promise.all(pages.map(async ([term, page]) => {
    try { return await getJson(`https://gamma-api.polymarket.com/public-search?q=${term}&limit_per_type=50&page=${page}&events_status=active&keep_closed_markets=0`); }
    catch (e) { if (page === 1) throw e; return []; }                         // a later page may simply not exist
  }));
  for (const j of results) {
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
/** Kalshi lists thousands of open events, so the scan is in two passes: event titles only (light pages) to find the ones that read like a
 *  coup or leader-exit question, then the markets of just those events. `out.scan` says how far the scan got, so an empty result can be told
 *  apart from a scan that ran out of time. */
export async function kalshi() {
  const t0 = Date.now(), scan = { pages: 0, events: 0, matched: 0, capped: false }, hits = [], out = [];
  let cursor = "";
  for (; scan.pages < 240; scan.pages++) {
    if (Date.now() - t0 > 38000) { scan.capped = true; break; }
    let j;
    try { j = await getJson(`https://api.elections.kalshi.com/trade-api/v2/events?status=open&limit=200${cursor ? `&cursor=${cursor}` : ""}`); }
    catch (e) { if (scan.pages === 0) throw e; scan.capped = true; scan.error = String(e.message || e).slice(0, 60); break; }   // keep what the earlier pages found
    for (const ev of j.events || []) { scan.events++; if (kindOf(`${ev.title} ${ev.sub_title || ""}`)) hits.push(ev); }
    cursor = j.cursor; if (!cursor) break;
    await sleep(70);
  }
  scan.matched = hits.length;
  const todo = hits.slice(0, 40);
  await Promise.all(Array.from({ length: 3 }, async () => {                               // three workers: the markets of each matched event
    for (let ev = todo.shift(); ev; ev = todo.shift()) {
      try {
        const j = await getJson(`https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=${encodeURIComponent(ev.event_ticker)}&status=open&limit=100`, 8000);
        for (const m of j.markets || []) {
          const q = kalshiQuote(m); if (!q) continue;
          out.push({ source: "Kalshi", question: [ev.title, m.yes_sub_title || m.subtitle].filter(Boolean).join(": "), p: q.p, volume: q.volume, closes: m.close_time || m.expiration_time || null, url: `https://kalshi.com/markets/${(ev.series_ticker || ev.event_ticker || "").toLowerCase()}` });
        }
      } catch { /* one event failing does not sink the others */ }
    }
  }));
  out.scan = scan;
  return out;
}
const SOURCES = [["Polymarket", polymarket], ["Kalshi", kalshi]];
const asRows = (name) => snapshot.rows.filter((r) => r.source === name);
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
      status[name] = { ok: true, n: r.length, ...(viaDoh ? { via: "encrypted DNS" } : {}), ...(r.scan ? { scan: r.scan } : {}) }; rows.push(...r);
    } catch (e) {
      const err = String(e.message || e).slice(0, 80), old = srcCache[name];
      if (old && Date.now() - old.at < 24 * 36e5) { status[name] = { ok: true, stale: true, n: old.rows.length, error: err }; rows.push(...old.rows); }
      else {
        const snap = asRows(name);                                              // never a blank page: the last good reading, dated
        if (snap.length) { status[name] = { ok: false, fallback: "snapshot", asOf: snapshot.asOf, n: snap.length, blocked: blocked(e), error: err }; rows.push(...snap); }
        else status[name] = { ok: false, blocked: blocked(e), error: err };
      }
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

/** The model's 6-month probability restated for a market horizon, with the fitted term structure (webdata/terms.json). */
export const modelAtHorizon = (p6, months) => horizon(p6, months, terms);
export { primaryMarket };
