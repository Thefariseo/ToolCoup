// Country dossier: facts from our own data, press headlines from an allow-list of outlets, and a
// narrative written by the OpenAI API strictly from those two inputs. Server only: the key never
// reaches the browser.
import "server-only";
import { getCountry, getSummary } from "@/lib/data";
import { watchlist } from "@/lib/console";
import { getRegistry } from "@/lib/registry";
import { labelEn } from "@/lib/english";
import { keyMetrics } from "@/lib/country-metrics";
import { getAnalogs, getViolence } from "@/lib/outlook";
import { ensembleDescription } from "@/lib/model-names";
import { PRESS_SOURCES } from "@/lib/outlets";
import { buildProfile, cleanEvents, LENSES, lensOf } from "@/lib/dossier-profile";
import { tracePeers } from "@/lib/trace-peers";
import { ledgerModel } from "@/components/console/ledger";

// Dossiers use this model only (no environment override, no fallback).
export const MODEL = "gpt-6-luna";
const GROUP_EN = { storia: "Coup history", contagio: "Regional and global contagion", regime: "Regime type and strength", leader: "Leader and elections",
  economia: "Economy and development", piazza: "Mobilization and political violence", acled: "Monthly ACLED signals", tempo: "Long-run trend" };

// Outlets whose headlines may enter a dossier: the list lives in lib/outlets.js, shared with the ticker.
export { PRESS_SOURCES };

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
export function buildFacts(slug, lensKey = "analyst") {
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
  const events = cleanEvents(full.coups);
  const peers = list.filter((c) => c.region === me.region);
  const registry = getRegistry().issues[0];

  const facts = {
    country: { name: me.name, slug, region: me.region, iso: me.iso },
    forecast: {
      issue: registry?.issue ?? meta.forecast_from, window: [meta.forecast_from, meta.forecast_to], data_through: meta.data_end,
      probability_of_at_least_one_coup_attempt: r(me.risk), interval_80: [r(me.risk_lo), r(me.risk_hi)], rank: me.pos, of_countries: list.length,
      base_rate: meta.base_rate, multiple_of_base_rate: r(me.risk / meta.base_rate, 1), probability_3_months_ago: r(me.risk_3m_ago),
      three_month_comparison: meta.change_basis === "same_model" ? "Both input dates evaluated retrospectively with the current model; not an archived past forecast" : "Historical model estimates",
      interval_method: meta.interval_method ?? "Country-resampled refits, fixed calibration",
    },
    model: { description: `Calibrated ensemble of ${ensembleDescription(meta)}; target = at least one coup attempt (successful or failed) in the next ${meta.horizon} months.`, components: ensembleDescription(meta),
      out_of_sample_auc_since_1975: ens?.auc, brier_skill_since_1975: ens?.brier_skill, share_of_attempts_in_top_10_percent_beforehand: ens?.top10_recall, variables: meta.n_features },
    top_drivers: (full.drivers || []).map((d) => ({ driver: labelEn(d.label), effect: strength(d.contrib) })),
    groups: (full.groups || []).map((g) => ({ key: g.key, group: GROUP_EN[g.key] || g.label, effect: strength(g.contrib), contribution_log_odds: g.contrib })),
    coup_record: {
      attempts_since_1900_confidence_A_to_C: events.length, successful: events.filter((e) => e.type === "riuscito").length, last: events[0] ? { date: events[0].date, type: events[0].type } : null,
      since_2000: events.filter((e) => e.year >= 2000).length,
      recent_events: events.slice(0, 8).map((e) => ({ date: e.date, precision: e.prec, outcome: e.type === "riuscito" ? "successful" : "failed", confidence: e.conf, scholarly_sources: e.nsch })),
    },
    key_figures: keyMetrics({ ...full, rankOf: list.length }, meta).map((m) => ({ metric: m.label, value: m.value, note: m.sub })),
    own_forecast_history: history, acled_recent: acled,
    historical_analogs: (() => { const a = getAnalogs(slug); return a ? { cases_compared: a.k, share_followed_by_attempt_within_6m: a.rate, pool_base_rate: a.base, closest: a.nearest.slice(0, 4).map((c) => `${c.country} ${c.month}${c.attempt_within_6m ? " (attempt followed)" : ""}`) } : null; })(),
    violence_outlook: (() => { const v = getViolence(slug); if (!v) return null; const f = v.country.fc.o, six = f.reduce((t, x) => t + x[0], 0) / f.length; return { unit: "ACLED organized-violence events per four-week period", last_6_period_average: v.country.ma6, next_period_forecast: f[0][0], next_period_interval: [f[0][1], f[0][2]], next_six_average: +six.toFixed(1), change_vs_last_6: v.country.ma6 > 0 ? +(six / v.country.ma6 - 1).toFixed(2) : null, top_provinces: v.admin1.slice(0, 3).map((a) => a.name) }; })(),
    structural_evidence: full.diagnostics ?? null,
    country_analysis: full.analysis ?? null,
    region: { name: me.region, countries: peers.length, mean_probability: r(mean(peers.map((c) => c.risk))),
      highest: peers.slice(0, 5).map((c) => ({ country: c.name, probability: r(c.risk), rank: c.pos })) },
  };
  const lens = LENSES[lensOf(lensKey)];
  facts.reader = { lens: lensOf(lensKey), reader: lens.reader, needs: lens.wants };
  facts.profile = buildProfile({ slug, me, full, facts, list, analogs: getAnalogs(slug) });
  return facts;
}

