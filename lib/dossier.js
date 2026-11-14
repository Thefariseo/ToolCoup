// Country dossier: facts from our own data, press headlines from an allow-list of outlets, and a
// narrative written by the OpenAI API strictly from those two inputs. Server only: the key never
// reaches the browser.
import "server-only";
import { getCountry, getSummary } from "@/lib/data";
import { watchlist } from "@/lib/console";
import { getRegistry } from "@/lib/registry";
import { labelEn } from "@/lib/english";

export const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const GROUP_EN = { storia: "Coup history", contagio: "Regional and global contagion", regime: "Regime type and strength", leader: "Leader and elections",
  economia: "Economy and development", piazza: "Mobilization and political violence", acled: "Monthly ACLED signals", tempo: "Long-run trend" };

// Outlets whose headlines may enter a dossier. Anything else returned by the search is dropped.
export const PRESS_SOURCES = {
  "reuters.com": "Reuters", "apnews.com": "Associated Press", "bbc.com": "BBC", "bbc.co.uk": "BBC", "aljazeera.com": "Al Jazeera",
  "france24.com": "France 24", "rfi.fr": "RFI", "dw.com": "Deutsche Welle", "theguardian.com": "The Guardian", "nytimes.com": "The New York Times",
  "washingtonpost.com": "The Washington Post", "ft.com": "Financial Times", "economist.com": "The Economist", "bloomberg.com": "Bloomberg",
  "voanews.com": "Voice of America", "africanews.com": "Africanews", "theafricareport.com": "The Africa Report", "csmonitor.com": "Christian Science Monitor",
  "crisisgroup.org": "International Crisis Group", "reliefweb.int": "ReliefWeb (UN OCHA)", "news.un.org": "UN News", "un.org": "United Nations",
  "criticalthreats.org": "Critical Threats (AEI)", "acleddata.com": "ACLED",
};
const ALIASES = {
  "ivory-coast": ["Ivory Coast", "Côte d'Ivoire", "Cote d'Ivoire"],
  "democratic-republic-of-congo": ["DR Congo", "DRC", "Democratic Republic of Congo", "Congo-Kinshasa"],
  "republic-of-congo": ["Republic of Congo", "Congo-Brazzaville"],
  "myanmar": ["Myanmar", "Burma"], "eswatini": ["Eswatini", "Swaziland"], "east-timor": ["East Timor", "Timor-Leste"],
};

