import { CONFIDENCE, queryCoups } from "@/lib/data";

// GET /api/coups?conf=C&from=1900&to=1950&country=niger&type=riuscito,fallito&dup=1
export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const conf = (p.get("conf") || "C").toUpperCase();
  if (!CONFIDENCE.includes(conf)) return Response.json({ error: "conf deve essere A, B, C o D" }, { status: 400 });
  const year = (k) => {
    const v = parseInt(p.get(k) || "", 10);
    return Number.isFinite(v) ? v : undefined;
  };
  const types = (p.get("type") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const events = queryCoups({
    conf, types, from: year("from"), to: year("to"), slug: p.get("country") || undefined, dup: p.get("dup") === "1",
  });
  return Response.json({ count: events.length, events });
}
