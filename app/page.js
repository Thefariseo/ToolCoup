import Link from "next/link";
import { preloadModule } from "react-dom";
import AtlasStill from "@/components/home/AtlasStill";
import BriefLink from "@/components/home/BriefLink";
import BriefSheets from "@/components/home/BriefSheets";
import { FieldLayer, HeroActions, HeroCard, HeroPause, HeroPick } from "@/components/home/FieldHero";
import { FiledCard, ScoreCard, WindowCard } from "@/components/home/Filing";
import { PickChips, PickProvider } from "@/components/home/Pick";
import Leaders from "@/components/Leaders";
import RankChart from "@/components/home/RankChart";
import Tabs from "@/components/home/Tabs";
import WhenAtlas from "@/components/home/WhenAtlas";
import WhyTrace from "@/components/home/WhyTrace";
import KitRuntime from "@/components/site/KitRuntime";
import ValueMap, { MapKey } from "@/components/ValueMap";
import { FooterDirectory } from "@/components/SiteFooter";
import { watchlist } from "@/lib/console";
import { getCountry, getSummary, listCountries, traceModel } from "@/lib/data";
import { MONTHS, num, pct } from "@/lib/format";
import { marketTop, unrestAll, violenceAll } from "@/lib/highlights";
import { getRegistry } from "@/lib/registry";
import { tracePeers } from "@/lib/trace-peers";

const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longMonth = (s) => { const [y, m] = s.split("-"); return `${LONG[m - 1]} ${y}`; };
const shortMonth = (s) => { const [y, m] = s.split("-"); return `${MONTHS[m - 1]} ${y}`; };
const longDay = (s) => { const [y, m, d] = s.split("-").map(Number); return `${d} ${LONG[m - 1]} ${y}`; };
const monthsOf = ([a, b]) => { const [y, m] = a.split("-").map(Number), [yb, mb] = b.split("-").map(Number), n = (yb - y) * 12 + mb - m + 1;
  return Array.from({ length: n }, (_, i) => `${MONTHS[(m - 1 + i) % 12]} ${y + Math.floor((m - 1 + i) / 12)}`); };
const Arrow = () => <svg className="m-arrow" viewBox="0 0 12 12" aria-hidden="true"><path className="m-arrow__stem" d="M1 6h8" /><path className="m-arrow__head" d="M4.5 2.5 8 6l-3.5 3.5" /></svg>;

