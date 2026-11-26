import Link from "next/link";
import Flag from "@/components/Flag";
import Leaders from "@/components/Leaders";
import ValueMap, { MapKey } from "@/components/ValueMap";
import SiteFooter from "@/components/SiteFooter";
import { listCountries } from "@/lib/data";
import { violenceAll } from "@/lib/highlights";
import { getViolenceGlobal } from "@/lib/outlook";
import violence from "@/webdata/violence.json";

export const metadata = {
  title: "Violence outlook",
  description: "Forecast of organized political violence, by country and province, for the next six four-week periods.",
};

const sum = (a) => a.reduce((s, v) => s + v, 0);

export default function ViolencePage() {
  const g = getViolenceGlobal();
  if (!g) return <main id="top" className="page"><div className="wrap"><header className="page-head"><h1>Violence outlook</h1><p className="lede">The forecast file has not been generated yet.</p></header></div></main>;
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
  const hasWis = acc.some((a) => a.wis);
  const wisGain = (h) => { const a = acc.find((x) => x.h === h); return a?.wis ? Math.round((1 - a.wis.mix / a.wis.ma6) * 100) : null; };
  const world = violenceAll(), most = byLevel[0]?.six || 1;
  const Row = ({ r }) => (
    <tr><th scope="row"><Link href={`/paese/${r.slug}#violence`} className="vo-link" data-scramble><Flag iso={iso.get(r.slug)} height={12} /> <span className="sx">{r.name}</span></Link></th>
      <td className="tnum">{r.ma6.toFixed(0)}</td><td className="tnum">{Math.round(r.next)} <small>({Math.round(r.lo)}–{Math.round(r.hi)})</small></td>
      <td className="tnum cell-bar" style={{ "--v": Math.min(1, r.six / most) }}>{r.six.toFixed(0)}</td><td className="tnum">{r.change == null ? "–" : `${r.change >= 0 ? "+" : "−"}${Math.abs(r.change * 100).toFixed(0)}%`}</td></tr>
  );
  const Head = () => <thead><tr><th scope="col">Country</th><th scope="col">Last 6 periods, avg</th><th scope="col">Next period (80%)</th><th scope="col">Next six, avg</th><th scope="col">Change</th></tr></thead>;
  return (
    <>
      <main id="top" className="page">
        <div className="wrap">
        <header className="page-head">
          <h1>Political violence, six periods ahead</h1>
          <div className="page-head__side">
            <p className="lede">Organised violence (battles, explosions, remote violence and attacks on civilians) by country and province for the next six four-week periods, built from ACLED events.</p>
          </div>
        </header>
        <section className="map-block" aria-label="Map of the next period">
          <div className="map-head"><p>Organised violence events expected in the next four weeks, by country.</p></div>
          <div className="map-frame" data-ui="map">
            <ValueMap tone="rise" steps={[10, 50, 200, 1000]} values={world.map((r) => ({ iso: r.iso, name: r.name, value: r.next, text: `${Math.round(r.next).toLocaleString("en-GB")} events` }))} label={`Violence forecast by country; ${world[0].name} is highest with about ${Math.round(world[0].next).toLocaleString("en-GB")} events`} />
            <Leaders title="Most events, next four weeks" hash="#violence" rows={world.slice(0, 8).map((r) => ({ slug: r.slug, name: r.name, figure: Math.round(r.next).toLocaleString("en-GB") }))} />
            <MapKey tone="rise" labels={["under 10", "10+", "50+", "200+", "1,000+"]} />
          </div>
        </section>
        <p className="note map-note">Violence and coups do not track each other closely: most violence has nothing to do with a coup, and most coups come without a spike in violence. The last period ended {m.last_period_end}.</p>
        <dl className="facts facts--band">
            <div className="fact"><dt>events expected worldwide in the next period</dt><dd>{Math.round(gf[0][0]).toLocaleString("en-GB")}</dd></div>
            <div className="fact"><dt>average over the last six periods</dt><dd>{Math.round(sum(gh.slice(-6)) / 6).toLocaleString("en-GB")}</dd></div>
            <div className="fact"><dt>provinces forecast</dt><dd>{m.units.toLocaleString("en-GB")}</dd></div>
            <div className="fact"><dt>countries covered</dt><dd>{m.countries}</dd></div>
        </dl>
        <section className="block">
          <h2>Where the most violence is forecast</h2>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Countries by forecast violence"><table><Head /><tbody>{byLevel.map((r) => <Row key={r.slug} r={r} />)}</tbody></table></div>
        </section>
        <section className="block">
          <h2>Where violence is forecast to rise most</h2>
          <p className="note">Countries averaging at least 10 events per period. Change compares the next six periods with the last six.</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Countries by forecast increase"><table><Head /><tbody>{byRise.map((r) => <Row key={r.slug} r={r} />)}</tbody></table></div>
        </section>
        <details className="block prose fold">
          <summary><h2>How accurate has it been?</h2></summary>
          <p>We tested the forecast on {m.backtest_origins} past forecast dates, {m.backtest_stride || 4} periods apart, for organised violence at country level. The published number is a weighted average of three forecasts: a light gradient-boosted model (one model for all six horizons, trained to get the size of the change from the last six periods right), the average of the last six periods, and the last observed period carried forward. The weights differ by horizon and are fitted only on past dates whose outcome was already known, so nothing in the table looks ahead.</p>
          <p>We use two measures. <strong>WAPE</strong> is total absolute error divided by total events, so big conflicts dominate it. <strong>Relative error</strong> is the absolute error divided by the country&rsquo;s own six-period average plus one, averaged across countries, so every country counts the same. Lower is better for both.{hasWis && <> A third measure scores the whole forecast, not just its centre. The <strong>interval score (WIS)</strong> rewards a forecast that is close and also honest about its uncertainty: it combines the error of the median with the width of the 50%, 80% and 95% intervals and a penalty when the outcome falls outside them. It is a proper score, one that cannot be gamed by claiming more or less confidence than the evidence supports, and with many intervals it approaches the CRPS used to judge probabilistic forecasts of counts. As elsewhere, each date&rsquo;s intervals are built from the other dates.</>}</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Accuracy"><table>
            <caption>Country level, organized violence: the published forecast against its ingredients</caption>
            <thead><tr><th scope="col" rowSpan="2">Periods ahead</th><th scope="colgroup" colSpan="4">WAPE</th><th scope="colgroup" colSpan="4">Relative error</th>{hasWis && <th scope="colgroup" colSpan="4">Interval score (WIS)</th>}<th scope="col" rowSpan="2">Interval coverage</th></tr>
              <tr><th scope="col">Published</th><th scope="col">Model alone</th><th scope="col">6-period avg</th><th scope="col">Last</th><th scope="col">Published</th><th scope="col">Model alone</th><th scope="col">6-period avg</th><th scope="col">Last</th>{hasWis && <><th scope="col">Published</th><th scope="col">Model alone</th><th scope="col">6-period avg</th><th scope="col">Last</th></>}</tr></thead>
            <tbody>{acc.map((a) => <tr key={a.h}><th scope="row">{a.h}</th>
              <td className="tnum"><b>{a.mix?.wape}</b></td><td className="tnum">{a.model?.wape}</td><td className="tnum">{a.ma6?.wape}</td><td className="tnum">{a.last?.wape}</td>
              <td className="tnum"><b>{a.mix?.rel}</b></td><td className="tnum">{a.model?.rel}</td><td className="tnum">{a.ma6?.rel}</td><td className="tnum">{a.last?.rel}</td>
              {hasWis && <><td className="tnum"><b>{a.wis?.mix}</b></td><td className="tnum">{a.wis?.model}</td><td className="tnum">{a.wis?.ma6}</td><td className="tnum">{a.wis?.last}</td></>}
              <td className="tnum">{a.coverage != null ? `${(a.coverage * 100).toFixed(0)}%` : "–"}</td></tr>)}</tbody>
          </table></div>
          {acc.length > 0 && <p>Against the six-period average, the published forecast has {gain("wape", 1)}% lower WAPE one period ahead and {gain("wape", 6)}% lower six periods ahead; on relative error the gains are {gain("rel", 1)}% and {gain("rel", 6)}%{hasWis ? `; on the interval score they are ${wisGain(1)}% and ${wisGain(6)}%` : ""}. Most of what is left cannot be predicted from past counts: sudden escalations, sudden calm and the way events get reported set a floor. Interval coverage is the share of backtest outcomes that fell inside the {m.interval} band, for countries forecast at one event or more, with each date&rsquo;s band built from the other dates. It should be close to {m.interval.replace("%", "")}%{cov.length ? ` (here ${Math.round(Math.min(...cov) * 100)}% to ${Math.round(Math.max(...cov) * 100)}%)` : ""}.</p>}
          <p>Method: {m.method}. It follows the approach ACLED publishes for its Conflict Alert System (CAST), but the model is ours, built on ACLED event data, and is not ACLED&rsquo;s forecast. It differs from CAST in six ways: one model serves all horizons; training uses absolute error; provinces are scaled to the country total instead of reconciled with MinTraceSparse; the forecast mixes the model with simple references; the intervals come from simpler scaled residuals; and the population and infant-mortality inputs are national.</p>
        </details>
        </div>
      </main>
      <SiteFooter generated={m.generated} />
    </>
  );
}
