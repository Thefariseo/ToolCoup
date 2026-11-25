import { allMarkets } from "@/lib/markets";
import { analystForecast } from "@/lib/analyst";
import { buildFacts, MODEL } from "@/lib/dossier";
import { fetchPress } from "@/lib/dossier-press";
import { watchlist } from "@/lib/console";
import { calibrateAnalyst, pool, pooledMarket, usableMarket } from "@/lib/hybrid";
import { getRegistry } from "@/lib/registry";
import { getSummary } from "@/lib/data";
import hybrid from "@/webdata/hybrid.json";
import terms from "@/webdata/terms.json";

// POST /api/hybrid/snapshot  ->  the hybrid ledger entry for the current issue: model, markets and analyst for the countries that have a market and the
// riskiest ones, pooled. It spends API credit and reads live markets, so it exists only where HYBRID_SNAPSHOT=1 is set: the monthly job starts the built
// site on the runner with that variable, calls this route once through scripts/hybrid-snapshot.mjs, and files the answer in registry/hybrid/. The
// deployed site never has the variable, so this route answers 404 there.
export const maxDuration = 300;

const pmap = async (items, n, fn) => {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
};

export async function POST(request) {
  if (process.env.HYBRID_SNAPSHOT !== "1") return new Response("Not found", { status: 404 });
  const body = await request.json().catch(() => ({}));
  const top = Math.min(Number(body.top) || 40, 120), useAnalyst = body.analyst !== false && !!process.env.OPENAI_API_KEY;
  const meta = getSummary().meta, issue = getRegistry().issues[0]?.issue || meta.forecast_from, base = meta.base_rate;
  const list = watchlist(), bySlug = new Map(list.map((c) => [c.slug, c]));
  const { by } = await allMarkets();
  const withMarket = Object.entries(by).filter(([slug, rows]) => bySlug.has(slug) && rows.some((m) => usableMarket(m))).map(([slug]) => slug);
  const chosen = [...new Set([...(body.slugs || []), ...withMarket, ...list.slice(0, top).map((c) => c.slug)])].filter((s) => bySlug.has(s));
  const logw = hybrid.logw || {};
  const asof = new Date().toISOString();

  const countries = await pmap(chosen, 5, async (slug) => {
    const c = bySlug.get(slug), rows = (by[slug] || []).filter((m) => m.kind === "coup");
    const pm = pooledMarket(rows, terms);
    let analyst = null;
    if (useAnalyst) {
      try {
        const facts = buildFacts(slug), press = await fetchPress(facts), ev = facts.profile.evidence;
        const card = { region: c.region, regime: ev.regime, last_attempt: facts.coup_record.last, attempts_since_2000: ev.attempts_since_2000, years_since_last_success: ev.years_since_last_success,
          head_of_state_tenure_years: ev.tenure_years, head_of_state_age: ev.head_of_state_age };
        const a = await analystForecast({ name: c.name, window: [meta.forecast_from, meta.forecast_to], base, card, press });
        if (a) analyst = { ...a, calibrated: calibrateAnalyst(a.raw, base), headlines: press.items.map(({ id, title, outlet, date, angle }) => ({ id, title, outlet, date, angle })) };
      } catch (e) { console.error("analyst failed", slug, e?.message); }
    }
    const pooled = pool({ model: c.risk, market: pm ? { p: pm.p, volume: pm.volume } : null, analyst: analyst?.calibrated ?? null }, base, logw);
    return {
      slug, name: c.name, iso: c.iso, rank: c.rank,
      model: { p: c.risk, lo: c.risk_lo, hi: c.risk_hi },
      market: pm ? { p6: pm.p, volume: pm.volume, n: pm.n, markets: rows.map(({ source, question, p, months, volume, closes }) => ({ source, question, p, months: months == null ? null : +months.toFixed(2), volume, closes })) } : null,
      analyst,
      pooled: pooled && { p: pooled.p, weights: pooled.weights, n: pooled.n, a: pooled.a },
    };
  });
  return Response.json({
    issue, asof, window: [meta.forecast_from, meta.forecast_to], horizon: meta.horizon, base_rate: base, analyst_model: useAnalyst ? MODEL : null,
    method: "pooled in log-odds with prior weights model 0.7, market 0.2 (scaled by liquidity), analyst 0.1; learned adjustments in webdata/hybrid.json; extremised from the base rate by 1 + 0.1 (n - 1)",
    logw, countries,
  });
}