export default function Home() {
  preloadModule("/assets/motion/motion.js");
  preloadModule("/assets/moments/moments.js");
  const { meta } = getSummary(), list = watchlist(), registry = getRegistry(), issue = registry.issues[0], h = registry.hindcast;
  const first = list[0], detail = getCountry(first.slug), refP = tracePeers().ref;
  const featureGroup = Object.fromEntries(traceModel().features.map((f) => [f.label, f.group]));
  const slim = list.map(({ slug, name, iso, region, risk, risk_lo, risk_hi, risk_3m_ago, pos }) => ({ slug, name, iso, region, risk, risk_lo, risk_hi, risk_3m_ago, pos }));
  const options = listCountries().map((c) => ({ slug: c.slug, name: c.name, region: c.region }));
  const span = `${shortMonth(meta.forecast_from)} to ${shortMonth(meta.forecast_to)}`;
  const violence = violenceAll(), unrest = unrestAll(), markets = marketTop(8);
  const detailSlim = { slug: detail.slug, groups: detail.groups, drivers: detail.drivers, diagnostics: { components: detail.diagnostics?.components }, risk_hist: detail.risk_hist, coups: detail.coups, series: detail.series };

  return (
    <PickProvider list={slim} first={{ slug: first.slug, detail: detailSlim }}>
      <main id="top">
        <section className="hero hero--photo hero--field" data-enter data-calm="left" data-box="none" data-tone="dark" aria-labelledby="hero-h">
          <FieldLayer />
          <div className="wrap">
            <div className="hero-text">
              <HeroPause />
              <div className="hero__text">
                <h1 id="hero-h">Coup-risk forecasts for every country</h1>
                <p className="hero__lead">A six-month chance of a coup attempt for {list.length} countries and territories, filed in public each month, then scored.</p>
                <HeroPick options={options} span={shortMonth(meta.forecast_to)} />
                <HeroActions />
              </div>
              <HeroCard span={shortMonth(meta.forecast_to)} base={meta.base_rate} />
            </div>
          </div>
        </section>

        <section className="section" id="when" aria-labelledby="when-h">
          <div className="wrap">
            <div className="home-head">
              <div>
                <h2 id="when-h">When the risk rose, 1975 to today</h2>
                <p>One ridge per country: what the model would have said each quarter. Taller means a higher chance.</p>
              </div>
              <PickChips count={5} label="Countries to light" />
            </div>
            <WhenAtlas still={<AtlasStill />} />
          </div>
        </section>

        <section className="section" id="why" aria-labelledby="why-h">
          <div className="wrap">
            <WhyTrace refP={refP} featureGroup={featureGroup} />
          </div>
        </section>

        <section className="section" id="record" aria-labelledby="record-h">
          <div className="wrap">
            <div className="home-head">
              <div>
                <h2 id="record-h">Where past coup attempts ranked</h2>
                <p>Rebuilt year by year from {h.from} with only earlier data, so it flatters a live forecast.</p>
                <ul className="record-key" aria-label="Chart key">
                  <li><i className="ok" />Successful coup</li><li><i className="ko" />Failed attempt</li><li><i className="band" />Model&apos;s top tenth</li>
                </ul>
              </div>
            </div>
            <RankChart events={h.events.map(({ slug, name, date, type, p, rank, n }) => ({ slug, name, date, type, p, rank, n }))} from={Number(h.from)} />
            <div className="proof" data-moment="counter-rolls">
              <div><p className="t-stat">{h.pooled.top10_hits}</p><p className="t-small muted">of {h.pooled.events} attempts since {h.from} came from the model&apos;s top tenth</p></div>
              <div><p className="t-stat">{h.pooled.auc.toFixed(2)}</p><p className="t-small muted">chance it ranked an attempt above a quiet window (AUC)</p></div>
              <div><p className="t-stat">{num(h.pooled.n)}</p><p className="t-small muted">six-month country windows scored out of sample</p></div>
            </div>
          </div>
        </section>

        <section className="section ground-inverse brief-section" id="brief" aria-labelledby="brief-h">
          <div className="wrap">
            <div className="home-head">
              <div>
                <h2 id="brief-h">A coup-risk brief for each country</h2>
                <p>Four PDF pages, written for the reader you pick, in about two minutes.</p>
              </div>
              <BriefLink />
            </div>
            <div className="grid grid--top brief-row">
              <BriefSheets slug={first.slug} />
              <ol className="brief-pages span-4">
                <li><span>Page 1</span><span>Cover with the flag and the country&apos;s outline</span></li>
                <li><span>Page 2</span><span>Five key figures, takeaways and the history</span></li>
                <li><span>Page 3</span><span>Evidence against the press, markets, drivers</span></li>
                <li><span>Page 4</span><span>Context, signposts and three scenarios</span></li>
              </ol>
            </div>
          </div>
        </section>

        <section className="section" id="registry" data-moment="pinned-chapters" style={{ "--h": 2 }} aria-labelledby="registry-h">
          <div className="wrap mo-pc__grid">
            <div className="mo-pc__text">
              <h2 id="registry-h">How each forecast earns its record</h2>
              <ol className="mo-pc__steps">
                <li className="mo-pc__step">
                  <h3>File the forecast before its window</h3>
                  <p>Each issue goes into a public repository with its checksum, and is never edited.</p>
                  <figure className="mo-pc__visual"><FiledCard issue={issue} filed={longDay(issue.published)} closes={longMonth(issue.window[1])} /></figure>
                </li>
                <li className="mo-pc__step">
                  <h3>Let the six-month window run</h3>
                  <p>The window runs {shortMonth(issue.window[0])} to {shortMonth(issue.window[1])}. Attempts count as sources confirm them.</p>
                  <figure className="mo-pc__visual"><WindowCard issue={issue} filed={longDay(issue.published)} months={monthsOf(issue.window)} closes={longMonth(issue.window[1])} /></figure>
                </li>
                <li className="mo-pc__step">
                  <h3>Score the forecast against coups</h3>
                  <p>When the window closes it is scored beside a base-rate guess, hits and misses alike.</p>
                  <figure className="mo-pc__visual"><ScoreCard h={h.pooled} filed={longDay(issue.published)} closes={longMonth(issue.window[1])} /></figure>
                </li>
              </ol>
              <p className="mo-pc__more"><Link className="link" href="/registry">Read the forecast registry</Link></p>
            </div>
            <div className="mo-pc__visuals frame" />
          </div>
        </section>

        <section className="section" id="outlooks" aria-labelledby="outlooks-h">
          <div className="wrap">
            <div className="home-head">
              <div>
                <h2 id="outlooks-h">Violence, unrest and market forecasts</h2>
                <p>Three readings beside the coup forecast, each with its own record and limits.</p>
              </div>
            </div>
            <Tabs label="Outlooks" tabs={[
              { label: "Violence", panel: (
                <>
                  <div className="map-head"><p>Organised violence events expected in the next four weeks. <Link href="/violence">Open the violence forecast</Link></p></div>
                  <div className="map-frame" data-ui="map">
                    <ValueMap tone="rise" hash="#violence" steps={[10, 50, 200, 1000]} values={violence.map((v) => ({ iso: v.iso, slug: v.slug, name: v.name, value: v.next, text: `${num(Math.round(v.next))} events expected in four weeks` }))} label={`Violence forecast by country; ${violence[0].name} is highest with about ${num(Math.round(violence[0].next))} events`} />
                    <Leaders title="Most events" rows={violence.slice(0, 6).map((v) => ({ slug: v.slug, name: v.name, figure: num(Math.round(v.next)) }))} />
                    <MapKey tone="rise" labels={["under 10", "10+", "50+", "200+", "1,000+"]} />
                  </div>
                </>
              ) },
              { label: "Unrest", panel: (
                <>
                  <div className="map-head"><p>Chance of a protest wave in the next three months. <Link href="/unrest">Open the unrest forecast</Link></p></div>
                  <div className="map-frame" data-ui="map">
                    <ValueMap tone="coup" hash="#unrest" steps={[0.03, 0.08, 0.15, 0.25]} values={unrest.map((u) => ({ iso: u.iso, slug: u.slug, name: u.name, value: u.p, text: `${pct(u.p, 0)} chance of a protest wave` }))} label={`Chance of a protest wave by country; ${unrest[0].name} is highest at ${pct(unrest[0].p, 0)}`} />
                    <Leaders title="Highest chance" rows={unrest.slice(0, 6).map((u) => ({ slug: u.slug, name: u.name, figure: pct(u.p, 0) }))} />
                    <MapKey tone="coup" labels={["under 3%", "3%+", "8%+", "15%+", "25%+"]} />
                  </div>
                </>
              ) },
              { label: "Markets", panel: (
                <>
                  <div className="map-head"><p>Coup markets read on {longDay(markets.asOf.slice(0, 10))}, beside our chance for the same date. <Link href="/markets">Open markets and the model</Link></p></div>
                  <div className="map-frame" data-ui="map">
                    <ValueMap tone="fall" hash="#crowd" steps={[0, 0.01, 0.03, 0.1]} values={markets.rows.map((m) => ({ iso: m.iso, slug: m.slug, name: m.name, value: m.p, text: `market ${pct(m.p, 1)}, model ${pct(m.model, 1)}` }))} label="Countries with an open coup market" />
                    <Leaders title="Market price · model" rows={markets.rows.slice(0, 6).map((m) => ({ slug: m.slug, name: m.name, figure: pct(m.p, 1), note: pct(m.model, 1) }))} />
                    <MapKey tone="fall" labels={["no market", "under 1%", "1%+", "3%+", "10%+"]} />
                  </div>
                </>
              ) },
            ]} />
          </div>
        </section>

        <section className="section" id="questions" aria-labelledby="questions-h">
          <div className="wrap">
            <div className="grid faq-row fill">
              <div className="span-5 faq-side">
                <h2 id="questions-h">Questions about the forecast</h2>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="faq-augur" src="/brand/praevex-mark-dark.png" width="640" height="840" loading="lazy" alt="The Praevex emblem: an engraving of a veiled Roman augur holding a curved staff, a bird at his feet" />
              </div>
              <dl className="faq span-6 start-7">
                <div className="faq__item"><h3>What does the forecast percentage mean?</h3><p>The chance of at least one coup attempt, successful or failed, within the issue&apos;s six months.</p></div>
                <div className="faq__item"><h3>How accurate has the forecast been?</h3><p>No live window has closed yet. Rebuilt out of sample since {h.from}, the model reached an AUC of {h.pooled.auc.toFixed(2)}.</p></div>
                <div className="faq__item"><h3>How often does the forecast change?</h3><p>Once a month, from freshly downloaded sources and retrained models.</p></div>
                <div className="faq__item"><h3>Does the forecast use prediction markets?</h3><p>No. Prices sit beside it; the <Link href="/registry#hybrid">hybrid reading</Link> that pools them is experimental.</p></div>
                <div className="faq__item"><h3>Can I check a filed forecast?</h3><p>Yes. Each issue is a public file with its SHA-256 checksum, dated by its commit.</p></div>
              </dl>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer closing footer--dark" id="contact" aria-labelledby="close-h">
        <div className="wrap">
          <div className="closing__cta close--type">
            <div className="section-head">
              <h2 id="close-h">This month&apos;s coup-risk forecast</h2>
              <p>Issue {longMonth(issue.issue)} covers {span}. A new one is filed every month.</p>
            </div>
            <Link className="btn btn--primary btn--xl btn--wide" href="/forecast">See the forecast<Arrow /></Link>
          </div>
          <FooterDirectory generated={meta.generated} />
        </div>
      </footer>
      <KitRuntime />
    </PickProvider>
  );
}
