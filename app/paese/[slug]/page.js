import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Dossier from "@/components/Dossier";
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
    <Suspense fallback={<main className="wrap"><div className="page-head"><p className="lede">Loading country dossier…</p></div></main>}>
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
    <main className="wrap">
      <div className="page-head">
        <Link className="crumb" href="/">← Workspace</Link>
        <h1>{country.name}</h1>
        <p className="lede">
          {country.historical
            ? "Historical state: only coup records are available."
            : country.region}
        </p>
        <div className="facts">
          {!country.historical && (
            <>
              <div className="fact">
                <b>{pct(country.risk)}</b>
                <span>
                  probability of an attempt in the next {meta.horizon} months
                  {country.risk_lo != null && `, plausible range ${pct(country.risk_lo)} – ${pct(country.risk_hi)}`}
                </span>
              </div>
              <div className="fact"><b>#{country.rank}</b><span>of {ranked.length} countries{ratio >= 1 ? `, ${ratio.toFixed(1)} times the base rate` : ", below the base rate"}</span></div>
            </>
          )}
          <div className="fact"><b>{country.attempts}</b><span>attempts since 1900, {country.successes} successful</span></div>
          <div className="fact">
            <b>{last ? fmtEventDate(last) : "–"}</b>
            <span>{last ? `latest attempt (${TYPE_LABEL[last.type]})` : "no recorded attempt"}</span>
          </div>
        </div>
      </div>
      <Dossier country={country} others={others} meta={meta} />
    </main>
  );
}
