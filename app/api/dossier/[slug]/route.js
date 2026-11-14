import { buildChart, buildFacts, dossierKnown, fetchPress, MODEL, narrate } from "@/lib/dossier";
import { buildPdf } from "@/lib/dossier-pdf";
import { registrySummary } from "@/lib/registry";

// GET /api/dossier/niger?issue=2026-11  ->  PDF
// Each call spends OpenAI credit, so: only the known country slugs are accepted, the response is cached at
// the CDN for the whole issue (the `issue` query parameter is the cache key), cross-site requests are
// refused, and there is a best-effort per-IP and per-day limit on top. DOSSIER_DISABLED=1 switches it off.
export const maxDuration = 200;

const hits = new Map();           // ip -> timestamps (per server instance: a brake, not a guarantee)
let day = { start: Date.now(), n: 0 };
const PER_IP_HOUR = 4, PER_DAY = 80;
const fail = (status, error, extra = {}) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store", ...extra } });

export async function GET(request, { params }) {
  const { slug } = await params;
  if (process.env.DOSSIER_DISABLED === "1" || !process.env.OPENAI_API_KEY) return fail(503, "Dossier generation is not enabled on this deployment.");
  if (!dossierKnown(slug)) return fail(404, "Unknown country.");
  if (request.headers.get("sec-fetch-site") === "cross-site") return fail(403, "Cross-site requests are not allowed.");

  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim(), now = Date.now();
  if (now - day.start > 864e5) day = { start: now, n: 0 };
  const recent = (hits.get(ip) || []).filter((t) => now - t < 36e5);
  if (recent.length >= PER_IP_HOUR || day.n >= PER_DAY) return fail(429, "Too many dossiers requested. Try again later.", { "Retry-After": "3600" });
  hits.set(ip, [...recent, now]); day.n++;

  try {
    const facts = buildFacts(slug), chart = buildChart(slug);
    const press = await fetchPress(slug, facts.country.name);
    const narrative = await narrate(facts, press);
    const generated = new Date().toISOString().slice(0, 10);
    const bytes = await buildPdf({ facts, chart, narrative, press, model: MODEL, generated });
    const issue = registrySummary().latest || facts.forecast.issue;
    return new Response(bytes, { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="toolcoup-dossier-${slug}-${issue}.pdf"`,
      "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=86400",
    } });
  } catch (e) {
    console.error("dossier failed", slug, e?.message);
    return fail(502, "The dossier could not be generated. Please try again in a moment.");
  }
}
