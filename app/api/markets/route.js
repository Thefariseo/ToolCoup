import { allMarkets } from "@/lib/markets";

export const maxDuration = 60;

// GET /api/markets -> which countries have open coup / leader-exit markets, and the state of each source.
// ?unmatched=1 lists the coup / exit questions that name no country we track (to improve the matching).
export async function GET(request) {
  const { asOf, status, by, unmatched, rowsSeen } = await allMarkets();
  const body = { asOf, status, rowsSeen, countries: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length])) };
  if (new URL(request.url).searchParams.get("unmatched") === "1") body.unmatched = unmatched.slice(0, 150);
  return Response.json(body, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } });
}