/** Raw series for the PDF charts (kept out of the model prompt). */
export function buildChart(slug) {
  const full = getCountry(slug), hist = full?.risk_hist, series = full?.series, list = watchlist(), me = list.find((c) => c.slug === slug);
  const real = cleanEvents(full?.coups);
  const peers = list.filter((c) => c.region === me?.region).slice(0, 7);
  if (me && !peers.some((c) => c.slug === slug)) peers.push(me);
  const acled = {};
  if (series?.unrest?.length) for (const k of ["unrest", "violence", "fatalities"]) {
    const a = series[k], tail = a.slice(-48);
    acled[k] = { values: tail, baseline: mean(tail.slice(0, 36)), last12: mean(tail.slice(-12)) };
  }
  const tp = tracePeers(), v = getViolence(slug), an = getAnalogs(slug), t0 = hist?.start ? ym(hist.start) : null;
  // the Model Trace ledger (reference country -> groups -> logistic -> average -> published), the same pure model the console draws
  const ledger = me && full?.groups?.length && tp.ref != null && me.risk != null
    ? ledgerModel({ groups: full.groups, components: full.diagnostics?.components, risk: me.risk, lo: me.risk_lo, hi: me.risk_hi, ref: tp.ref, peers: tp.peers, imputed: me.structural === false }) : null;
  return {
    values: (hist?.values || []).map((v_) => v_ ?? 0), seriesStart: hist?.start ?? null, seriesT0: t0,
    events: real.filter((e) => e.prec !== "year").map((e) => ({ date: e.date, outcome: e.type === "riuscito" ? "successful" : "failed" })),
    // every recorded attempt since 1900 as a fractional year, for the long rail (year-only records sit mid-year)
    record: real.map((e) => { const [y, m] = e.date.split("-").map(Number); return { t: y + ((e.prec === "year" || !m ? 6 : m) - 0.5) / 12, outcome: e.type === "riuscito" ? "successful" : "failed", conf: e.conf }; }).sort((a, b) => a.t - b.t),
    decades: Object.values(real.reduce((m, e) => { const d = Math.floor(e.year / 10) * 10; (m[d] ||= { decade: d, ok: 0, ko: 0 })[e.type === "riuscito" ? "ok" : "ko"]++; return m; }, {})).sort((a, b) => a.decade - b.decade),
    region: peers.map((c) => ({ name: c.name, p: c.risk, self: c.slug === slug })), regionName: me?.region, baseRate: getSummary().meta.base_rate, acled,
    all: list.map((c) => ({ slug: c.slug, p: c.risk, region: c.region, self: c.slug === slug })).filter((c) => c.p != null),
    risk: me ? { p: me.risk, lo: me.risk_lo, hi: me.risk_hi, ago3: me.risk_3m_ago } : null,
    ledger,
    violence: v && (v.country.ma6 >= 3 || Math.max(...v.country.fc.o.map((f) => f[2])) >= 3) ? { hist: v.country.hist.o, fc: v.country.fc.o, ma6: v.country.ma6, last: v.meta.last_period_end } : null,
    analogs: an ? { k: an.k, rate: an.rate, base: an.base, cases: an.nearest.map((c) => ({ country: c.country, month: c.month, attempt: !!c.attempt_within_6m })) } : null,
  };
}

// ------------------------------------------------------------------ press

export { fetchPress } from "@/lib/dossier-press";

