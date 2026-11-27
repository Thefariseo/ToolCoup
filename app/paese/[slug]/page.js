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
import WhyLedger from "@/components/WhyLedger";
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
import { allSlugs, getCountry, getSummary, listCountries, traceModel } from "@/lib/data";
import { watchlist } from "@/lib/console";
import { tracePeers } from "@/lib/trace-peers";
import { change, fmtEventDate, MONTHS, ordinal, pct, points, times, TYPE_LABEL } from "@/lib/format";

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
  const last = country.last ? country.coups.find((e) => e.date === country.last.date && e.type === country.last.type) : null;
  const live = !country.historical;
  const violence = getViolence(slug), unrest = live ? getUnrest(slug) : null;
  const slim = list.map(({ slug, name, iso, region, risk, pos }) => ({ slug, name, iso, region, risk, pos }));
  const scale = Math.max(list[0].risk_hi || list[0].risk, 0.01);
  const lastLine = last ? `${country.attempts} attempts since 1900, ${country.successes} successful; the latest on ${fmtEventDate(last)} (${TYPE_LABEL[last.type].toLowerCase()}).` : "No coup attempt is on record since 1900.";
  const delta = change(country), at = (p) => `${Math.min(100, (p / scale) * 100)}%`;
  // the figures the header already gives are left out of the grid below
  const figures = live ? keyMetrics({ ...country, rankOf: total }, meta).filter((m) => !["risk", "mult", "delta", "att"].includes(m.k)) : [];
  const standing = live && country.analysis ? [
    { k: "region", label: "Rank in its region", value: country.analysis.region.rank == null ? "–" : `${country.analysis.region.rank} of ${country.analysis.region.count}`, sub: country.region },
    { k: "own", label: "Against its own past", value: country.analysis.history.percentile == null ? "–" : `${Math.round(country.analysis.history.percentile * 100)}%`, sub: "of past estimates sat at or below today's" },
  ] : [];
  const featureGroup = live ? Object.fromEntries(traceModel().features.map((f) => [f.label, f.group])) : null;
  const ledgerCountry = live ? { slug, name: country.name, risk: country.risk, risk_lo: country.risk_lo, risk_hi: country.risk_hi, structural: country.structural } : null;

  const archive = <Dossier key={slug} country={country} others={others} meta={meta} />;
  const tabs = live ? [
    { id: "overview", label: "Overview", holds: ["figures", "assessment", "crowd"], panel: (
      <>
        <section className="block country-why" id="assessment" aria-labelledby="assessment-h">
          <h2 id="assessment-h">Why {country.name} reads {pct(country.risk)}</h2>
          <p className="note">Start from a reference country, then let each group of facts push the odds up or down. Choose a group to see inside it.</p>
          <WhyLedger country={ledgerCountry} detail={{ slug, groups: country.groups, drivers: country.drivers, diagnostics: { components: country.diagnostics?.components } }} refP={tracePeers().ref} featureGroup={featureGroup} />
          <p className="note">The groups are the terms of the logistic model, measured from its training reference; the published figure blends it with two other models. The 80% range shows how much the estimate moves when the training set changes.</p>
        </section>
        <section className="block" id="figures" aria-labelledby="figures-h">
          <h2 id="figures-h">Key figures</h2>
          <div className="km-grid">
            {[...standing, ...figures].map((m) => (
              <div key={m.k} className={`km-tile ${m.tone || ""}`}><span>{m.label}</span><b>{m.value}</b><small>{m.sub}</small></div>
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
                <p className="country-hero__p">
                  <b><CountUp value={country.risk} start={0} fmt="pct" duration={900} /></b>
                  <span>chance of a coup attempt<br />{shortMonth(meta.forecast_from)} to {shortMonth(meta.forecast_to)}</span>
                </p>
                {country.risk_lo != null && (
                  <div className="country-hero__range">
                    <div className="cx-ci" role="img" aria-label={`80% range ${pct(country.risk_lo)} to ${pct(country.risk_hi)}; a typical country is at ${pct(meta.base_rate)}`}>
                      <s style={{ left: at(meta.base_rate) }} />
                      <i style={{ left: at(country.risk_lo), width: `calc(${at(country.risk_hi)} - ${at(country.risk_lo)})` }} />
                      <u style={{ left: at(country.risk) }} />
                    </div>
                    <p className="cx-ci__key"><span><s />typical country {pct(meta.base_rate)}</span><span><i />80% range {pct(country.risk_lo)} to {pct(country.risk_hi)}</span></p>
                  </div>
                )}
                <dl className="cx-tiles country-hero__tiles">
                  <div><dt>Rank</dt><dd>{ordinal(me?.pos ?? country.rank)}<small> of {total}</small></dd></div>
                  <div><dt>Typical country</dt><dd>{times(country.risk / meta.base_rate)}</dd></div>
                  <div><dt>3 months</dt><dd className={delta > 0.0005 ? "up" : delta < -0.0005 ? "down" : ""}>{country.risk_3m_ago == null ? "n/a" : points(delta)}<small> pts</small></dd></div>
                </dl>
                <MarketFact slug={slug} />
                <div className="btn-row">
                  <Link className="btn btn--primary" href={`/forecast?c=${slug}`}>Open {country.name} in the console</Link>
                  <a className="btn btn--secondary" href="#archive">Read its coup record</a>
                </div>
              </>
            )}
          </div>
          {live && me && <CountryGlobe list={slim} slug={slug} still={<GlobeStill list={slim} center={centerOf(country.iso)} />} />}
          {!live && (
            <dl className="facts country-hero__facts">
              <div className="fact"><dt>attempts since 1900, {country.successes} successful</dt><dd>{country.attempts}</dd></div>
              <div className="fact"><dt>{last ? `latest attempt (${TYPE_LABEL[last.type].toLowerCase()})` : "no recorded attempt"}</dt><dd>{last ? fmtEventDate(last) : "–"}</dd></div>
            </dl>
          )}
        </header>
        {live ? <CountryTabs tabs={tabs} /> : <div className="ctabs__panel">{archive}</div>}
      </div>
    </main>
    <SiteFooter generated={meta.generated} />
    </>
  );
}
