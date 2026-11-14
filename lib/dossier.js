// Country dossier: facts from our own data, press headlines from an allow-list of outlets, and a
// narrative written by the OpenAI API strictly from those two inputs. Server only: the key never
// reaches the browser.
import "server-only";
import { getCountry, getSummary } from "@/lib/data";
import { watchlist } from "@/lib/console";
import { getRegistry } from "@/lib/registry";
import { labelEn } from "@/lib/english";

export const MODEL = process.env.OPENAI_MODEL || "gpt-5.4";
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

export const strength = (d) => { const a = Math.abs(d); return `${a < 0.3 ? "slight" : a < 0.8 ? "moderate" : a < 1.5 ? "strong" : "very strong"} push ${d >= 0 ? "up" : "down"}`; };
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
    top_drivers: (full.drivers || []).map((d) => ({ driver: labelEn(d.label), effect: strength(d.contrib) })),
    groups: (full.groups || []).map((g) => ({ key: g.key, group: GROUP_EN[g.key] || g.label, effect: strength(g.contrib), contribution_log_odds: g.contrib })),
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

/** Raw series for the PDF charts (kept out of the model prompt). */
export function buildChart(slug) {
  const full = getCountry(slug), hist = full?.risk_hist, series = full?.series, list = watchlist(), me = list.find((c) => c.slug === slug);
  const real = (full?.coups || []).filter((e) => e.type !== "complotto" && e.conf !== "D" && !e.dup);
  const peers = list.filter((c) => c.region === me?.region).slice(0, 7);
  if (me && !peers.some((c) => c.slug === slug)) peers.push(me);
  const acled = {};
  if (series?.unrest?.length) for (const k of ["unrest", "violence", "fatalities"]) {
    const a = series[k], tail = a.slice(-48);
    acled[k] = { values: tail, baseline: mean(tail.slice(0, 36)), last12: mean(tail.slice(-12)) };
  }
  return {
    values: (hist?.values || []).map((v) => v ?? 0),
    events: real.filter((e) => e.prec !== "year").map((e) => ({ date: e.date, outcome: e.type === "riuscito" ? "successful" : "failed" })),
    decades: Object.values(real.reduce((m, e) => { const d = Math.floor(e.year / 10) * 10; (m[d] ||= { decade: d, ok: 0, ko: 0 })[e.type === "riuscito" ? "ok" : "ko"]++; return m; }, {})).sort((a, b) => a.decade - b.decade),
    region: peers.map((c) => ({ name: c.name, p: c.risk, self: c.slug === slug })), regionName: me?.region, baseRate: getSummary().meta.base_rate, acled,
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
const GROUP_KEYS = ["storia", "contagio", "regime", "leader", "economia", "piazza", "acled"];
const str = { type: "string" };
const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["headline", "bottom_line", "history_note", "background", "society_politics", "security_sector", "group_readings", "acled_note", "region_note",
    "current_situation", "scenarios", "watch_next", "press_digest", "caveats"],
  properties: {
    headline: str, bottom_line: str, history_note: str, background: str, society_politics: str, security_sector: str,
    group_readings: { type: "array", items: { type: "object", additionalProperties: false, required: ["group", "reading"], properties: { group: { type: "string", enum: GROUP_KEYS }, reading: str } } },
    acled_note: str, region_note: str,
    current_situation: { type: "object", additionalProperties: false, required: ["text", "refs"], properties: { text: str, refs: { type: "array", items: str } } },
    scenarios: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "description", "signposts"], properties: { name: str, description: str, signposts: { type: "array", items: str } } } },
    watch_next: { type: "array", items: { type: "object", additionalProperties: false, required: ["item", "why"], properties: { item: str, why: str } } },
    press_digest: { type: "array", items: { type: "object", additionalProperties: false, required: ["ref", "takeaway"], properties: { ref: str, takeaway: str } } },
    caveats: { type: "array", items: str },
  },
};
const SYSTEM = `You are a senior political-risk analyst writing a one-country dossier for a coup-risk console. Write in clear, precise English for an informed reader who is not a statistician. The aim is understanding: the country's political, social and historical situation and what it means for coup risk, not a recital of model output.

Inputs: FACTS (our database and model; authoritative for every number and record) and PRESS (recent headlines from vetted outlets; headlines only).

Rules
1. Numbers, dates and records about the forecast, the coup record, ACLED activity and the region come ONLY from FACTS. Quote probabilities as percentages. NEVER quote log-odds, coefficients or other model internals: describe strength in words (slight, moderate, strong, very strong) using the "effect" labels.
2. Three fields may use your general knowledge of the country, because the database does not hold it: "background" (how the country got here: state formation, past regimes and coups, how power has changed hands), "society_politics" (elites, the military's place in politics, ethnic, regional or religious cleavages, economy and grievances, external actors) and "security_sector" (structure and politics of the armed forces and security services, civil-military relations, past mutinies). Keep to well-established facts, name institutions and periods rather than exact figures, and use hedges ("historically", "reportedly") where you are less sure. Never invent precise dates, numbers or quotes. Each of the three is 110 to 160 words; make them specific to THIS country and link them to the risk: say what in the history and structure explains the model's reading, and where the model may miss something.
3. "current_situation" rests on PRESS and FACTS only (80 to 130 words); list the PRESS ids it uses in refs. Headlines support no more than a headline does. If PRESS is empty or thin, say so and lean on the ACLED figures.
4. "bottom_line": 80 to 110 words, the answer first: how worried should a reader be, relative to the base rate and to the region, and the two or three things that drive it. A probability is a probability: never say a coup will or will not happen.
5. "group_readings": exactly one entry per group key (storia, contagio, regime, leader, economia, piazza, acled), one or two plain sentences each on what that family of evidence says about this country and why it pushes the risk up or down, using the "effect" label for strength. These are the explanation under the driver chart.
6. "history_note", "acled_note", "region_note": one or two sentences each reading the corresponding chart for this country (what the reader should notice).
7. "scenarios": exactly three (a continuity case, an escalation case, a de-escalation or stabilising case). Each: a name, 2 to 3 sentences, and 2 to 3 observable signposts. Qualitative: do not assign new probabilities.
8. "watch_next": 3 to 5 concrete items to monitor in the window, with why.
9. "press_digest": one line per PRESS item that matters (at most 8); empty if PRESS is empty.
10. "caveats": always say the figures are model estimates with the stated interval, that background sections come from the analyst's general knowledge and not the database, and add any limit that applies (thin press, missing ACLED data, short history).
11. No hype, no moralising, no filler. Avoid the words "pivotal", "landscape", "tapestry", "delve".`;