// ------------------------------------------------------------------ narrative
const GROUP_KEYS = ["storia", "contagio", "regime", "leader", "economia", "piazza", "acled"];
const str = { type: "string" };
const arr = (props, req = Object.keys(props)) => ({ type: "array", items: { type: "object", additionalProperties: false, required: req, properties: props } });
const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["headline", "key_takeaways", "bottom_line", "evidence", "markets_read", "group_readings", "history_note", "acled_note", "region_note",
    "background", "society_politics", "security_sector", "current_situation", "scenarios", "lens_note", "lens_actions", "press_digest", "caveats"],
  properties: {
    headline: str,
    key_takeaways: arr({ title: str, text: str }),
    bottom_line: str,
    evidence: arr({ theme: str, finding: str, reporting: str, refs: { type: "array", items: str }, direction: { type: "string", enum: ["up", "down", "watch"] }, implication: str }),
    markets_read: str,
    group_readings: arr({ group: { type: "string", enum: GROUP_KEYS }, reading: str }),
    history_note: str, acled_note: str, region_note: str,
    background: str, society_politics: str, security_sector: str,
    current_situation: { type: "object", additionalProperties: false, required: ["text", "refs"], properties: { text: str, refs: { type: "array", items: str } } },
    scenarios: arr({ name: str, description: str, signposts: { type: "array", items: str } }),
    lens_note: str,
    lens_actions: arr({ action: str, why: str }),
    press_digest: arr({ ref: str, takeaway: str }),
    caveats: { type: "array", items: str },
  },
};

// Who writes depends on who reads: the evidence is the same for every reader, the voice and the "so what" are not.
const PERSONAS = {
  analyst: "a senior political-risk analyst with a quantitative background. You read a forecast the way an econometrician does (base rates, effect sizes, what an interval allows and what it does not) and write the way a good country desk does (mechanisms, actors, dates).",
  investor: "a sovereign-risk strategist at a macro fund. You turn political-risk evidence into positioning terms: what is likely priced and what is not, which events would force a change of view, over what horizon, and how far the number can be trusted.",
  policy: "a senior policy officer trained in econometrics, advising a foreign ministry or a multilateral. You think in leverage, sequencing and cost: who can move whom, which dates open or close room for action, what acting too early or too late would cost.",
  newsroom: "a foreign-desk editor who also works with data. You lead with what is new, say exactly what the number supports and what it does not, and mark what is easy to get wrong in print. Your sentences are plain, concrete and quotable.",
  aid: "a humanitarian risk adviser who has run operations in unstable countries. You think in access, staff safety, supply lines and continuity: where instability would reach programmes first and which early signs matter.",
};

