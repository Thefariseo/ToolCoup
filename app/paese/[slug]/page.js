import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Dossier from "@/components/Dossier";
import CountryAnalysis from "@/components/CountryAnalysis";
import AnalogsView from "@/components/AnalogsView";
import CrowdView from "@/components/CrowdView";
import MarketFact from "@/components/MarketFact";
import DiscourseMonitor from "@/components/DiscourseMonitor";
import StandingView from "@/components/StandingView";
import ViolenceOutlook from "@/components/ViolenceOutlook";
import UnrestOutlook from "@/components/UnrestOutlook";
import { getAnalogs, getStanding, getUnrest, getUnrestCounts, getViolence } from "@/lib/outlook";
import Flag from "@/components/Flag";
import CountUp from "@/components/motion/CountUp";
import Rise from "@/components/motion/Rise";
import { keyMetrics } from "@/lib/country-metrics";
import SiteFooter from "@/components/SiteFooter";
import { allSlugs, getCountry, getSummary, listCountries } from "@/lib/data";
import { fmtEventDate, pct, TYPE_LABEL } from "@/lib/format";

export function generateStaticParams() {
  return allSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const c = getCountry(slug);
  return c ? { title: c.name, description: `Coup history and estimated risk: ${c.name}.` } : {};
}

export default function CountryPage({ params }) {
  return (
    <Suspense fallback={<main className="wrap"><div className="page-head"><p className="lede">Loading the country page…</p></div></main>}>
      <CountryContent params={params} />
    </Suspense>
  );
}

async function CountryContent({ params }) {
  const { slug } = await params;
  const country = getCountry(slug);
  if (!country) notFound();
  const { meta } = getSummary();
  const ranked = listCountries().filter((c) => !c.historical);
  const others = ranked.filter((c) => c.slug !== slug).map((c) => ({ slug: c.slug, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  const ratio = country.risk != null ? country.risk / meta.base_rate : null;
  const last = country.last ? country.coups.find((e) => e.date === country.last.date && e.type === country.last.type) : null;

  return (
    <>
    <main className="wrap">
      <div className="page-head">
        <Link className="crumb" href={`/?c=${slug}`} data-scramble><span className="sx">Open in the forecast</span></Link>
        <h1 className="with-flag"><Flag iso={country.iso} height={34} /><Rise>{country.name}</Rise></h1>
        <p className="lede">
          {country.historical
            ? "Historical state: only coup records are available."
            : country.region}
        </p>
        <div className="facts">
          {!country.historical && (
            <>
              <div className="fact">
                <b><CountUp value={country.risk} start={0} fmt="pct" duration={900} /></b>
                <span>
                  chance of an attempt in the next {meta.horizon} months
                  {country.risk_lo != null && `, plausible range ${pct(country.risk_lo)} to ${pct(country.risk_hi)}`}
                </span>
              </div>
              <div className="fact"><b>#{country.rank}</b><span>of {ranked.length} countries{ratio >= 1 ? `, ${ratio.toFixed(1)} times the base rate` : ", below the base rate"}</span></div>
              <MarketFact slug={slug} />
            </>
          )}
          <div className="fact"><b>{country.attempts}</b><span>attempts since 1900, {country.successes} successful</span></div>
          <div className="fact">
            <b>{last ? fmtEventDate(last) : "–"}</b>
            <span>{last ? `latest attempt (${TYPE_LABEL[last.type]})` : "no recorded attempt"}</span>
          </div>
        </div>
      </div>
      <section className="km" aria-label="Key figures">
        <h2 className="km-title">More figures</h2>
        <div className="km-grid">
          {keyMetrics({ ...country, rankOf: ranked.length }, meta).filter((m) => !["risk", "mult", "att"].includes(m.k)).map((m) => (
            <div key={m.k} className={`km-tile ${m.tone}`}><span>{m.label}</span><b>{m.value}</b><small>{m.sub}</small></div>
          ))}
        </div>
      </section>
      <CountryAnalysis country={country} meta={meta} />
      {!country.historical && <StandingView standing={getStanding(slug)} name={country.name} />}
      {!country.historical && <CrowdView slug={slug} name={country.name} />}
      {!country.historical && <DiscourseMonitor slug={slug} name={country.name} />}
      {!country.historical && <AnalogsView analog={getAnalogs(slug)} name={country.name} modelRisk={country.risk} />}
      {!country.historical && <UnrestOutlook unrest={getUnrest(slug)} counts={getUnrestCounts(slug)} name={country.name} />}
      {(() => { const v = getViolence(slug); return v ? <ViolenceOutlook country={v.country} meta={v.meta} admin1={v.admin1} /> : null; })()}
      <Dossier key={slug} country={country} others={others} meta={meta} />
    </main>
    <SiteFooter generated={meta.generated} />
    </>
  );
}
