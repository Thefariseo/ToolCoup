import Link from "next/link";
import { getRegistry, REPO } from "@/lib/registry";
import { fmtEventDate, pct } from "@/lib/format";

export const metadata = {
  title: "Forecast registry",
  description: "Every monthly forecast, archived before its window opens and scored against what happened.",
};

const mon = (s) => { const [y, m] = s.split("-"); return `${["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][m - 1]} ${y}`; };
const skill = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
const Kind = ({ type }) => <span className={`rg-kind ${type === "riuscito" ? "ok" : "ko"}`}>{type === "riuscito" ? "◆ SUCCESSFUL" : "◇ FAILED"}</span>;

export default function RegistryPage() {
  const r = getRegistry(), h = r.hindcast, closed = r.issues.filter((i) => i.status === "closed");
  const next = r.issues.filter((i) => i.status === "open").map((i) => i.window[1]).sort()[0];
  return (
    <main className="rg">
      <header className="rg-head">
        <p className="rg-eyebrow">FORECAST REGISTRY</p>
        <h1>Filed before the fact. Scored after.</h1>
        <p>
          Each month the published forecast is frozen into one file, committed to the public repository and never edited. When its
          {" "}{r.horizon}-month window closes it is compared with the coups that were actually recorded. A backtest can be tuned until
          it looks good; a forecast with a timestamp cannot.
        </p>
        <dl className="rg-stats">
          <div><dt>ISSUES FILED</dt><dd>{r.issues.length}</dd></div>
          <div><dt>WINDOWS CLOSED</dt><dd>{closed.length}</dd></div>
          <div><dt>{closed.length ? "BRIER SKILL · EX ANTE" : "FIRST VERDICT"}</dt><dd>{closed.length ? skill(r.pooled?.skill) : next ? `after ${mon(next)}` : "—"}</dd></div>
          <div><dt>ARCHIVE INTEGRITY</dt><dd className={r.integrity.ok ? "ok" : "bad"}>{r.integrity.ok ? "SHA-256 OK" : "ALTERED"}</dd></div>
        </dl>
        <p className="rg-note">Target: {r.target} Events confirmed only by weaker sources are listed but not counted until the database upgrades them.</p>
      </header>

      <section>
        <h2>ISSUES <em>ex ante</em></h2>
        {r.issues.map((i) => (
          <article key={i.issue} className="rg-issue">
            <header>
              <h3>#{i.issue}</h3>
              <span className={`rg-status ${i.status}`}>{i.status === "open" ? "● OPEN" : "■ CLOSED"}</span>
              <span>filed {i.published} · data through {i.data_end} · window {mon(i.window[0])} → {mon(i.window[1])}</span>
              <span className="r">
                <a href={`${REPO}/blob/main/registry/issues/${i.issue}.json`}>file</a> · <a href={`${REPO}/commits/main/registry/issues/${i.issue}.json`}>git history</a> · sha {i.sha256.slice(0, 10)}…
              </span>
            </header>
            <dl className="rg-stats sm">
              <div><dt>COUNTRIES</dt><dd>{i.n}</dd></div>
              <div><dt>EXPECTED COUNTRIES WITH AN ATTEMPT</dt><dd>{i.expected.toFixed(2)}</dd></div>
              <div><dt>OBSERVED SO FAR</dt><dd>{i.events.filter((e) => e.counted).length}<small> · {i.months_observed}/{r.horizon} months of data</small></dd></div>
              <div><dt>BRIER SKILL VS BASE RATE</dt><dd>{i.score ? skill(i.score.skill) : "pending"}</dd></div>
              {i.score && <div><dt>AUC · EVENTS IN TOP 10%</dt><dd>{i.score.auc ?? "—"} · {i.score.top10_hits}/{i.score.events}</dd></div>}
            </dl>
            {i.events.length > 0 && (
              <table className="rg-table">
                <thead><tr><th>EVENT</th><th>COUNTRY</th><th>OUTCOME</th><th className="num">FORECAST</th><th className="num">RANK</th><th>STATUS</th></tr></thead>
                <tbody>{i.events.map((e) => (
                  <tr key={e.slug + e.date}><td>{fmtEventDate({ date: e.date, prec: "day" })}</td><td><Link href={`/paese/${e.slug}`}>{e.name}</Link></td><td><Kind type={e.type} /></td>
                    <td className="num">{pct(e.p, 2)}</td><td className="num">{e.rank}/{i.n}</td><td>{e.counted ? "counted" : `not counted yet (confidence ${e.conf})`}</td></tr>
                ))}</tbody>
              </table>
            )}
            <details open={i.status === "open"}>
              <summary>25 highest forecasts in this issue</summary>
              <table className="rg-table">
                <thead><tr><th className="num">#</th><th>COUNTRY</th><th className="num">P(ATTEMPT)</th><th className="num">80% INTERVAL</th><th>RELATIVE</th><th>OUTCOME</th></tr></thead>
                <tbody>{i.top.map((f) => (
                  <tr key={f.slug} className={f.hit ? "hit" : ""}><td className="num">{f.rank}</td><td><Link href={`/?c=${f.slug}`}>{f.name}</Link></td><td className="num">{pct(f.p, 2)}</td>
                    <td className="num">{f.lo == null ? "—" : `${pct(f.lo)} – ${pct(f.hi)}`}</td><td><i className="rg-bar" style={{ width: `${(f.p / i.top[0].p) * 100}%` }} /></td>
                    <td>{f.hit ? "◆ attempt recorded" : i.status === "open" ? "· window open" : "— none"}</td></tr>
                ))}</tbody>
              </table>
            </details>
          </article>
        ))}
      </section>

      {h?.pooled && (
        <section className="rg-hind">
          <h2>RECONSTRUCTION <em>not ex ante</em></h2>
          <p>
            Until real issues close, this is the nearest honest substitute: the model&apos;s out-of-sample forecasts since {h.from}, cut into the
            same half-yearly issues. Each was produced by a model trained only on earlier years, but with today&apos;s code and today&apos;s
            revision of the data, so it flatters the method. It is shown to make the scoring legible, and it is never mixed into the registry above.
          </p>
          <dl className="rg-stats">
            <div><dt>COUNTRY-WINDOWS</dt><dd>{h.pooled.n.toLocaleString("en-GB")}</dd></div>
            <div><dt>WITH AN ATTEMPT</dt><dd>{h.pooled.events}<small> · {h.pooled.expected.toFixed(0)} expected</small></dd></div>
            <div><dt>AUC</dt><dd>{h.pooled.auc}</dd></div>
            <div><dt>IN THE TOP 10% BEFOREHAND</dt><dd>{h.pooled.top10_hits}/{h.pooled.events}</dd></div>
            <div><dt>BRIER SKILL VS BASE RATE</dt><dd>{skill(h.pooled.skill)}</dd></div>
          </dl>
          <h3>Every attempt since {h.from}, and where the model had the country beforehand</h3>
          <div className="rg-scroll">
            <table className="rg-table">
              <thead><tr><th>EVENT</th><th>COUNTRY</th><th>OUTCOME</th><th>ISSUE</th><th className="num">FORECAST</th><th className="num">RANK</th><th>POSITION IN RANKING (LEFT = HIGHEST RISK)</th></tr></thead>
              <tbody>{h.events.map((e) => (
                <tr key={e.slug + e.date}><td>{fmtEventDate({ date: e.date, prec: "day" })}</td><td><Link href={`/paese/${e.slug}`}>{e.name}</Link></td><td><Kind type={e.type} /></td>
                  <td>{e.issue}</td><td className="num">{pct(e.p, 2)}</td><td className="num">{e.rank}/{e.n}</td>
                  <td><span className="rg-rank"><i style={{ left: `${((e.rank - 1) / (e.n - 1)) * 100}%` }} /></span></td></tr>
              ))}</tbody>
            </table>
          </div>
          <details>
            <summary>Scores by reconstructed issue</summary>
            <table className="rg-table">
              <thead><tr><th>ISSUE</th><th>WINDOW</th><th className="num">COUNTRIES</th><th className="num">EXPECTED</th><th className="num">OBSERVED</th><th className="num">IN TOP 10%</th><th className="num">AUC</th><th className="num">BRIER SKILL</th></tr></thead>
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
  );
}
