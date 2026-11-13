import { CONFIDENCE, getTimeline } from "@/lib/data";

// GET /api/timeline?conf=C
export async function GET(request) {
  const conf = (new URL(request.url).searchParams.get("conf") || "C").toUpperCase();
  if (!CONFIDENCE.includes(conf)) return Response.json({ error: "conf deve essere A, B, C o D" }, { status: 400 });
  return Response.json(getTimeline(conf));
}
