import { geoCentroid } from "d3-geo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { feature } from "topojson-client";
import topo from "world-atlas/countries-110m.json";
import Dossier from "@/components/Dossier";
import CountryAnalysis from "@/components/CountryAnalysis";
import AnalogsView from "@/components/AnalogsView";
import CrowdView from "@/components/CrowdView";
import MarketFact from "@/components/MarketFact";
import DiscourseMonitor from "@/components/DiscourseMonitor";
import StandingView from "@/components/StandingView";
import ViolenceOutlook from "@/components/ViolenceOutlook";
import UnrestOutlook from "@/components/UnrestOutlook";
import CountryGlobe from "@/components/country/CountryGlobe";
import CountryTabs from "@/components/country/CountryTabs";
import GlobeStill from "@/components/home/GlobeStill";
import { getAnalogs, getStanding, getUnrest, getUnrestCounts, getViolence } from "@/lib/outlook";
import Flag from "@/components/Flag";
import CountUp from "@/components/motion/CountUp";
import { keyMetrics } from "@/lib/country-metrics";
import SiteFooter from "@/components/SiteFooter";
import { allSlugs, getCountry, getSummary, listCountries } from "@/lib/data";
import { watchlist } from "@/lib/console";
import { fmtEventDate, MONTHS, pct, TYPE_LABEL } from "@/lib/format";

const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
const shortMonth = (s) => { const [y, m] = s.split("-"); return `${MONTHS[m - 1]} ${y}`; };
const shapes = feature(topo, topo.objects.countries).features;
const centerOf = (iso) => { const f = shapes.find((x) => x.id === String(iso).padStart(3, "0")); return f ? geoCentroid(f) : null; };

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
    <Suspense fallback={<main id="top" className="page"><div className="wrap"><p className="lede">Loading the country page…</p></div></main>}>
      <CountryContent params={params} />
    </Suspense>
  );
}

