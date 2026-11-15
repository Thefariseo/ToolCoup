import fs from "node:fs/promises";
import path from "node:path";
import { buildChart, buildFacts, dossierKnown, fetchPress, MODEL, narrate } from "@/lib/dossier";
import { FLAG } from "@/lib/flags";
import { allMarkets, modelAtHorizon } from "@/lib/markets";
import { buildPdf } from "@/lib/dossier-pdf";
import { registrySummary } from "@/lib/registry";

// GET /api/dossier/niger?issue=2026-11&lens=investor  ->  PDF   (lens: analyst | investor | policy | newsroom | aid)
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
  const mockRequest = process.env.NODE_ENV !== "production" && new URL(request.url).searchParams.get("mock") === "1";
  if (!mockRequest && (process.env.DOSSIER_DISABLED === "1" || !process.env.OPENAI_API_KEY)) return fail(503, "Dossier generation is not enabled on this deployment.");
  if (!dossierKnown(slug)) return fail(404, "Unknown country.");
  if (request.headers.get("sec-fetch-site") === "cross-site") return fail(403, "Cross-site requests are not allowed.");

  if (!mockRequest) {                                       // mock requests (development only) spend no credit, so they are not counted
    const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim(), now = Date.now();
    if (now - day.start > 864e5) day = { start: now, n: 0 };
    const recent = (hits.get(ip) || []).filter((t) => now - t < 36e5);
    if (recent.length >= PER_IP_HOUR || day.n >= PER_DAY) return fail(429, "Too many dossiers requested. Try again later.", { "Retry-After": "3600" });
    hits.set(ip, [...recent, now]); day.n++;
  }

  try {
    const facts = buildFacts(slug, new URL(request.url).searchParams.get("lens") || "analyst"), chart = buildChart(slug);
    const mock = process.env.NODE_ENV !== "production" && new URL(request.url).searchParams.get("mock") === "1";   // layout work without spending credit
    if (mock && new URL(request.url).searchParams.get("json") === "1") return Response.json(facts.profile);   // development: inspect the reading frame
    const press = mock ? { items: [], note: "mock" } : await fetchPress(slug, facts.country.name);
    try {                                                    // markets are an extra reading: their absence never blocks the brief
      const m = (await allMarkets()).by[slug]?.filter((x) => x.kind === "coup").slice(0, 3) || [];
      facts.prediction_markets = m.map((x) => ({ source: x.source, question: x.question, crowd_probability: +x.p.toFixed(3), months_to_close: x.months == null ? null : +x.months.toFixed(1), our_model_same_horizon: x.months == null ? null : +(modelAtHorizon(facts.forecast.probability_of_at_least_one_coup_attempt, x.months) ?? 0).toFixed(3) }));
    } catch { /* ignore */ }
    const narrative = mock ? (await import("@/lib/dossier-mock")).mockNarrative(facts) : await narrate(facts, press);
    const generated = new Date().toISOString().slice(0, 10);
    const code = FLAG[facts.country.iso];
    const flag = code ? await fs.readFile(path.join(process.cwd(), "public", "flags", "png", `${code}.png`)).catch(() => null) : null;
    const bytes = await buildPdf({ facts, chart, narrative, press, model: MODEL, generated, flag });
    const issue = registrySummary().latest || facts.forecast.issue;
    return new Response(bytes, { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="praevex-brief-${slug}-${facts.reader.lens === "analyst" ? "" : facts.reader.lens + "-"}${issue}.pdf"`,
      "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=86400",
    } });
  } catch (e) {
    console.error("dossier failed", slug, e?.message);
    return fail(502, "The dossier could not be generated. Please try again in a moment.");
  }
}