const esc = (re) => re.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const ym = (s) => { const [y, m] = s.split("-").map(Number); return y * 12 + m - 1; };
const label = (t) => `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
const r = (v, d = 4) => (v == null ? null : +v.toFixed(d));

export function dossierKnown(slug) {
  return watchlist().some((c) => c.slug === slug);
}

/** Everything the dossier states as a number or a record. Nothing here comes from a language model. */
export function buildFacts(slug) {
  const list = watchlist(), me = list.find((c) => c.slug === slug), full = getCountry(slug);
  if (!me || !full) return null;
  const { meta, metrics } = getSummary(), ens = metrics.find((m) => m.key === "ensemble")?.all;
  const hist = full.risk_hist, series = full.series;

  let history = null;
  if (hist?.values?.length) {
    const vals = hist.values.filter((v) => v != null), t0 = ym(hist.start), idx = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0])[0];
    const cur = hist.values.at(-1);
    history = {
      series_from: hist.start, series_to: label(t0 + hist.values.length - 1), peak: r(idx[0]), peak_month: label(t0 + hist.values.findIndex((v) => v === idx[0])),
      median: r(vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)]),
      current_percentile_in_own_history: r(vals.filter((v) => v <= cur).length / vals.length, 2),
      last_12_months: hist.values.slice(-12).map((v) => r(v)),
    };
  }
  let acled = null;
  if (series?.unrest?.length) {
    const n = series.unrest.length, end = ym(series.start) + n - 1, out = { data_through: label(end), monthly_counts_last_12: {}, baseline_36_months_before: {} };
    for (const [k, name] of [["unrest", "protests_and_riots"], ["violence", "political_violence_events"], ["fatalities", "reported_fatalities"], ["infighting", "strategic_events_between_state_forces"]]) {
      const a = series[k], last = a.slice(-12), base = a.slice(-48, -12);
      out.monthly_counts_last_12[name] = last;
      out.baseline_36_months_before[name] = { mean_per_month: r(mean(base), 1), last_12_mean_per_month: r(mean(last), 1), ratio: base.length >= 12 && mean(base) > 0 ? r(mean(last) / mean(base), 2) : null };
    }
    acled = out;
  }
  const events = (full.coups || []).filter((e) => e.type !== "complotto" && e.conf !== "D" && !e.dup)
    .sort((a, b) => b.date.localeCompare(a.date));
  const peers = list.filter((c) => c.region === me.region);
  const registry = getRegistry().issues[0];

  return {
    country: { name: me.name, slug, region: me.region },
    forecast: {
      issue: registry?.issue ?? meta.forecast_from, window: [meta.forecast_from, meta.forecast_to], data_through: meta.data_end,
      probability_of_at_least_one_coup_attempt: r(me.risk), interval_80: [r(me.risk_lo), r(me.risk_hi)], rank: me.pos, of_countries: list.length,
      base_rate: meta.base_rate, multiple_of_base_rate: r(me.risk / meta.base_rate, 1), probability_3_months_ago: r(me.risk_3m_ago),
    },
    model: { description: "Calibrated ensemble of logistic regression, gradient boosting and random forest; target = at least one coup attempt (successful or failed) in the next 6 months.",
      out_of_sample_auc_since_1975: ens?.auc, brier_skill_since_1975: ens?.brier_skill, share_of_attempts_in_top_10_percent_beforehand: ens?.top10_recall, variables: meta.n_features },
    drivers_linear_component_log_odds: (full.drivers || []).map((d) => ({ driver: labelEn(d.label), contribution: d.contrib })),
    groups_log_odds: (full.groups || []).map((g) => ({ group: GROUP_EN[g.key] || g.label, contribution: g.contrib })),
    coup_record: {
      attempts_since_1900_confidence_A_to_C: me.attempts, successful: me.successes, last: me.last,
      since_2000: events.filter((e) => e.year >= 2000).length,
      recent_events: events.slice(0, 8).map((e) => ({ date: e.date, precision: e.prec, outcome: e.type === "riuscito" ? "successful" : "failed", confidence: e.conf, scholarly_sources: e.nsch })),
    },
    own_forecast_history: history, acled_recent: acled,
    region: { name: me.region, countries: peers.length, mean_probability: r(mean(peers.map((c) => c.risk))),
      highest: peers.slice(0, 5).map((c) => ({ country: c.name, probability: r(c.risk), rank: c.pos })) },
  };
}

/** Raw series for the PDF chart (kept out of the model prompt). */
export function buildChart(slug) {
  const full = getCountry(slug), hist = full?.risk_hist;
  return {
    values: (hist?.values || []).map((v) => v ?? 0),
    events: (full?.coups || []).filter((e) => e.type !== "complotto" && e.conf !== "D" && !e.dup && e.prec !== "year")
      .map((e) => ({ date: e.date, outcome: e.type === "riuscito" ? "successful" : "failed" })),
  };
}

// ------------------------------------------------------------------ press
const decode = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const sourceOf = (host) => { const k = Object.keys(PRESS_SOURCES).find((d) => host === d || host.endsWith("." + d)); return k ? PRESS_SOURCES[k] : null; };

/** Recent headlines about the country from allow-listed outlets only (Google News RSS; headline, outlet, date, link). */
export async function fetchPress(slug, name, days = 60, limit = 14) {
  const names = ALIASES[slug] || [name];
  const sites = Object.keys(PRESS_SOURCES).map((d) => `site:${d}`).join(" OR ");
  const topics = "coup OR military OR junta OR army OR soldiers OR mutiny OR security OR election OR protest OR government OR president";
  const q = `(${names.map((n) => `"${n}"`).join(" OR ")}) (${topics}) (${sites}) when:${days}d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  let xml = "";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ToolCoup/1.0)" }, signal: AbortSignal.timeout(9000), cache: "no-store" });
    if (!res.ok) return { items: [], note: `press search returned HTTP ${res.status}` };
    xml = await res.text();
  } catch (e) {
    return { items: [], note: "press search unavailable" };
  }
  const mention = new RegExp(`\\b(${names.map(esc).join("|")})\\b`, "i");
  const seen = new Set(), items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1], src = it.match(/<source url="([^"]*)"/)?.[1] || "", outlet = sourceOf(hostOf(src));
    if (!outlet) continue;
    let title = decode(it.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
    title = title.replace(/\s+-\s+[^-]{2,40}$/, "");
    const date = new Date(it.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "");
    const key = title.toLowerCase().slice(0, 70);
    if (!title || isNaN(date) || date.getTime() < Date.now() - days * 864e5 || seen.has(key) || !mention.test(title)) continue;   // the search ignores `when:` once the query is long
    if (slug === "guinea" && /Bissau|Equatorial|Papua/i.test(title)) continue;
    seen.add(key);
    items.push({ title, outlet, domain: hostOf(src), date: date.toISOString().slice(0, 10), url: decode(it.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "") });
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  return { items: items.slice(0, limit).map((x, i) => ({ id: `P${i + 1}`, ...x })), note: items.length ? null : `no headlines from the listed outlets in the last ${days} days` };
}

