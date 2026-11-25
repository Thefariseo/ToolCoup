// The hybrid reading: our model, the prediction markets and an LLM analyst pooled into one probability. Pure functions, no server-only imports.
//
// The idea comes from hybrid forecasting tournaments (Benjamin et al. 2023, Mellers et al. 2024): a statistical model, a crowd and an analyst each
// carry information the others lack, and a weighted pool of them beats the best single source more often than not. Three rules come from that work.
//   1. Pool in log-odds, with weights that follow track record (recent resolved forecasts count most) and start from priors, so a few early misses
//      cannot flip them: the weights stay within a factor of about four of the prior (see pipeline/hybrid_score.py).
//   2. Extremise only when the sources are independent. The model, the market and the analyst see different things, so with n sources the pooled
//      log-odds move away from the base rate by a = 1 + 0.1 (n - 1). With one source nothing moves. For a rare event "away" is measured from the
//      base rate, not from 50%: pushing a 1% estimate away from 50% would only make it smaller.
//   3. Put every source on the same question first. A market closes on its own date, so its price is restated as a six-month probability with the
//      country's own term structure (lib/market-pick.js), and the analyst's raw number is shrunk toward the base rate because language models
//      overstate rare events.
// There is no track record yet. The first scored issue closes in May 2027; until then the weights are the priors and the reading is labelled as such.
import { modelAtHorizon } from "./market-pick.js";

export const PRIORS = { model: 0.7, market: 0.2, analyst: 0.1 };
export const EXTREMISE_STEP = 0.1;      // per additional independent source
export const EXTREMISE_MAX = 1.3;
export const ANALYST_SHRINK = 0.5;      // how much of the analyst's distance from the base rate is kept
export const MARKET_RANGE = { minMonths: 1, maxMonths: 24, minVolume: 5000, minPrice: 0.005, maxPrice: 0.95 };

const clip = (p) => Math.min(Math.max(p, 1e-6), 1 - 1e-6);
export const logit = (p) => Math.log(clip(p) / (1 - clip(p)));
export const expit = (z) => 1 / (1 + Math.exp(-z));

/** A market is usable when it is a coup question that is neither too thin, too near its close, too far from it, nor priced at an extreme. */
export const usableMarket = (m, r = MARKET_RANGE) =>
  m && m.kind === "coup" && m.months != null && m.months >= r.minMonths && m.months <= r.maxMonths && (m.volume || 0) >= r.minVolume && m.p >= r.minPrice && m.p <= r.maxPrice;

/** The six-month probability that makes our own term structure give the market's price at the market's horizon (bisection; the map is increasing). */
export function marketSixMonth(price, months, terms = null) {
  if (price == null || months == null) return null;
  let lo = 1e-6, hi = 0.999;
  if (modelAtHorizon(hi, months, terms) <= price) return hi;
  if (modelAtHorizon(lo, months, terms) >= price) return lo;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (modelAtHorizon(mid, months, terms) < price) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Several markets on the same country become one six-month probability: volume-weighted mean of log-odds. `volume` is the total traded. */
export function pooledMarket(markets, terms = null) {
  const rows = (markets || []).filter((m) => usableMarket(m)).map((m) => ({ p: marketSixMonth(m.p, m.months, terms), v: m.volume || 0 })).filter((r) => r.p != null);
  if (!rows.length) return null;
  const tot = rows.reduce((s, r) => s + r.v, 0);
  return { p: expit(rows.reduce((s, r) => s + (r.v / tot) * logit(r.p), 0)), volume: tot, n: rows.length };
}

/** A market's weight shrinks with thin trading: full weight from $100,000 traded, a quarter of it at the $5,000 floor. */
export const liquidity = (volume) => (volume == null ? 0.25 : Math.max(0.25, Math.min(1, Math.sqrt(volume / 100000))));

/** Several answers from one analyst to the same question, averaged in log-odds. `pick` is the answer closest to the average (its rationale represents the group). */
export function averageAnswers(answers, lo = 0.001, hi = 0.5) {
  const ok = (answers || []).filter((a) => a && Number.isFinite(a.raw));
  if (!ok.length) return null;
  const zs = ok.map((a) => Math.min(logit(hi), Math.max(logit(lo), logit(a.raw))));
  const z = zs.reduce((t, v) => t + v, 0) / zs.length;
  let k = 0;
  zs.forEach((v, i) => { if (Math.abs(v - z) < Math.abs(zs[k] - z)) k = i; });
  return { raw: expit(z), samples: ok.map((a) => a.raw), pick: ok[k] };
}

/** The analyst's raw probability, moved toward the base rate. */
export const calibrateAnalyst = (p, base, kappa = ANALYST_SHRINK) => (p == null ? null : expit(logit(base) + kappa * (logit(p) - logit(base))));

/**
 * Pool the sources that exist for a country.
 *   sources  { model: p, market: { p, volume }, analyst: p }   (any may be missing; model is nearly always there)
 *   base     the base rate, the point the pool is extremised from
 *   logw     learned log-adjustments to the priors, e.g. { market: -0.2 } (webdata/hybrid.json)
 * Returns { p, weights: {source: share}, n, a }.
 */
export function pool(sources, base, logw = {}, { step = EXTREMISE_STEP, max = EXTREMISE_MAX } = {}) {
  const parts = [];
  if (sources.model != null) parts.push(["model", sources.model, PRIORS.model * Math.exp(logw.model || 0)]);
  if (sources.market?.p != null) parts.push(["market", sources.market.p, PRIORS.market * Math.exp(logw.market || 0) * liquidity(sources.market.volume)]);
  if (sources.analyst != null) parts.push(["analyst", sources.analyst, PRIORS.analyst * Math.exp(logw.analyst || 0)]);
  if (!parts.length) return null;
  const total = parts.reduce((s, [, , w]) => s + w, 0);
  const zbar = parts.reduce((s, [, p, w]) => s + (w / total) * logit(p), 0);
  const a = Math.min(max, 1 + step * (parts.length - 1)), z0 = logit(base);
  return { p: expit(z0 + a * (zbar - z0)), weights: Object.fromEntries(parts.map(([k, , w]) => [k, w / total])), n: parts.length, a };
}