const systemPrompt = (lensKey) => `You are ${PERSONAS[lensKey] || PERSONAS.analyst}

You are writing the text of a four-page country brief on coup risk, for ${LENSES[lensKey]?.reader || "an analyst"}, who wants ${LENSES[lensKey]?.wants || "the evidence"}. The brief is a finished piece of professional analysis that the reader paid for. It is worth reading only if it tells them something the number alone does not, in the voice of someone who knows the country and the field.

Inputs
- FACTS: our database and forecast. Authoritative for every number, date and record. It holds the forecast and its interval, the coup record, V-Dem regime indicators, ACLED activity and our violence outlook, the closest historical analogs (what followed the most similar country-months), the contribution of each group of evidence, the regional picture, prediction markets (what traders with money at stake price, with the market's own horizon, and our estimate restated for that horizon), and a profile with the country's situation and its signposts.
- PRESS: recent headlines from vetted outlets, found by searches built from what the data suggest. Each item carries the angle it was searched for. PRESS_PLAN says what each angle was and why it was searched: it is the reason that reporting matters to this country. Headlines only: a headline supports no more than it says. Use the headlines that name actors, decisions or dates; leave out those that add nothing to the evidence.
- FACTS.hybrid, when present: our experimental pooled reading of the model, the prediction markets (restated as a six-month probability) and an analyst who read recent headlines without seeing our forecast. It has no track record yet. Mention it at most once, call it experimental, and use it to say where the readings agree or part, never to replace the forecast.
- TODAY: the date. Everything in PRESS is recent; say "last month" or give the date, not "recently".
- Your own knowledge of the country: its history, institutions, actors, scheduled events. Use it to explain and to connect; it is the only source for the context sections. Never for figures about the forecast, the record or ACLED.

What separates this from a news digest
- Lead with the finding, then the evidence, then what it means for this reader. Every paragraph has a claim, not a topic.
- Compare. A number means something against a base rate, the region, the country's own history, the analogs, the market, or a threshold. Say which comparison matters here and why.
- Find the one or two things that carry the estimate (the largest group of evidence, a record that dominates, a recent change) and say whether each is a stock that will not move in six months or a flow that can.
- Connect sources. Where our data and the reporting agree, say it in one clause and move on. Where they pull apart, explain why they might (different horizon, definition, information) and which to trust for what. Where the reporting names an actor, a date or a decision the data cannot see, say how it bears on the reading.
- Be specific to this country: a mechanism, an actor, an institution, a date, a number. Delete any sentence that would be equally true of another country.
- Name the mechanism. "Risk is low" is a number, not an insight. Say what keeps it low or high in this country: who controls the guns and pays them, which institution arbitrates a disputed result, what the army owes to whom, how the last attempt ended and what that taught the officers, what a ruler of this age or tenure leaves behind. Prefer a causal sentence ("because X, Y") to a descriptive one.
- Use history. The closest analogs, the country's own record and its decades are evidence about how this kind of country behaves: say what they imply, not just that they exist. If the analogs show no attempt in any close case, that is a finding about how rare the move is from this starting point.
- Be useful to the reader named above: what to read into the number, what would change it inside the window, what to do or check. Specific, not generic advice. No investment advice, no instructions to buy or sell.
- Judgement is welcome and should be calibrated: say what you think and how sure you are. Do not hedge every sentence; do not say anything will or will not happen.

Rules
1. Numbers, dates and records about the forecast, the coup record, ACLED and the region come only from FACTS (the market figures come from FACTS.prediction_markets). Quote probabilities as percentages; you may state a simple ratio or difference of two FACTS numbers if it is exact. Never quote log-odds, coefficients or internals; describe strength in words (slight, moderate, strong, very strong) using the "effect" labels.
2. Write about the country, never about our tool or inputs. Do not mention "the model", "the database", "the profile", "the archetype", "coded as", "FACTS", "PRESS", "the brief", "the forecast cannot see", or anything being "given", "provided" or "specified" to you. Refer to "our forecast" or "Praevex" when you must, to "our alert level" for a signpost threshold, to the coup record, to ACLED counts, to reporting. If a piece of input does not fit this country, leave it out without comment. Never comment on gaps or contradictions in our records: use the figures you are given as they are.
3. Never write about the absence of reporting or data ("the headlines do not show", "no coverage of", "nothing reported"). If nothing was found for a point, say what our data show and what it implies, and leave the reporting out of that sentence. The "reporting" cell of an evidence row stays an empty string when PRESS has nothing that bears on it.
4. Cite PRESS items by id in refs (and in brackets like (P4, P7) in the text) wherever you rely on one. Report each headline for what it says and its date; do not upgrade it.
5. Plain, concrete language. No hype, no moralising, no filler openers, no rhetorical questions, no lists of three adjectives. Avoid the words pivotal, landscape, tapestry, delve, amid, navigate, robust, nuanced, underscore, testament, comprehensive. Vary sentence shapes. Do not repeat the probability more than once outside the headline and the bottom line.
6. Length limits are hard: the layout has fixed boxes. Count words.

Fields and limits
- headline: one sentence, at most 30 words: the thesis a reader would repeat to a colleague.
- key_takeaways: exactly 4. title at most 8 words and a claim, not a label. text at most 52 words: the finding, the evidence behind it (at least two strands, at least one number) and what it means for this reader. The four do different jobs, in this order: (1) where this country really sits, with the comparison that matters (base rate, region, own history, analogs, market); (2) the mechanism that carries the estimate, or the strongest evidence against it; (3) the freshest development in the reporting and what it changes or does not; (4) what to watch and by when, with a date or a threshold. At least two must cross our data with the reporting or the markets. Do not spend a takeaway on restating that the probability is low or high.
- bottom_line: 95 to 125 words, to this reader: how worried to be relative to the base rate and to the region, the main reason, what would change that inside the window, what to do with it.
- evidence: exactly 5 rows, strongest first. theme at most 4 words. finding at most 28 words: what our data show on that theme, with the number. reporting at most 28 words: what the vetted reporting adds on the same theme, with refs; "" when PRESS has nothing on it. direction: "up" if it raises the risk reading, "down" if it lowers it, "watch" if it matters but does not move it yet. implication at most 32 words: what it means for the reading and for this reader. Draw rows from different angles of PRESS_PLAN and different groups of evidence; do not make the rows five versions of the same point.
- markets_read: if FACTS.prediction_markets is empty, "". Otherwise 55 to 85 words: what traders price against our estimate over the same horizon, the likely reasons for the gap (question wording, liquidity, time to close, information we lack or they lack) and what a reader should make of it. Never say that a market is "wrong".
- group_readings: exactly one per group key (storia, contagio, regime, leader, economia, piazza, acled), at most 28 words each: what that family of evidence shows for this country and why it moves the estimate, using the "effect" label for strength.
- history_note, acled_note, region_note: one sentence each, at most 30 words: what to notice in the chart.
- background, society_politics, security_sector: at most 72 words each, from your knowledge. background: how power has changed hands and the episodes (with years) that shape today's politics. society_politics: who holds power now and who contests it, the cleavages, the courts and electoral bodies that arbitrate, the next scheduled tests. security_sector: how the army and police are organised, paid and politicised, their record in earlier crises, and who the officers answer to. Name institutions, actors and years. Concrete, accurate, cautious: where your knowledge may be older than TODAY, say what the reporting in PRESS shows instead of asserting who holds an office, and omit what you are unsure of. No invented figures.
- current_situation.text: at most 115 words: what has happened in the last two months that bears on coup risk, in order of importance, tied to the evidence; refs lists the PRESS ids used.
- scenarios: exactly 3 (continuity, escalation, stabilisation): name at most 4 words, description at most 46 words, exactly 2 signposts of at most 12 words each. Qualitative; no new probabilities.
- lens_note: one sentence, at most 34 words, on how this reader should read the probability: what it does and does not tell them.
- lens_actions: exactly 3. action at most 14 words, why at most 30 words. Things this reader would do or check in the next six months, tied to this country's signposts and dates. No generic advice.
- press_digest: at most 6, only items that matter: ref and takeaway at most 20 words, saying what the headline means for the evidence, not repeating it. Empty if PRESS is empty.
- caveats: 2 or 3, each at most 28 words: the figures are estimates with the stated interval; the context sections come from the analyst's general knowledge, not the database; plus any limit that applies to this country.`;

