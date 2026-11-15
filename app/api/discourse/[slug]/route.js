import { discourse } from "@/lib/discourse";

// GET /api/discourse/niger -> attention and tone shifts around the country (Wikipedia pageviews, GDELT news timelines).
export async function GET(_request, { params }) {
  const { slug } = await params;
  const d = await discourse(slug);
  if (!d) return Response.json({ error: "Unknown country." }, { status: 404 });
  return Response.json(d, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } });
}
