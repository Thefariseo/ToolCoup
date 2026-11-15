import { watchlist } from "@/lib/console";
import { allMarkets, isRealMoney, modelAtHorizon, primaryMarket } from "@/lib/markets";

export const maxDuration = 60;

// GET /api/markets -> which countries have open coup / leader-exit markets, the state of each source and, per country, the one market
// the site leads with (of Polymarket and Kalshi, the one with the most volume) next to our model at the same horizon.
// ?unmatched=1 lists the coup / exit questions that name no country we track (to improve the matching).
export async function GET(request) {
  const { asOf, status, by, unmatched, rowsSeen } = await allMarkets();
  const list = new Map(watchlist().map((c) => [c.slug, c])), primary = {};
  for (const [slug, rows] of Object.entries(by)) {
    const m = primaryMarket(rows), me = list.get(slug);
    if (!m || !me) continue;
    primary[slug] = {
      name: me.name, iso: me.iso, source: m.source, question: m.question, p: m.p, volume: m.volume, closes: m.closes, months: m.months,
      model: modelAtHorizon(me.risk, m.months), model6m: me.risk, url: isRealMoney(m.source) ? null : m.url, markets: rows.filter((r) => r.kind === "coup").length,
    };
  }
  const body = { asOf, status, rowsSeen, countries: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length])), primary };
  if (new URL(request.url).searchParams.get("unmatched") === "1") body.unmatched = unmatched.slice(0, 150);
  return Response.json(body, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } });
}