export async function callOpenAI(body, ms = 170000) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(ms), cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function narrate(facts, press) {
  const user = { TODAY: new Date().toISOString().slice(0, 10), FACTS: facts,
    PRESS: press.items.map(({ id, title, outlet, date, angle }) => ({ id, angle, outlet, date, headline: title })),
    PRESS_PLAN: (press.plan || []).map(({ angle, label, why, found }) => ({ angle, label, why, headlines_found: found })), PRESS_NOTE: press.note };
  const base = { model: MODEL, max_completion_tokens: 16000,
    messages: [{ role: "system", content: systemPrompt(lensOf(facts.reader?.lens)) }, { role: "user", content: JSON.stringify(user) }],
    response_format: { type: "json_schema", json_schema: { name: "dossier", strict: true, schema: SCHEMA } } };
  // The writing is worth the thinking time (about two minutes). If that pass times out or the service errors, a quick pass beats no brief.
  let out = await callOpenAI({ ...base, reasoning_effort: "medium" }, 190000).catch(() => null);
  if (!out || out.status >= 500 || out.status === 408) out = await callOpenAI({ ...base, reasoning_effort: "low" }, 70000);
  if (!out.ok && out.status === 400 && /reasoning_effort|unsupported/i.test(out.json?.error?.message || "")) out = await callOpenAI(base, 120000);
  if (!out.ok) throw new Error(`OpenAI request failed (${out.status}${out.json?.error?.code ? `, ${out.json.error.code}` : ""})`);
  const text = out.json.choices?.[0]?.message?.content;
  let n; try { n = JSON.parse(text); } catch { throw new Error("OpenAI returned an unreadable answer"); }
  const ids = new Set(press.items.map((p) => p.id));
  n.current_situation.refs = n.current_situation.refs.filter((x) => ids.has(x));
  n.press_digest = n.press_digest.filter((d) => ids.has(d.ref));
  for (const row of n.evidence) row.refs = row.refs.filter((x) => ids.has(x));
  const have = new Set(n.group_readings.map((g) => g.group));
  n.group_readings = n.group_readings.filter((g, i, a) => a.findIndex((h) => h.group === g.group) === i);
  if (GROUP_KEYS.some((k) => !have.has(k))) n.group_readings = n.group_readings.filter((g) => GROUP_KEYS.includes(g.group));
  return n;
}