async function callOpenAI(body) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(170000), cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function narrate(facts, press) {
  const base = { model: MODEL, max_completion_tokens: 9000,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify({ FACTS: facts, PRESS: press.items.map(({ id, title, outlet, date }) => ({ id, outlet, date, headline: title })), PRESS_NOTE: press.note }) }],
    response_format: { type: "json_schema", json_schema: { name: "dossier", strict: true, schema: SCHEMA } } };
  let out = await callOpenAI({ ...base, reasoning_effort: "low" });
  if (!out.ok && out.status === 400 && /reasoning_effort|unsupported/i.test(out.json?.error?.message || "")) out = await callOpenAI(base);
  if (!out.ok) throw new Error(`OpenAI request failed (${out.status}${out.json?.error?.code ? `, ${out.json.error.code}` : ""})`);
  const text = out.json.choices?.[0]?.message?.content;
  let n; try { n = JSON.parse(text); } catch { throw new Error("OpenAI returned an unreadable answer"); }
  const ids = new Set(press.items.map((p) => p.id));
  n.current_situation.refs = n.current_situation.refs.filter((x) => ids.has(x));
  n.press_digest = n.press_digest.filter((d) => ids.has(d.ref));
  const have = new Set(n.group_readings.map((g) => g.group));
  n.group_readings = n.group_readings.filter((g, i, a) => a.findIndex((h) => h.group === g.group) === i);
  if (GROUP_KEYS.some((k) => !have.has(k))) n.group_readings = n.group_readings.filter((g) => GROUP_KEYS.includes(g.group));
  return n;
}
