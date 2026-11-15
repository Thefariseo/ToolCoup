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
export const maxDuration = 300;

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
    const peek = new URL(request.url).searchParams.get("json");
    if (mock && peek === "1") return Response.json(facts.profile);            // development: inspect the reading frame
    if (mock && peek === "facts") return Response.json(facts);                // development: everything the writer is given
    if (mock && peek === "press") return Response.json(await fetchPress(facts));   // development: the planned angles and the headlines each found
    const press = mock ? { items: [], note: "mock" } : await fetchPress(facts);
    try {                                                    // markets are an extra reading: their absence never blocks the brief
      const m = (await allMarkets()).by[slug] || [], pick = [...m.filter((x) => x.kind === "coup").slice(0, 2), ...m.filter((x) => x.kind === "exit").slice(0, 1)];
      facts.prediction_markets = pick.map((x) => ({ source: x.source, kind: x.kind === "coup" ? "coup" : "leader exit", question: x.question, crowd_probability: +x.p.toFixed(3),
        months_to_close: x.months == null ? null : +x.months.toFixed(1), closes: x.closes ? String(x.closes).slice(0, 10) : null, volume: x.volume ? Math.round(x.volume) : null,
        our_model_same_horizon: x.kind === "coup" && x.months != null ? +(modelAtHorizon(facts.forecast.probability_of_at_least_one_coup_attempt, x.months) ?? 0).toFixed(3) : null }));
    } catch { facts.prediction_markets = []; }
    const narrative = mock ? (await import("@/lib/dossier-mock")).mockNarrative(facts) : await narrate(facts, press);
    if (process.env.NODE_ENV !== "production" && peek === "narrative") return Response.json({ plan: press.plan, press: press.items, markets: facts.prediction_markets, narrative });   // development: read the text without the PDF
    const generated = new Date().toISOString().slice(0, 10);
    const code = FLAG[facts.country.iso];
    const flag = code ? await fs.readFile(path.join(process.cwd(), "public", "flags", "png", `${code}.png`)).catch(() => null) : null;
    const bytes = await buildPdf({ facts, chart, narrative, press, model: MODEL, generated, flag });
    const issue = registrySummary().latest || facts.forecast.issue;
    return new Response(bytes, { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="praevex-brief-${slug}-${facts.reader.lens === "analyst" ? "" : facts.reader.lens + "-"}${issue}.pdf"`,
      "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=86400",
      ...(process.env.NODE_ENV !== "production" && bytes.fit ? { "X-Dossier-Scale": bytes.fit.join(",") } : {}),
    } });
  } catch (e) {
    console.error("dossier failed", slug, e?.message);
    return fail(502, "The dossier could not be generated. Please try again in a moment.");
  }
}
