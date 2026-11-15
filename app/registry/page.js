import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { getRegistry, REPO } from "@/lib/registry";
import Rise from "@/components/motion/Rise";
import { fmtEventDate, pct } from "@/lib/format";

export const metadata = {
  title: "Forecast registry",
  description: "Every monthly forecast, archived before its window opens and scored against what happened.",
};

const mon = (s) => { const [y, m] = s.split("-"); return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`; };
const skill = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
const Kind = ({ type }) => <span className={`rg-kind ${type === "riuscito" ? "ok" : "ko"}`}>{type === "riuscito" ? "◆ Successful" : "◇ Failed"}</span>;

export default function RegistryPage() {
  const r = getRegistry(), h = r.hindcast, closed = r.issues.filter((i) => i.status === "closed");
  const next = r.issues.filter((i) => i.status === "open").map((i) => i.window[1]).sort()[0];
  return (
    <><main className="rg wrap">
      <header className="rg-head page-head">
        <h1><Rise>Filed before the fact. Scored after.</Rise></h1>
        <p className="lede">
          Each month the published forecast is frozen into one file, committed to the public repository and never edited. When its
          {" "}{r.horizon}-month window closes it is compared with the coups recorded in that window. A backtest can be tuned until
          it looks good; a forecast with a timestamp cannot.
        </p>
        <p className="rg-line">
          {r.issues.length} {r.issues.length === 1 ? "issue" : "issues"} filed, {closed.length} {closed.length === 1 ? "window" : "windows"} closed.{" "}
          {closed.length ? `Scored so far: Brier skill ${skill(r.pooled?.skill)} against the base rate.` : next ? `The first verdict comes after ${mon(next)}.` : ""}{" "}
          <span className={`rg-integ ${r.integrity.ok ? "ok" : "bad"}`}>{r.integrity.ok ? "Archive checksums verified." : "Archive altered."}</span>
        </p>
        <p className="rg-note"><strong>Target.</strong> {r.target} Events confirmed only by weaker sources are listed but not counted until the database upgrades them.</p>
        {r.issues.some((i) => i.target_version === 1) && <p className="rg-note">Issues {r.issues.filter((i) => i.target_version === 1).map((i) => i.issue).join(", ")} were filed under the first target definition and stay scored against it: {r.target_v1}</p>}
      </header>

      <section>
        <h2>Issues filed in advance</h2>
        {r.issues.map((i) => (
          <article key={i.issue} className="rg-issue">
            <header>
              <h3>#{i.issue}</h3>
              <span className={`rg-status ${i.status}`}>{i.status === "open" ? "Open" : "Closed"}</span>
              <span>filed {i.published} · data through {i.data_end} · window {mon(i.window[0])} → {mon(i.window[1])}</span>
              <span className="r">
                <a href={`${REPO}/blob/main/registry/issues/${i.issue}.json`}>Source file</a> · <a href={`${REPO}/commits/main/registry/issues/${i.issue}.json`}>Git history</a> · SHA-256 {i.sha256.slice(0, 10)}…
              </span>
            </header>
            <p className="rg-line">
              {i.n} countries, of which the model expects {i.expected.toFixed(2)} to have an attempt. {i.events.filter((e) => e.counted).length} observed so far, with {i.months_observed} of {r.horizon} months of data.{" "}
              {i.score ? `Brier skill against the base rate ${skill(i.score.skill)}; AUC ${i.score.auc ?? "n/a"}; ${i.score.top10_hits} of ${i.score.events} events in the top 10%.` : "Scoring starts when the window closes."}
            </p>
            {i.events.length > 0 && (
              <table className="rg-table">
                <thead><tr><th>Event</th><th>Country</th><th>Outcome</th><th className="num">Forecast</th><th className="num">Rank</th><th>Status</th></tr></thead>
                <tbody>{i.events.map((e) => (
                  <tr key={e.slug + e.date}><td>{fmtEventDate({ date: e.date, prec: "day" })}</td><td><Link href={`/paese/${e.slug}`}><span className="sx">{e.name}</span></Link></td><td><Kind type={e.type} /></td>
                    <td className="num">{pct(e.p, 2)}</td><td className="num">{e.rank}/{i.n}</td><td>{e.counted ? "counted" : `not counted yet (confidence ${e.conf})`}</td></tr>
                ))}</tbody>
              </table>
            )}
            <details open={i.status === "open"}>
              <summary>25 highest forecasts in this issue</summary>
              <table className="rg-table">
                <thead><tr><th className="num">#</th><th>Country</th><th className="num">Probability</th><th className="num">80% range</th><th>Relative</th><th>Outcome</th></tr></thead>
                <tbody>{i.top.map((f) => (
                  <tr key={f.slug} className={f.hit ? "hit" : ""}><td className="num">{f.rank}</td><td><Link href={`/?c=${f.slug}`}><span className="sx">{f.name}</span></Link></td><td className="num">{pct(f.p, 2)}</td>
                    <td className="num">{f.lo == null ? "—" : `${pct(f.lo)} – ${pct(f.hi)}`}</td><td><i className="rg-bar" style={{ width: `${(f.p / i.top[0].p) * 100}%` }} /></td>
                    <td>{f.hit ? "◆ Attempt recorded" : i.status === "open" ? "Window open" : "None"}</td></tr>
                ))}</tbody>
              </table>
            </details>
          </article>
        ))}
      </section>

      {h?.pooled && (
        <section className="rg-hind">
          <h2>Reconstruction from past forecasts</h2>
          <p>
            Until real issues close, this reconstruction is the closest substitute: the model&apos;s out-of-sample forecasts since {h.from}, cut into the
            same half-yearly issues. Each came from a model trained only on earlier years, but with today&apos;s code and today&apos;s revision of the
            data, so it flatters the method. It makes the scoring legible and is never mixed into the registry above.
          </p>
          <p className="rg-line">
            Across {h.pooled.n.toLocaleString("en-GB")} country-windows, {h.pooled.events} had an attempt ({h.pooled.expected.toFixed(0)} expected). The model reached an AUC of {h.pooled.auc},
            placed {h.pooled.top10_hits} of the {h.pooled.events} in its top 10% beforehand, and beat the base rate by {skill(h.pooled.skill)} on the Brier score.
          </p>
          <h3>Every attempt since {h.from}, and where the model ranked the country beforehand</h3>
          <div className="rg-scroll">
            <table className="rg-table">
              <thead><tr><th>Event</th><th>Country</th><th>Outcome</th><th>Issue</th><th className="num">Forecast</th><th className="num">Rank</th><th>Position in the ranking (left is highest risk)</th></tr></thead>
              <tbody>{h.events.map((e) => (
                <tr key={e.slug + e.date}><td>{fmtEventDate({ date: e.date, prec: "day" })}</td><td><Link href={`/paese/${e.slug}`}><span className="sx">{e.name}</span></Link></td><td><Kind type={e.type} /></td>
                  <td>{e.issue}</td><td className="num">{pct(e.p, 2)}</td><td className="num">{e.rank}/{e.n}</td>
                  <td><span className="rg-rank"><i style={{ left: `${((e.rank - 1) / (e.n - 1)) * 100}%` }} /></span></td></tr>
              ))}</tbody>
            </table>
          </div>
          <details>
            <summary>Scores by reconstructed issue</summary>
            <table className="rg-table">
              <thead><tr><th>Issue</th><th>Window</th><th className="num">Countries</th><th className="num">Expected</th><th className="num">Observed</th><th className="num">In top 10%</th><th className="num">AUC</th><th className="num">Brier skill</th></tr></thead>
              <tbody>{h.issues.map((i) => (
                <tr key={i.issue}><td>{i.issue}</td><td>{mon(i.window[0])} → {mon(i.window[1])}</td><td className="num">{i.n}</td><td className="num">{i.expected.toFixed(1)}</td>
                  <td className="num">{i.events}</td><td className="num">{i.top10_hits}/{i.events}</td><td className="num">{i.auc ?? "—"}</td><td className="num">{skill(i.skill)}</td></tr>
              ))}</tbody>
            </table>
          </details>
        </section>
      )}
      <p className="rg-note">Machine-readable: <a href="/api/registry">/api/registry</a>. Scores are recomputed from the archived files on every monthly run; a file whose hash no longer matches the index fails the build.</p>
    </main>
    <SiteFooter generated={r.generated} />
    </>
  );
}
