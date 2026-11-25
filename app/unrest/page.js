import Link from "next/link";
import Flag from "@/components/Flag";
import Rise from "@/components/motion/Rise";
import SiteFooter from "@/components/SiteFooter";
import { getUnrestAll, getUnrestCountsGlobal } from "@/lib/outlook";
import { allSlugs } from "@/lib/data";
import unrestCounts from "@/webdata/unrest_counts.json";
import { pct } from "@/lib/format";

export const metadata = {
  title: "Unrest outlook",
  description: "The chance of a protest wave and of a violence escalation in the next three months for every country, and the protest outlook for the next six four-week periods.",
};

const sum = (a) => a.reduce((s, v) => s + v, 0);
const TARGETS = [["wave", "Protest wave", "protests and riots"], ["escalation", "Violence escalation", "organised violence"]];

export default function UnrestPage() {
  const u = getUnrestAll();
  if (!u) return <main className="wrap"><div className="page-head"><h1>Unrest outlook</h1><p className="lede">The forecast file has not been generated yet.</p></div></main>;
  const countries = Object.entries(u.countries);
  const pages = new Set(allSlugs());
  const Name = ({ slug, name, iso, hash }) => (pages.has(slug)
    ? <Link href={`/paese/${slug}#${hash}`} className="vo-link" data-scramble><Flag iso={iso} height={12} /> <span className="sx">{name}</span></Link>
    : <span><Flag iso={iso} height={12} /> {name}</span>);
  const rank = (key) => countries.filter(([, c]) => c[key]).sort(([, a], [, b]) => b[key].p - a[key].p).slice(0, 20);
  const gc = getUnrestCountsGlobal();
  const counts = Object.entries(unrestCounts.countries || {}).map(([slug, c]) => {
    const f = c.fc.o, six = sum(f.map((x) => x[0])) / f.length;
    return { slug, name: c.name, ma6: c.ma6, six, change: c.ma6 >= 10 ? six / c.ma6 - 1 : null };
  }).filter((r) => r.change != null).sort((a, b) => b.change - a.change).slice(0, 12);
  const meta = u.targets;
  const m = (k) => meta[k]?.metrics?.since_2019;
  return (
    <>
      <main className="wrap">
        <div className="page-head">
          <h1><Rise>Political unrest, three months ahead</Rise></h1>
          <p className="lede">Two questions for every country, answered from the monthly ACLED counts: will protests and riots surge, and will organised violence escalate? A surge means the next three months average at least 1.5 times the last twelve and at least 25 events a month. Data through {u.data_end}.</p>
          <p className="rg-note">Unrest is not a coup forecast. Most protest waves end without any military move, and most coups come without one. Where both readings are high, that is a country to look at first.</p>
        </div>
        {TARGETS.map(([key, label, what]) => (
          <section className="card" key={key}>
            <h2>{label}: where it is most likely</h2>
            <p className="note">{meta[key]?.definition}. A typical country-month: {pct(meta[key]?.base_rate)}.</p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={`Countries by ${label.toLowerCase()} chance`}>
              <table>
                <thead><tr><th scope="col">Country</th><th scope="col">Chance, next 3 months</th><th scope="col">80% range</th><th scope="col">Last 3 months, per month</th><th scope="col">Last 12 months, per month</th></tr></thead>
                <tbody>{rank(key).map(([slug, c]) => (
                  <tr key={slug}><th scope="row"><Name slug={slug} name={c.name} iso={c.iso} hash="unrest" /></th>
                    <td className="tnum nw"><b>{pct(c[key].p)}</b></td><td className="tnum nw">{pct(c[key].lo)} to {pct(c[key].hi)}</td>
                    <td className="tnum nw">{Math.round(c[key].last3)}</td><td className="tnum nw">{Math.round(c[key].last12)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        ))}
        {counts.length > 0 && (
          <section className="card">
            <h2>Where protests and riots are forecast to rise most</h2>
            <p className="note">Countries averaging at least 10 protests and riots per four-week period. Change compares the next six periods with the last six.</p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Countries by forecast increase in protests and riots">
              <table>
                <thead><tr><th scope="col">Country</th><th scope="col">Last 6 periods, avg</th><th scope="col">Next six, avg</th><th scope="col">Change</th></tr></thead>
                <tbody>{counts.map((r) => (
                  <tr key={r.slug}><th scope="row"><Name slug={r.slug} name={r.name} hash="unrest-counts" /></th>
                    <td className="tnum">{r.ma6.toFixed(0)}</td><td className="tnum">{r.six.toFixed(0)}</td><td className="tnum">+{(r.change * 100).toFixed(0)}%</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        )}
        <details className="card prose fold">
          <summary><h2>How accurate has it been?</h2></summary>
          <p>Each year since {u.first_test_year} is forecast by models trained only on months whose outcome was already known, with the same strict timing as the coup forecast. Two models see the same 46 variables and their log-odds are averaged: a regularised logistic regression and a gradient-boosted model. The probability is then calibrated on past forecasts only. The variables look back only: recent levels against the year, how often the country has surged before, armed violence and fatalities, repression and arrests, the seven nearest countries and the region, regime and income, the time of year.</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Accuracy of the unrest forecasts">
            <table>
              <caption>Out of sample since {u.first_test_year}: the published forecast against simple rules and its parts</caption>
              <thead><tr><th scope="col">Event</th><th scope="col">Model</th><th scope="col">AUC</th><th scope="col">AUC-PR</th><th scope="col">Share of events in the top 10% each month</th><th scope="col">Brier skill</th></tr></thead>
              <tbody>{TARGETS.flatMap(([key, label]) => (m(key) ? [["persistence", "Last quarter against the year"], ["logit", "Logistic regression"], ["lgbm_cal", "Gradient boosting"], ["ensemble", "Published (average, calibrated)"]].map(([mk, ml]) => {
                const s = m(key)[mk];
                return <tr key={key + mk}><th scope="row">{mk === "persistence" ? label : ""}</th><td>{ml}</td><td className="tnum">{s.auc}</td><td className="tnum">{s.pr_auc}</td><td className="tnum">{Math.round(s.top10_recall * 100)}%</td><td className="tnum">{s.brier_skill == null ? "–" : s.brier_skill}</td></tr>;
              }) : []))}</tbody>
            </table>
          </div>
          <p>The comparison that matters is the first row of each block: a country whose last quarter is already above its year is only a slightly better bet than any other. The models add what history cannot: whether the neighbours are surging, whether the country has been here before, what the violence and the state response look like. Even so the events are hard to time: most of the gain is in ranking countries, and probabilities stay modest. Brier skill is the improvement of the probabilities over always quoting the base rate; zero means no better.</p>
          <p>Limits. ACLED coverage widened until 2018, so earlier years are used for training only. ACLED adds and revises events for weeks afterwards, so the latest months are the least complete, and the models are trained on the final counts. A wave is defined against each country&rsquo;s own year: a country that is already in a long crisis does not count as surging. These are model estimates.</p>
        </details>
      </main>
      <SiteFooter generated={u.generated} />
    </>
  );
}
