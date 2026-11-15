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

/** The model's 6-month probability restated for a market horizon, assuming a constant hazard. */
export const modelAtHorizon = (p6, months) => (p6 == null || months == null || months <= 0 || months > 48 ? null : 1 - Math.pow(1 - p6, months / 6));
