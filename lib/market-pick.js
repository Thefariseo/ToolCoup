// Which prediction market the site leads with, and how our probability is restated for its horizon. Pure functions, no server-only imports,
// so they can be tested on their own. Only Polymarket and Kalshi are read: both trade real money. Play-money venues (Manifold) are left out.
export const VENUES = ["Polymarket", "Kalshi"];
/** The one market the site leads with for a country: the coup question with the most volume traded between Polymarket and Kalshi,
 *  preferring one with at least $5,000 traded so a thin market does not stand for the crowd. */
export function primaryMarket(rows, minVolume = 5000) {
  const coup = (rows || []).filter((m) => m.kind === "coup" && VENUES.includes(m.source));
  const top = (list) => list.slice().sort((a, b) => (b.volume || 0) - (a.volume || 0))[0] || null;
  return top(coup.filter((m) => (m.volume || 0) >= minVolume)) || top(coup);
}

const logit = (p) => Math.log(p / (1 - p));
const expit = (z) => 1 / (1 + Math.exp(-z));
const clip = (p) => Math.min(Math.max(p, 1e-9), 1 - 1e-9);

/** Cumulative probabilities [[months, p], ...] at the horizons of `terms.grid`, for a 6-month probability `p6`.
 *  Up to six months the monthly hazard is constant. Beyond, where pipeline/terms.py found that a correction beats a constant hazard out of
 *  sample, logit F = a + b logit p6 (coups come in clusters, so the riskiest countries gain less than a constant hazard says). Never decreasing. */
export function termCurve(p6, terms) {
  const p = clip(p6);
  let prev = 0;
  return terms.grid.map((h) => {
    let f = h === 6 ? p : 1 - Math.pow(1 - p, h / 6);
    const m = h > 6 ? terms.long?.[String(h)] : null;
    if (m) f = expit(m.a + m.b * logit(p));
    f = Math.max(f, prev);
    prev = f;
    return [h, f];
  });
}

/** The model's 6-month probability restated for a market horizon `months`: interpolated in cumulative hazard between the horizons of the term
 *  structure, and continued at the curve's average hazard beyond the last one. Without `terms` (or for a country with none), constant hazard. */
export function modelAtHorizon(p6, months, terms = null) {
  if (p6 == null || months == null || months <= 0 || months > 48) return null;
  if (!terms?.grid?.length) return 1 - Math.pow(1 - p6, months / 6);
  const pts = [[0, 0], ...termCurve(p6, terms).map(([h, f]) => [h, -Math.log(1 - Math.min(f, 1 - 1e-12))])];
  const i = pts.findIndex(([h]) => h >= months);
  let cum;
  if (i === -1) { const [h1, c1] = pts[pts.length - 1]; cum = c1 + (c1 / h1) * (months - h1); }       // beyond the grid: the average hazard of the whole curve
  else { const [h0, c0] = pts[Math.max(i - 1, 0)], [h1, c1] = pts[i]; cum = h1 === h0 ? c1 : c0 + ((c1 - c0) * (months - h0)) / (h1 - h0); }
  return 1 - Math.exp(-cum);
}

const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
/** A Kalshi market's price and traded volume in dollars.
 *  The price is the mid of bid and ask only when the book is tight; with a wide spread (bid 0.01, ask 1.00 prices nothing, mid 0.505)
 *  it is the last trade, and a market that never traded has no price. Volume comes as contracts (`volume_fp`, older `volume`); a contract
 *  pays $1, so dollars traded are approximated at the current price. */
export function kalshiQuote(m) {
  const d = (dollars, cents) => num(dollars) ?? (num(cents) != null ? num(cents) / 100 : null);
  const bid = d(m.yes_bid_dollars, m.yes_bid), ask = d(m.yes_ask_dollars, m.yes_ask), last = d(m.last_price_dollars, m.last_price);
  const tight = bid != null && ask != null && bid > 0 && ask > bid && ask - bid <= 0.15;
  const p = tight ? (bid + ask) / 2 : last;
  if (!(p > 0 && p < 1)) return null;
  const contracts = num(m.volume_fp) ?? num(m.volume);
  return { p, volume: contracts != null ? Math.round(contracts * p) : null };
}
