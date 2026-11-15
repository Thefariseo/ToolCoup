import { buildTicker } from "@/lib/ticker";

export const maxDuration = 30;

// GET /api/ticker -> the wire shown at the foot of every page: vetted-outlet headlines on coups, plus lines from our own data.
export async function GET() {
  const data = await buildTicker();
  return Response.json(data, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } });
}