// ------------------------------------------------------------------ narrative
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["headline", "situation", "indicators", "press_digest", "watch_next", "caveats"],
  properties: {
    headline: { type: "string" },
    situation: { type: "string" },
    indicators: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "reading", "direction", "basis", "evidence", "refs"],
      properties: { name: { type: "string" }, reading: { type: "string" }, direction: { type: "string", enum: ["raises", "lowers", "mixed"] },
        basis: { type: "string", enum: ["model", "acled", "history", "region", "press"] }, evidence: { type: "string" }, refs: { type: "array", items: { type: "string" } } } } },
    press_digest: { type: "array", items: { type: "object", additionalProperties: false, required: ["ref", "takeaway"], properties: { ref: { type: "string" }, takeaway: { type: "string" } } } },
    watch_next: { type: "array", items: { type: "object", additionalProperties: false, required: ["item", "why"], properties: { item: { type: "string" }, why: { type: "string" } } } },
    caveats: { type: "array", items: { type: "string" } },
  },
};
const SYSTEM = `You write one-country dossiers for a coup-risk console. Plain, precise English; no hype.
Rules:
1. Use ONLY the FACTS and PRESS in the user message. No outside knowledge: no extra dates, names, numbers or events.
2. FACTS come from a statistical model and a coup database. A probability is a probability: never say a coup will or will not happen. Quote numbers exactly as given; express probabilities as percentages.
3. PRESS items are headlines only. Cite every statement taken from them with their ids in "refs" (P1, P2...), and do not claim detail beyond what a headline supports.
4. Keep model-based reading and press-based reading apart. If they diverge (e.g. quiet press, high score, or the reverse) say so plainly.
5. "indicators": 5 to 8 risk indicators, most important first. basis = model | acled | history | region | press. Tie each to specific FACTS or PRESS ids. direction says whether it raises or lowers risk. "evidence" is one plain-English sentence naming the data (e.g. "model driver: military influence in government, +1.09 log-odds"); never print JSON field names or keys.
6. "situation": about 120 to 170 words: where the country stands, why the model scores it as it does, what the press adds.
7. "press_digest": one line per PRESS item that matters (at most 8). If PRESS is empty, return an empty list and say so in caveats.
8. "watch_next": 3 to 5 concrete things to monitor over the forecast window, each grounded in the inputs.
9. "caveats": always note that the figures are model estimates with the given interval, and add any limit that applies (thin press, missing ACLED data, short history).`;

async function callOpenAI(body) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(110000), cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function narrate(facts, press) {
  const base = { model: MODEL, max_completion_tokens: 6000,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify({ FACTS: facts, PRESS: press.items.map(({ id, title, outlet, date }) => ({ id, outlet, date, headline: title })), PRESS_NOTE: press.note }) }],
    response_format: { type: "json_schema", json_schema: { name: "dossier", strict: true, schema: SCHEMA } } };
  let out = await callOpenAI({ ...base, reasoning_effort: "low" });
  if (!out.ok && out.status === 400 && /reasoning_effort|unsupported/i.test(out.json?.error?.message || "")) out = await callOpenAI(base);
  if (!out.ok) throw new Error(`OpenAI request failed (${out.status}${out.json?.error?.code ? `, ${out.json.error.code}` : ""})`);
  const text = out.json.choices?.[0]?.message?.content;
  let n; try { n = JSON.parse(text); } catch { throw new Error("OpenAI returned an unreadable answer"); }
  // keep only citations that point at real press items; a press-based indicator without one is dropped
  const ids = new Set(press.items.map((p) => p.id));
  n.indicators = n.indicators.map((i) => ({ ...i, refs: i.refs.filter((x) => ids.has(x)) })).filter((i) => i.basis !== "press" || i.refs.length);
  n.press_digest = n.press_digest.filter((d) => ids.has(d.ref));
  return n;
}
