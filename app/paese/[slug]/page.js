import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Dossier from "@/components/Dossier";
import { allSlugs, getCountry, getSummary, listCountries } from "@/lib/data";
import { fmtEventDate, pct } from "@/lib/format";

export function generateStaticParams() {
  return allSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const c = getCountry(slug);
  return c ? { title: c.name, description: `Colpi di stato e rischio stimato: ${c.name}.` } : {};
}

export default function CountryPage({ params }) {
  return (
    <Suspense fallback={<main className="wrap"><div className="page-head"><p className="lede">Caricamento della scheda…</p></div></main>}>
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
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
  const ratio = country.risk != null ? country.risk / meta.base_rate : null;
  const last = country.last ? country.coups.find((e) => e.date === country.last.date && e.type === country.last.type) : null;

  return (
    <main className="wrap">
      <div className="page-head">
        <Link className="crumb" href="/">← Mondo</Link>
        <h1>{country.name}</h1>
        <p className="lede">
          {country.historical
            ? "Stato non più esistente: è disponibile solo la storia dei colpi di stato."
            : country.region}
        </p>
        <div className="facts">
          {!country.historical && (
            <>
              <div className="fact"><b>{pct(country.risk)}</b><span>rischio di un tentativo nei prossimi {meta.horizon} mesi</span></div>
              <div className="fact"><b>{country.rank}°</b><span>su {ranked.length} paesi{ratio >= 1 ? `, ${ratio.toFixed(1).replace(".", ",")} volte il tasso base` : ", sotto il tasso base"}</span></div>
            </>
          )}
          <div className="fact"><b>{country.attempts}</b><span>tentativi dal 1900, {country.successes} riusciti</span></div>
          <div className="fact">
            <b>{last ? fmtEventDate(last) : "–"}</b>
            <span>{last ? `ultimo tentativo (${last.type})` : "nessun tentativo registrato"}</span>
          </div>
        </div>
      </div>
      <Dossier country={country} others={others} meta={meta} />
    </main>
  );
}
