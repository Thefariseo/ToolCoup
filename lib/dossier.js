// Country dossier: facts from our own data, press headlines from an allow-list of outlets, and a
// narrative written by the OpenAI API strictly from those two inputs. Server only: the key never
// reaches the browser.
import "server-only";
import { getCountry, getSummary } from "@/lib/data";
import { watchlist } from "@/lib/console";
import { getRegistry } from "@/lib/registry";
import { labelEn } from "@/lib/english";
import { keyMetrics } from "@/lib/country-metrics";

// Dossiers use this model only (no environment override, no fallback).
export const MODEL = "gpt-5.6-luna";
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
    country: { name: me.name, slug, region: me.region, iso: me.iso },
    forecast: {
      issue: registry?.issue ?? meta.forecast_from, window: [meta.forecast_from, meta.forecast_to], data_through: meta.data_end,
      probability_of_at_least_one_coup_attempt: r(me.risk), interval_80: [r(me.risk_lo), r(me.risk_hi)], rank: me.pos, of_countries: list.length,
      base_rate: meta.base_rate, multiple_of_base_rate: r(me.risk / meta.base_rate, 1), probability_3_months_ago: r(me.risk_3m_ago),
      three_month_comparison: meta.change_basis === "same_model" ? "Both input dates evaluated retrospectively with the current model; not an archived past forecast" : "Historical model estimates",
      interval_method: meta.interval_method ?? "Country-resampled refits, fixed calibration",
    },
    model: { description: `Calibrated ensemble of logistic regression, gradient boosting and random forest; target = at least one coup attempt (successful or failed) in the next ${meta.horizon} months.`,
      out_of_sample_auc_since_1975: ens?.auc, brier_skill_since_1975: ens?.brier_skill, share_of_attempts_in_top_10_percent_beforehand: ens?.top10_recall, variables: meta.n_features },
    top_drivers: (full.drivers || []).map((d) => ({ driver: labelEn(d.label), effect: strength(d.contrib) })),
    groups: (full.groups || []).map((g) => ({ key: g.key, group: GROUP_EN[g.key] || g.label, effect: strength(g.contrib), contribution_log_odds: g.contrib })),
    coup_record: {
      attempts_since_1900_confidence_A_to_C: me.attempts, successful: me.successes, last: me.last,
      since_2000: events.filter((e) => e.year >= 2000).length,
      recent_events: events.slice(0, 8).map((e) => ({ date: e.date, precision: e.prec, outcome: e.type === "riuscito" ? "successful" : "failed", confidence: e.conf, scholarly_sources: e.nsch })),
    },
    key_figures: keyMetrics({ ...full, rankOf: list.length }, meta).map((m) => ({ metric: m.label, value: m.value, note: m.sub })),
    own_forecast_history: history, acled_recent: acled,
    structural_evidence: full.diagnostics ?? null,
    country_analysis: full.analysis ?? null,
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
// One search per group of outlets: a single query with every outlet is too long for the search to honour, and returns few results.
const OUTLET_GROUPS = [
  ["reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "aljazeera.com", "france24.com", "rfi.fr"],
  ["dw.com", "theguardian.com", "nytimes.com", "washingtonpost.com", "ft.com", "economist.com", "bloomberg.com"],
  ["voanews.com", "africanews.com", "theafricareport.com", "csmonitor.com", "crisisgroup.org", "reliefweb.int", "news.un.org", "un.org", "criticalthreats.org", "acleddata.com"],
];
export async function fetchPress(slug, name, days = 75, limit = 16) {
  const names = ALIASES[slug] || [name];
  const topics = "coup OR military OR junta OR army OR soldiers OR mutiny OR security OR election OR protest OR government OR president OR politics";
  const notes = [];
  const xmls = await Promise.all(OUTLET_GROUPS.map(async (group) => {
    const q = `(${names.map((n) => `"${n}"`).join(" OR ")}) (${topics}) (${group.map((d) => `site:${d}`).join(" OR ")}) when:${days}d`;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ToolCoup/1.0)" }, signal: AbortSignal.timeout(9000), cache: "no-store" });
      if (!res.ok) { notes.push(`HTTP ${res.status}`); return ""; }
      return await res.text();
    } catch { notes.push("unavailable"); return ""; }
  }));
  const xml = xmls.join("\n");
  if (!xml.trim()) return { items: [], note: `press search ${notes[0] || "unavailable"}` };
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
const arr = (props, req = Object.keys(props)) => ({ type: "array", items: { type: "object", additionalProperties: false, required: req, properties: props } });
const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["headline", "key_takeaways", "bottom_line", "cross_check", "blind_spots", "group_readings", "history_note", "acled_note", "region_note",
    "background", "society_politics", "security_sector", "current_situation", "scenarios", "watch_next", "press_digest", "caveats"],
  properties: {
    headline: str,
    key_takeaways: arr({ title: str, text: str }),
    bottom_line: str,
    cross_check: arr({ theme: str, model: str, media: str, verdict: { type: "string", enum: ["converge", "diverge", "gap"] }, so_what: str }),
    blind_spots: { type: "array", items: str },
    group_readings: arr({ group: { type: "string", enum: GROUP_KEYS }, reading: str }),
    history_note: str, acled_note: str, region_note: str,
    background: str, society_politics: str, security_sector: str,
    current_situation: { type: "object", additionalProperties: false, required: ["text", "refs"], properties: { text: str, refs: { type: "array", items: str } } },
    scenarios: arr({ name: str, description: str, signposts: { type: "array", items: str } }),
    watch_next: arr({ item: str, why: str }),
    press_digest: arr({ ref: str, takeaway: str }),
    caveats: { type: "array", items: str },
  },
};
const SYSTEM = `You are a senior political-risk analyst at an investment-research house, writing a three-page country brief for a coup-risk console. Readers are portfolio managers, diplomats and analysts: informed, short of time, not statisticians. The brief is only worth reading if it tells them something they could not get from the number alone.

Inputs: FACTS (our database and model; authoritative for every number and record) and PRESS (recent headlines from vetted outlets; headlines only).

What makes the brief valuable
- Cross the two sources. The model sees slow structural evidence (regime, history, leader tenure, economy, regional contagion) and monthly ACLED counts. The press sees events, people and decisions. The insight is in where they meet and where they part: press pointing to a threat the model scores low, a structural score high while the street is quiet, a single factor carrying the whole risk, a recent event the annual data cannot yet reflect.
- Be specific to this country. Delete any sentence that would be equally true of another country. Prefer a concrete mechanism, actor, date or number from FACTS/PRESS to a general statement.
- Say what is not obvious: a surprise, a tension, a caveat on how the number should be read. Do not narrate the ranking or restate the probability beyond one mention.

Rules
1. Numbers, dates and records about the forecast, the coup record, ACLED activity and the region come ONLY from FACTS. Quote probabilities as percentages. NEVER quote log-odds, coefficients or model internals: describe strength in words (slight, moderate, strong, very strong) using the "effect" labels.
2. "background", "society_politics" and "security_sector" may use your general knowledge of the country (the database does not hold it): how power has changed hands, elites and cleavages, the military's place and internal politics. Be accurate and cautious; omit anything you are not sure of. Do not invent figures.
3. "current_situation" and every "media" cell rest on PRESS and FACTS only; cite PRESS ids in refs. A headline supports no more than a headline says. If PRESS is empty or thin, say so plainly in the cross-check ("no recent coverage from the vetted outlets") and lean on ACLED.
4. A probability is a probability: never say a coup will or will not happen. No hype, no moralising, no filler. Avoid "pivotal", "landscape", "tapestry", "delve", "amid".
5. Length is a hard limit; the layout has fixed boxes. Count words.

Fields and limits
- headline: ONE sentence, at most 24 words, the thesis of the brief.
- key_takeaways: exactly 4. title at most 6 words; text at most 34 words. The four things a reader must leave with, at least two of which cross the model and the press.
- bottom_line: 60 to 80 words. How worried to be relative to the base rate and to the region, and why.
- cross_check: exactly 5 rows. theme at most 4 words; model at most 18 words (what our evidence says); media at most 18 words (what the headlines or ACLED activity say); verdict converge (they agree), diverge (they point different ways) or gap (one sees something the other cannot); so_what at most 24 words (what it means for the reading of the risk).
- blind_spots: 2 or 3, each at most 28 words: what the model cannot see right now for this country (a very recent change of leader or regime, an election or transition after the annual data, a rumoured plot, a sample-size limit).
- group_readings: exactly one per group key (storia, contagio, regime, leader, economia, piazza, acled), at most 24 words, saying what that family of evidence shows for this country and why it moves the risk, using the "effect" label for strength.
- history_note, acled_note, region_note: one sentence each, at most 26 words, what to notice in the chart.
- background, society_politics, security_sector: at most 62 words each.
- current_situation.text: at most 85 words.
- scenarios: exactly 3 (continuity, escalation, stabilisation): name at most 4 words, description at most 38 words, exactly 2 signposts of at most 10 words each. Qualitative; no new probabilities.
- watch_next: exactly 4: item at most 10 words, why at most 20 words.
- press_digest: at most 6, only items that matter: ref and takeaway at most 16 words. Empty if PRESS is empty.
- caveats: 2 or 3, each at most 26 words: figures are model estimates with the stated interval; background sections are from the analyst's general knowledge, not the database; plus any limit that applies.`;

async function callOpenAI(body) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(170000), cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function narrate(facts, press) {
  const base = { model: MODEL, max_completion_tokens: 8000,
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
