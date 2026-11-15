import { watchlist } from "@/lib/console";
import { allMarkets, modelAtHorizon, primaryMarket } from "@/lib/markets";

export const maxDuration = 60;

// GET /api/markets/niger -> open prediction markets on coups / leader exits that name the country, next to our probability,
// and the one the site leads with. Both venues trade real money, so rows carry no outbound link (promotion is restricted where we publish from).
export async function GET(_request, { params }) {
  const { slug } = await params;
  const me = watchlist().find((c) => c.slug === slug);
  if (!me) return Response.json({ error: "Unknown country." }, { status: 404 });
  const { asOf, status, by } = await allMarkets();
  const rows = by[slug] || [];
  const all = rows.map(({ url, ...m }) => ({ ...m, model: m.kind === "coup" ? modelAtHorizon(me.risk, m.months) : null }));
  const lead = primaryMarket(rows);
  const primary = lead ? all.find((m) => m.question === lead.question && m.source === lead.source) || null : null;
  return Response.json({ slug, asOf, status, model6m: me.risk, primary, markets: all.slice(0, 12) }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } });
}
