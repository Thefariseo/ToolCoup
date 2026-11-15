import { watchlist } from "@/lib/console";
import { allMarkets, modelAtHorizon } from "@/lib/markets";

export const maxDuration = 60;

// GET /api/markets/niger -> open prediction markets on coups / leader exits that name the country, next to our probability.
export async function GET(_request, { params }) {
  const { slug } = await params;
  const me = watchlist().find((c) => c.slug === slug);
  if (!me) return Response.json({ error: "Unknown country." }, { status: 404 });
  const { asOf, status, by } = await allMarkets();
  const markets = (by[slug] || []).slice(0, 12).map((m) => ({ ...m, model: m.kind === "coup" ? modelAtHorizon(me.risk, m.months) : null }));
  return Response.json({ slug, asOf, status, model6m: me.risk, markets }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } });
}
