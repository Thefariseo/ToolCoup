// Which prediction market the site leads with, and how our probability is restated for its horizon. Pure functions, no server-only imports,
// so they can be tested on their own.
const REAL_MONEY = new Set(["Polymarket", "Kalshi"]);
export const isRealMoney = (source) => REAL_MONEY.has(source);
/** The one market the site leads with for a country. Of Polymarket and Kalshi, the coup question with the most volume traded
 *  (at least $5,000, so a thin market does not stand for the crowd); Manifold, which trades play money, only when neither lists one. */
export function primaryMarket(rows, minVolume = 5000) {
  const coup = (rows || []).filter((m) => m.kind === "coup");
  const top = (list) => list.slice().sort((a, b) => (b.volume || 0) - (a.volume || 0))[0] || null;
  const real = coup.filter((m) => REAL_MONEY.has(m.source));
  return top(real.filter((m) => (m.volume || 0) >= minVolume)) || top(real) || top(coup);
}

/** The model's 6-month probability restated for a market horizon, assuming a constant hazard. */
export const modelAtHorizon = (p6, months) => (p6 == null || months == null || months <= 0 || months > 48 ? null : 1 - Math.pow(1 - p6, months / 6));
