import Link from "next/link";
import Flag from "@/components/Flag";
import SiteFooter from "@/components/SiteFooter";
import { listCountries } from "@/lib/data";
import { getViolenceGlobal } from "@/lib/outlook";
import violence from "@/webdata/violence.json";

export const metadata = {
  title: "Violence outlook",
  description: "Forecast of organized political violence, by country and province, for the next six four-week periods.",
};

const sum = (a) => a.reduce((s, v) => s + v, 0);

export default function ViolencePage() {
  const g = getViolenceGlobal();
  if (!g) return <main className="wrap"><div className="page-head"><h1>Violence outlook</h1><p className="lede">The forecast file has not been generated yet.</p></div></main>;
  const iso = new Map(listCountries().map((c) => [c.slug, c.iso]));
  const rows = Object.entries(violence.countries).map(([slug, c]) => {
    const f = c.fc.o, six = sum(f.map((x) => x[0])) / f.length;
    return { slug, name: c.name, ma6: c.ma6, next: f[0][0], lo: f[0][1], hi: f[0][2], six, change: c.ma6 >= 3 ? six / c.ma6 - 1 : null };
  }).filter((r) => r.ma6 >= 3 || r.six >= 3);
  const byLevel = [...rows].sort((a, b) => b.six - a.six).slice(0, 25);
  const byRise = rows.filter((r) => r.change != null && r.ma6 >= 10).sort((a, b) => b.change - a.change).slice(0, 12);
  const gf = g.global.fc.o, gh = g.global.hist.o;
  const m = g.meta, acc = m.accuracy_country_total || [];
  const gain = (k, h) => { const a = acc.find((x) => x.h === h); return a ? Math.round((1 - a.mix[k] / a.ma6[k]) * 100) : null; };
  const cov = acc.map((a) => a.coverage).filter((v) => v != null);
  const Row = ({ r }) => (
    <tr><th scope="row"><Link href={`/paese/${r.slug}#violence`} className="vo-link"><Flag iso={iso.get(r.slug)} height={12} /> {r.name}</Link></th>
      <td className="tnum">{r.ma6.toFixed(0)}</td><td className="tnum">{Math.round(r.next)} <small>({Math.round(r.lo)}–{Math.round(r.hi)})</small></td>
      <td className="tnum">{r.six.toFixed(0)}</td><td className="tnum">{r.change == null ? "–" : `${r.change >= 0 ? "+" : "−"}${Math.abs(r.change * 100).toFixed(0)}%`}</td></tr>
  );
  const Head = () => <thead><tr><th scope="col">Country</th><th scope="col">Last 6 periods, avg</th><th scope="col">Next period (80%)</th><th scope="col">Next six, avg</th><th scope="col">Change</th></tr></thead>;
  return (
    <>
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">VIOLENCE OUTLOOK</p>
          <h1>Political violence, six periods ahead</h1>
          <p className="lede">Events of organized violence (battles, explosions and remote violence, violence against civilians) expected in each four-week period, by country and province. Updated monthly from ACLED events; periods end {m.last_period_end}. A separate question from the coup forecast: most violence is not a coup, and most coups are not preceded by it.</p>
          <div className="facts">
            <div className="fact"><b>{Math.round(gf[0][0]).toLocaleString("en-GB")}</b><span>events forecast worldwide in the next four-week period</span></div>
            <div className="fact"><b>{Math.round(sum(gh.slice(-6)) / 6).toLocaleString("en-GB")}</b><span>average per period over the last six</span></div>
            <div className="fact"><b>{m.units.toLocaleString("en-GB")}</b><span>provinces in {m.countries} countries</span></div>
          </div>
        </div>
        <section className="card">
          <h2>Where the most violence is forecast</h2>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Countries by forecast violence"><table><Head /><tbody>{byLevel.map((r) => <Row key={r.slug} r={r} />)}</tbody></table></div>
        </section>
        <section className="card">
          <h2>Where violence is forecast to rise most</h2>
          <p className="note">Countries averaging at least 10 events per period. Change compares the next six periods with the last six.</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Countries by forecast increase"><table><Head /><tbody>{byRise.map((r) => <Row key={r.slug} r={r} />)}</tbody></table></div>
        </section>
        <section className="card prose">
          <h2>How accurate has it been?</h2>
          <p>Backtest on {m.backtest_origins} past forecast origins ({m.backtest_stride || 4} periods apart), organized violence, country level. The published forecast is a weighted average of three forecasts: a light gradient boosted machine (one model for all six horizons, trained to get the size of the change from the last six periods right), the average of the last six periods, and the last observed period carried forward. The weights differ by horizon and are fitted only on past origins whose outcome was already known, so nothing in the table looks ahead.</p>
          <p>Two measures. <strong>WAPE</strong> is total absolute error divided by total events, so large conflicts dominate. <strong>Relative error</strong> is the absolute error divided by the country&rsquo;s own six-period average plus one, averaged over countries, so every country counts equally. Lower is better in both.</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Accuracy"><table>
            <caption>Country level, organized violence: the published forecast against its ingredients</caption>
            <thead><tr><th scope="col" rowSpan="2">Periods ahead</th><th scope="colgroup" colSpan="4">WAPE</th><th scope="colgroup" colSpan="4">Relative error</th><th scope="col" rowSpan="2">Interval coverage</th></tr>
              <tr><th scope="col">Published</th><th scope="col">Model alone</th><th scope="col">6-period avg</th><th scope="col">Last</th><th scope="col">Published</th><th scope="col">Model alone</th><th scope="col">6-period avg</th><th scope="col">Last</th></tr></thead>
            <tbody>{acc.map((a) => <tr key={a.h}><th scope="row">{a.h}</th>
              <td className="tnum"><b>{a.mix?.wape}</b></td><td className="tnum">{a.model?.wape}</td><td className="tnum">{a.ma6?.wape}</td><td className="tnum">{a.last?.wape}</td>
              <td className="tnum"><b>{a.mix?.rel}</b></td><td className="tnum">{a.model?.rel}</td><td className="tnum">{a.ma6?.rel}</td><td className="tnum">{a.last?.rel}</td>
              <td className="tnum">{a.coverage != null ? `${(a.coverage * 100).toFixed(0)}%` : "–"}</td></tr>)}</tbody>
          </table></div>
          {acc.length > 0 && <p>Against the six-period average, the published forecast has {gain("wape", 1)}% lower WAPE one period ahead and {gain("wape", 6)}% lower six periods ahead; on relative error the gains are {gain("rel", 1)}% and {gain("rel", 6)}%. Most of the remaining error is not predictable from past counts: sudden escalations and de-escalations, and the way events are reported, set the floor. Interval coverage is the share of backtest outcomes inside the {m.interval} band, for countries forecast at one event or more, with each origin&rsquo;s band built from the other origins; it should be near {m.interval.replace("%", "")}%{cov.length ? ` (here ${Math.round(Math.min(...cov) * 100)}% to ${Math.round(Math.max(...cov) * 100)}%)` : ""}.</p>}
          <p>Method: {m.method}. Adapted from the methodology ACLED publishes for its Conflict Alert System (CAST); this is our own model, built on ACLED event data, and is not ACLED&rsquo;s forecast. Differences from CAST: one model for all horizons instead of one per horizon, absolute-error training, provinces scaled to the country total instead of MinTraceSparse reconciliation, a weighted mix with simple references, simpler scaled-residual intervals, national rather than subnational population and infant-mortality inputs.</p>
        </section>
      </main>
      <SiteFooter generated={m.generated} />
    </>
  );
}
