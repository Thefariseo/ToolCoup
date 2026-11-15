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
