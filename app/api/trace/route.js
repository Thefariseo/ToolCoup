import { tracePeers } from "@/lib/trace-peers";

// GET /api/trace -> the reference probability and the distribution of each group's term across countries (for the Model Trace).
export async function GET() {
  return Response.json(tracePeers(), { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } });
}
