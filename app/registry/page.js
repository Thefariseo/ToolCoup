import Link from "next/link";
import { FiledCard, WindowCard } from "@/components/home/Filing";
import RankChart from "@/components/home/RankChart";
import SiteFooter from "@/components/SiteFooter";
import { getRegistry, REPO } from "@/lib/registry";
import hybrid from "@/webdata/hybrid.json";
import { fmtEventDate, pct } from "@/lib/format";
import { watchlist } from "@/lib/console";

export const metadata = {
  title: "Forecast registry",
  description: "Every monthly forecast, archived before its window opens and scored against what happened.",
};

const longDay = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monthsOf = ([a, b]) => { const [y, m] = a.split("-").map(Number), [yb, mb] = b.split("-").map(Number);
  return Array.from({ length: (yb - y) * 12 + mb - m + 1 }, (_, i) => mon(`${y + Math.floor((m - 1 + i) / 12)}-${((m - 1 + i) % 12) + 1}`)); };
const mon = (s) => { const [y, m] = s.split("-"); return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`; };
const skill = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
const Kind = ({ type }) => <span className={`rg-kind ${type === "riuscito" ? "ok" : "ko"}`}>{type === "riuscito" ? "Successful" : "Failed"}</span>;

const w = (v) => `${Math.round(v * 100)}%`;
const SRC = { model: "Model", market: "Markets", analyst: "Analyst" };

/** The analyst's reason: its opening on one line, the whole of it on request. */
function Rationale({ text }) {
  if (!text) return null;
  if (text.length <= 110) return text;
  return <details className="why-more"><summary><span>{text.slice(0, 110).replace(/\s+\S*$/, "")}…</span></summary><p>{text}</p></details>;
}

/** The experimental pooled reading: the latest snapshot, the weights, and whether anything has been scored yet. */
function HybridSection({ hy }) {
  const L = hy.latest, closed = hy.issues.filter((i) => i.status === "closed");
  return (
    <section className="block" id="hybrid">
      <h2>The hybrid reading (experimental)</h2>
      <p className="note rg-copy">
        A second reading beside the forecast: the model, the prediction markets and an analyst pooled into one probability. The analyst is a language
        model that reads the recent headlines found for the country and gives its own number, averaged over three independent answers because one answer
        to the same question can differ by half again from the next; it is never shown our forecast or any market price, so it adds a view instead of repeating one. The markets are restated as six-month probabilities with our own term structure, because they close
        on dates of their own. The three are averaged in log-odds with weights that start at {w(hy.priors.model)} model, {w(hy.priors.market)} markets (less when trading is thin)
        and {w(hy.priors.analyst)} analyst, and move with their record once windows close. When the sources are independent the pool is pushed a little away from the
        base rate, the way hybrid forecasting tournaments pool crowds.
      </p>
      <p className="note">
        <strong>It has no track record.</strong> {hy.issues.length} {hy.issues.length === 1 ? "snapshot" : "snapshots"} filed, {closed.length} scored. The first window closes after {mon(L.window[1])}; until then
        the weights are the priors and nothing here should be read as a better forecast than the one above. Each snapshot is filed in <code>registry/hybrid/</code> and checked by hash like the forecasts.
        {" "}<span className={hy.integrity.ok ? "rg-ok" : "rg-bad"}>{hy.integrity.ok ? "Checksums verified." : "Ledger altered."}</span>
      </p>
      <h3>Snapshot of {L.asof.slice(0, 10)} for issue {L.issue}: countries with more than one source</h3>
      <div className="rg-scroll" tabIndex={0} role="region" aria-label="Hybrid snapshot">
        <table className="rg-table">
          <thead><tr><th>Country</th><th className="num">Model</th><th className="num">Markets, as six months</th><th className="num">Analyst</th><th className="num">Pooled</th><th>Analyst, in short</th></tr></thead>
          <tbody>{L.countries.slice(0, 20).map((c) => (
            <tr key={c.slug}><td><Link href={`/paese/${c.slug}`}><span className="sx">{c.name}</span></Link></td>
              <td className="num">{pct(c.model.p, 2)}</td><td className="num">{c.market ? pct(c.market.p6, 2) : "—"}</td><td className="num">{c.analyst ? pct(c.analyst.calibrated, 2) : "—"}</td>
              <td className="num"><b>{c.pooled ? pct(c.pooled.p, 2) : "—"}</b></td><td className="why"><Rationale text={c.analyst?.rationale} /></td></tr>
          ))}</tbody>
        </table>
      </div>
      <p className="note">Weights now: {Object.entries(hy.priors).map(([k, v]) => `${SRC[k].toLowerCase()} ${w(v)} × ${Math.exp(hy.logw?.[k] ?? 0).toFixed(2)}`).join(", ")}, then normalised. Machine-readable: <a href={`${REPO}/blob/main/registry/hybrid/${L.issue}.json`}>the ledger file</a>.</p>
    </section>
  );
}

export default function RegistryPage() {
  const r = getRegistry(), h = r.hindcast, closed = r.issues.filter((i) => i.status === "closed");
  const next = r.issues.filter((i) => i.status === "open").map((i) => i.window[1]).sort()[0];
  const ranked = watchlist().length, latest = r.issues[0];
  return (
    <>
      <main id="top" className="page">
        <div className="wrap">
          <header className="page-head">
            <h1>Every forecast we have filed, and how it scored</h1>
            <div className="page-head__side">
              <p className="lede">
                Each month the published forecast goes into one file in the public repository and is never edited. When its {r.horizon}-month window ends, we count the coups
                recorded in that window and score the forecast against them. The commit history dates every file.
              </p>
            </div>
          </header>
          <div className="reg-cards">
            <FiledCard issue={latest} filed={longDay(latest.published)} closes={mon(latest.window[1])} />
            <WindowCard issue={latest} filed={longDay(latest.published)} months={monthsOf(latest.window)} closes={mon(latest.window[1])} />
          </div>
          <dl className="facts facts--band">
              <div className="fact"><dt>{r.issues.length === 1 ? "issue filed" : "issues filed"}</dt><dd>{r.issues.length}</dd></div>
              <div className="fact"><dt>{closed.length === 1 ? "window closed" : "windows closed"}</dt><dd>{closed.length}</dd></div>
              {closed.length ? <div className="fact"><dt>Brier skill against the base rate, so far</dt><dd>{skill(r.pooled?.skill)}</dd></div>
                : next ? <div className="fact"><dt>first verdict after</dt><dd>{mon(next)}</dd></div> : null}
              <div className="fact"><dt>{r.integrity.ok ? "every file matches its checksum" : "a filed file no longer matches its checksum"}</dt><dd className={r.integrity.ok ? "rg-ok" : "rg-bad"}>{r.integrity.ok ? "Verified" : "Altered"}</dd></div>
          </dl>

          <section className="block" aria-labelledby="issues-h">
            <h2 id="issues-h">Issues filed in advance</h2>
            <p className="note rg-copy"><strong>Target.</strong> {r.target} An event backed only by weaker sources is listed but does not count until the database upgrades it.</p>
            {r.issues.some((i) => i.target_version === 1) && <p className="note rg-copy">Issues {r.issues.filter((i) => i.target_version === 1).map((i) => i.issue).join(", ")} were filed under the first target definition and stay scored against it: {r.target_v1}</p>}
            {r.issues.map((i) => (
              <article key={i.issue} className="rg-issue">
                <header>
                  <h3>{i.issue}</h3>
                  <span className={`rg-status ${i.status}`}>{i.status === "open" ? "Window open" : "Window closed"}</span>
                  <span>Filed {i.published}, data through {i.data_end}, window {mon(i.window[0])} to {mon(i.window[1])}</span>
                  <span className="r">
                    <a href={`${REPO}/blob/main/registry/issues/${i.issue}.json`}>Source file</a> · <a href={`${REPO}/commits/main/registry/issues/${i.issue}.json`}>Git history</a> · SHA-256 <span className="mono">{i.sha256.slice(0, 10)}…</span>
                  </span>
                </header>
                <p className="note">
                  The model expects {i.expected.toFixed(2)} of the {i.n} entries to see an attempt ({ranked} countries and territories, plus seas, oceans and Antarctica). {i.events.filter((e) => e.counted).length} observed so far, with {i.months_observed} of {r.horizon} months of data.{" "}
                  {i.score ? `Brier skill against the base rate ${skill(i.score.skill)}; AUC ${i.score.auc ?? "n/a"}; ${i.score.top10_hits} of ${i.score.events} events in the top 10%.` : "Scoring starts when the window closes."}
                </p>
                {i.events.length > 0 && (
                  <div className="table-scroll" tabIndex={0} role="region" aria-label={`Events in issue ${i.issue}`}><table className="rg-table dense">
                    <thead><tr><th>Event</th><th>Country</th><th>Outcome</th><th className="num">Forecast</th><th className="num">Rank</th><th>Status</th></tr></thead>
                    <tbody>{i.events.map((e) => (
                      <tr key={e.slug + e.date}><td>{fmtEventDate({ date: e.date, prec: "day" })}</td><td><Link href={`/paese/${e.slug}`} prefetch={false}><span className="sx">{e.name}</span></Link></td><td><Kind type={e.type} /></td>
                        <td className="num">{pct(e.p, 2)}</td><td className="num">{e.rank}/{i.n}</td><td>{e.counted ? "counted" : `not counted yet (confidence ${e.conf})`}</td></tr>
                    ))}</tbody>
                  </table></div>
                )}
                <details className="rg-details" open={i.status === "open"}>
                  <summary>25 highest forecasts in this issue</summary>
                  <div className="table-scroll" tabIndex={0} role="region" aria-label={`Highest forecasts in issue ${i.issue}`}><table className="rg-table dense">
                    <thead><tr><th className="num">Rank</th><th>Country</th><th className="num">Chance</th><th className="num">80% range</th><th>Against the highest</th><th>Outcome</th></tr></thead>
                    <tbody>{i.top.map((f) => (
                      <tr key={f.slug} className={f.hit ? "hit" : ""}><td className="num">{f.rank}</td><td><Link href={`/forecast?c=${f.slug}`} prefetch={false}><span className="sx">{f.name}</span></Link></td><td className="num">{pct(f.p, 2)}</td>
                        <td className="num">{f.lo == null ? "—" : `${pct(f.lo)} to ${pct(f.hi)}`}</td><td style={{ minWidth: 120 }}><i className="rg-bar" style={{ width: `${(f.p / i.top[0].p) * 100}%` }} /></td>
                        <td>{f.hit ? "Attempt recorded" : i.status === "open" ? "Window open" : "None"}</td></tr>
                    ))}</tbody>
                  </table></div>
                </details>
              </article>
            ))}
          </section>

          {hybrid.latest && <HybridSection hy={hybrid} />}

          {h?.pooled && (
            <section className="block" aria-labelledby="hind-h">
              <h2 id="hind-h">Reconstruction from past forecasts</h2>
              <p className="note">
                Until real issues close, this reconstruction fills the gap. It takes the model&apos;s out-of-sample forecasts since {h.from} and cuts them into the same
                half-yearly issues. Each came from a model trained on earlier years only, but with today&apos;s code and today&apos;s data revisions, so it looks better than a live
                forecast would. We keep it apart from the registry above.
              </p>
              <dl className="facts">
                <div className="fact"><dt>country-windows, each six months long</dt><dd>{h.pooled.n.toLocaleString("en-GB")}</dd></div>
                <div className="fact"><dt>had an attempt ({h.pooled.expected.toFixed(0)} expected)</dt><dd>{h.pooled.events}</dd></div>
                <div className="fact"><dt>of those were in the model&apos;s top 10% beforehand</dt><dd>{h.pooled.top10_hits}</dd></div>
                <div className="fact"><dt>AUC; Brier skill {skill(h.pooled.skill)} against the base rate</dt><dd>{h.pooled.auc}</dd></div>
              </dl>
              <h3>Every attempt since {h.from}, and where the model ranked the country beforehand</h3>
              <ul className="record-key" aria-label="Chart key"><li><i className="ok" />Successful coup</li><li><i className="ko" />Failed attempt</li><li><i className="band" />Model&apos;s top tenth</li></ul>
              <RankChart events={h.events.map(({ slug, name, date, type, p, rank, n }) => ({ slug, name, date, type, p, rank, n }))} from={Number(h.from)} />
              <details className="rg-details">
                <summary>The same attempts as a table</summary>
              <div className="rg-scroll" tabIndex={0} role="region" aria-label="Attempts and their rank beforehand">
                <table className="rg-table dense">
                  <thead><tr><th>Event</th><th>Country</th><th>Outcome</th><th>Issue</th><th className="num">Forecast</th><th className="num">Rank</th><th>Position in the ranking, highest risk on the left</th></tr></thead>
                  <tbody>{h.events.map((e) => (
                    <tr key={e.slug + e.date}><td>{fmtEventDate({ date: e.date, prec: "day" })}</td><td><Link href={`/paese/${e.slug}`} prefetch={false}><span className="sx">{e.name}</span></Link></td><td><Kind type={e.type} /></td>
                      <td>{e.issue}</td><td className="num">{pct(e.p, 2)}</td><td className="num">{e.rank}/{e.n}</td>
                      <td><span className="rg-rank"><i style={{ left: `${((e.rank - 1) / (e.n - 1)) * 100}%` }} /></span></td></tr>
                  ))}</tbody>
                </table>
              </div>
              </details>
              <details className="rg-details">
                <summary>Scores by reconstructed issue</summary>
                <div className="table-scroll" tabIndex={0} role="region" aria-label="Scores by reconstructed issue"><table className="rg-table dense">
                  <thead><tr><th>Issue</th><th>Window</th><th className="num">Entries</th><th className="num">Expected</th><th className="num">Observed</th><th className="num">In top 10%</th><th className="num">AUC</th><th className="num">Brier skill</th></tr></thead>
                  <tbody>{h.issues.map((i) => (
                    <tr key={i.issue}><td>{i.issue}</td><td>{mon(i.window[0])} to {mon(i.window[1])}</td><td className="num">{i.n}</td><td className="num">{i.expected.toFixed(1)}</td>
                      <td className="num">{i.events}</td><td className="num">{i.top10_hits}/{i.events}</td><td className="num">{i.auc ?? "—"}</td><td className="num">{skill(i.skill)}</td></tr>
                  ))}</tbody>
                </table></div>
              </details>
              <p className="note">Machine-readable: <a href="/api/registry">/api/registry</a>. Every monthly run recomputes the scores from the filed files; if a file&rsquo;s hash no longer matches the index, the build fails.</p>
            </section>
          )}
        </div>
      </main>
      <SiteFooter generated={r.generated} />
    </>
  );
}
