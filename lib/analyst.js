// The analyst: one language model, reading recent reporting about a country, asked for one number: the chance of a coup attempt in the issue window.
// It is the third source of the hybrid reading (lib/hybrid.js), so it must add something the model and the markets do not have. It therefore gets what a
// desk analyst would have (the date, the window, a short country card, the headlines found by angle) and does NOT get our forecast, our rank, our
// drivers or any market price: shown those, it would repeat them. Its raw answer is shrunk toward the base rate by lib/hybrid.js before pooling.
// Only gpt-6-luna writes anything here (the model is fixed in lib/dossier.js). Server only.
import "server-only";
import { callOpenAI, MODEL } from "@/lib/dossier";
import { averageAnswers } from "@/lib/hybrid";

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["probability", "confidence", "rationale", "signals"],
  properties: {
    probability: { type: "number" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    rationale: { type: "string" },
    signals: { type: "array", items: { type: "object", additionalProperties: false, required: ["ref", "reading"], properties: { ref: { type: "string" }, reading: { type: "string" } } } },
  },
};

const SYSTEM = `You are an experienced geopolitical forecaster, trained in the habits that win forecasting tournaments: start from a base rate, adjust only for specific evidence, and avoid being moved by loud words.

The question: will at least one coup attempt, successful or failed, take place in the country named in COUNTRY between the dates in WINDOW? A coup attempt is an effort by part of the military, security forces or ruling elite to remove or seize the head of state or government by force or by an unconstitutional act. Protests, riots, insurgencies, assassinations by non-state actors and constitutional removals do not count unless the security forces or the elite move against the government.

Inputs: COUNTRY (region, regime type, recent coup record, how long the head of state has been in power), WINDOW, BASE_RATE (the share of country-months that were followed by a coup attempt within six months, worldwide: most countries sit far below it and a few far above it), and HEADLINES from vetted outlets, each with the angle it was searched under and its date.

How to forecast:
1. Place the country relative to the base rate from the country card alone: a country that had a coup in the last five years, a military-led government or a very long-lived ruler sits above it; a stable democracy with no attempt in decades sits well below it.
2. Move from there only for specific, dated developments in the headlines: officers arrested or purged, a mutiny, a coup plot announced, a disputed succession, an election dispute where the army takes sides, a regional body acting. Say which headline moved you and by how much.
3. Rhetoric, protests and economic stress alone move the number only a little. The great majority of countries with coup talk have no coup in six months.
4. Probabilities must be honest: a number between 0.001 and 0.5. Do not output 0 or 1. If the headlines say nothing relevant, stay near the position set by the country card.

Output: probability (a number between 0.001 and 0.5, for the whole window), confidence (low, medium or high: how much the evidence narrows the range), rationale (at most 60 words, in plain English, naming the evidence, with every probability and rate written as a percentage), and signals (at most four: the headline ids that moved you, with a short reading each; an empty list if none did).`;

export const SAMPLES = 3;      // independent answers per country; a language model's answer to the same question varies from run to run

/** One answer from the model: { raw, confidence, rationale, signals } or null when the call or the parsing fails. */
async function oneAnswer(body, ids) {
  let out = await callOpenAI({ ...body, reasoning_effort: "low" }, 90000).catch(() => null);
  if (out && !out.ok && out.status === 400 && /reasoning_effort|unsupported/i.test(out.json?.error?.message || "")) out = await callOpenAI(body, 90000).catch(() => null);
  if (!out?.ok) return null;
  try {
    const n = JSON.parse(out.json.choices?.[0]?.message?.content);
    const p = Math.min(0.5, Math.max(0.001, Number(n.probability)));
    if (!Number.isFinite(p)) return null;
    return { raw: p, confidence: n.confidence, rationale: String(n.rationale).slice(0, 600), signals: (n.signals || []).filter((s) => ids.has(s.ref)).slice(0, 4) };
  } catch { return null; }
}

/**
 * One analyst forecast: `samples` independent answers to the same question, averaged in log-odds (noise reduction, the part of a pool's gain that
 * hybrid-forecasting tournaments found most reliable). The rationale and signals are those of the answer closest to the average. `card` and `press` are
 * built by the caller; nothing about our own forecast goes in. Returns null when every call fails.
 */
export async function analystForecast({ name, window, base, card, press, samples = SAMPLES }) {
  const user = {
    COUNTRY: { name, ...card }, WINDOW: { from: window[0], to: window[1], months: 6 }, BASE_RATE: Math.round(base * 10000) / 10000, BASE_RATE_PERCENT: `${(base * 100).toFixed(2)}%`,
    HEADLINES: press.items.map(({ id, title, outlet, date, angle }) => ({ id, angle, outlet, date, headline: title })),
  };
  const body = { model: MODEL, max_completion_tokens: 6000, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(user) }],
    response_format: { type: "json_schema", json_schema: { name: "analyst", strict: true, schema: SCHEMA } } };
  const ids = new Set(press.items.map((p) => p.id));
  const avg = averageAnswers(await Promise.all(Array.from({ length: Math.max(1, samples) }, () => oneAnswer(body, ids))));
  if (!avg) return null;
  return { raw: avg.raw, samples: avg.samples, confidence: avg.pick.confidence, rationale: avg.pick.rationale, signals: avg.pick.signals };
}
