import { after } from "next/server";
import { buildTicker } from "@/lib/ticker";

export const maxDuration = 60;           // the response itself is back within about ten seconds; the rest is room for a market scan that finishes after it

// GET /api/ticker -> the wire shown at the foot of every page: vetted-outlet headlines on coups, plus lines from our own data.
export async function GET() {
  const data = await buildTicker({ later: (scan) => after(() => scan) });
  const fresh = data.partial ? "public, s-maxage=60, stale-while-revalidate=300" : "public, s-maxage=600, stale-while-revalidate=1800";   // a wire still missing its market lines is not kept for ten minutes
  return Response.json(data, { headers: { "Cache-Control": fresh } });
}