async function CountryContent({ params }) {
  const { slug } = await params;
  const country = getCountry(slug);
  if (!country) notFound();
  const { meta } = getSummary();
  const others = listCountries().filter((c) => !c.historical && c.slug !== slug).map((c) => ({ slug: c.slug, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  const list = watchlist(), total = list.length;   // countries and territories, without seas, oceans and Antarctica
  const me = list.find((c) => c.slug === slug);
  const ratio = country.risk != null ? country.risk / meta.base_rate : null;
  const last = country.last ? country.coups.find((e) => e.date === country.last.date && e.type === country.last.type) : null;
  const live = !country.historical;
  const violence = getViolence(slug), unrest = live ? getUnrest(slug) : null;
  const slim = list.map(({ slug, name, iso, region, risk, pos }) => ({ slug, name, iso, region, risk, pos }));
  const scale = Math.max(list[0].risk_hi || list[0].risk, 0.01);
  const lastLine = last ? `The latest attempt on record was ${fmtEventDate(last)} (${TYPE_LABEL[last.type].toLowerCase()}).` : "No attempt is on record.";

  const archive = <Dossier key={slug} country={country} others={others} meta={meta} />;
  const tabs = live ? [
    { id: "overview", label: "Overview", holds: ["figures", "assessment", "crowd"], panel: (
      <>
        <CountryAnalysis country={country} meta={meta} part="assessment" />
        <section className="block" id="figures" aria-labelledby="figures-h">
          <h2 id="figures-h">Key figures</h2>
          <div className="km-grid">
            {keyMetrics({ ...country, rankOf: total }, meta).filter((m) => !["risk", "mult", "att"].includes(m.k)).map((m) => (
              <div key={m.k} className={`km-tile ${m.tone}`}><span>{m.label}</span><b>{m.value}</b><small>{m.sub}</small></div>
            ))}
          </div>
        </section>
        <CrowdView slug={slug} name={country.name} />
      </>
    ) },
    { id: "record", label: "History", holds: ["history", "archive", "analogs"], panel: <>{archive}<AnalogsView analog={getAnalogs(slug)} name={country.name} modelRisk={country.risk} /></> },
    { id: "activity", label: "Signals", holds: ["signals", "discourse", "unrest", "unrest-counts", "violence"], panel: (
      <>
        <CountryAnalysis country={country} meta={meta} part="signals" />
        <DiscourseMonitor slug={slug} name={country.name} />
        <UnrestOutlook unrest={unrest} counts={getUnrestCounts(slug)} name={country.name} />
        {violence && <ViolenceOutlook country={violence.country} meta={violence.meta} admin1={violence.admin1} />}
      </>
    ) },
    { id: "context", label: "Context", holds: ["institutions", "region", "standing"], panel: <><CountryAnalysis country={country} meta={meta} part="context" /><StandingView standing={getStanding(slug)} name={country.name} /></> },
    { id: "evidence", label: "Evidence", holds: ["quality"], panel: <CountryAnalysis country={country} meta={meta} part="quality" /> },
  ] : null;

  return (
    <>
    <main id="top" className="page country">
      <div className="wrap">
        <header className={`country-hero${live ? "" : " country-hero--past"}`}>
          <div className="country-hero__text">
            <h1><Flag iso={country.iso} height={34} eager />{country.name}</h1>
            <p className="lede">{live ? `${country.region}. ${lastLine}` : "Historical state: only coup records are available."}</p>
            {live && (
              <>
                <div className="country-hero__p">
                  <b><CountUp value={country.risk} start={0} fmt="pct" duration={900} /></b>
                  <p><strong>{ratio >= 1 ? `${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)}× a typical country` : "Below a typical country"}</strong>, {ordinal(me?.pos ?? country.rank)} of {total}.<br />Chance of a coup attempt, {shortMonth(meta.forecast_from)} to {shortMonth(meta.forecast_to)}.</p>
                </div>
                {country.risk_lo != null && (
                  <div className="country-hero__range">
                    <div className="range" aria-hidden="true"><i style={{ left: `${(country.risk_lo / scale) * 100}%`, width: `${((country.risk_hi - country.risk_lo) / scale) * 100}%` }} /><u style={{ left: `${(country.risk / scale) * 100}%` }} /></div>
                    <p><span>80% range {pct(country.risk_lo)} to {pct(country.risk_hi)}</span><span>scale to {pct(scale)}, this month&apos;s highest</span></p>
                  </div>
                )}
                <div className="btn-row">
                  <Link className="btn btn--primary" href={`/forecast?c=${slug}`}>Open {country.name} in the console</Link>
                  <a className="btn btn--secondary" href="#archive">Read its coup record</a>
                </div>
              </>
            )}
          </div>
          {live && me && <CountryGlobe list={slim} slug={slug} still={<GlobeStill list={slim} center={centerOf(country.iso)} />} />}
          <dl className="facts country-hero__facts">
            {live && <MarketFact slug={slug} />}
            <div className="fact"><dt>attempts since 1900, {country.successes} successful</dt><dd>{country.attempts}</dd></div>
            <div className="fact"><dt>{last ? `latest attempt (${TYPE_LABEL[last.type].toLowerCase()})` : "no recorded attempt"}</dt><dd>{last ? fmtEventDate(last) : "–"}</dd></div>
            {live && country.risk_3m_ago != null && <div className="fact"><dt>change in three months, in points</dt><dd className={country.risk - country.risk_3m_ago > 0 ? "up" : "down"}>{country.risk - country.risk_3m_ago > 0 ? "+" : "−"}{Math.abs((country.risk - country.risk_3m_ago) * 100).toFixed(1)}</dd></div>}
          </dl>
        </header>
        {live ? <CountryTabs tabs={tabs} /> : <div className="ctabs__panel">{archive}</div>}
      </div>
    </main>
    <SiteFooter generated={meta.generated} />
    </>
  );
}
