import Link from "next/link";
import { pct, num } from "@/lib/format";
import { labelEn } from "@/lib/english";

const pp = (v) => v == null ? "Unavailable" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(2)} pp`;
const value = (v) => v == null ? "Unavailable" : v.toLocaleString("en", { maximumFractionDigits: 2 });
const MODEL_NAMES = { logit: "Logistic regression", gbm: "Gradient boosting", rf: "Random forest", lgbm: "LightGBM" };

export default function CountryAnalysis({ country: c, meta }) {
  const a = c.analysis, d = c.diagnostics;
  if (!a) return null;
  const observed = d?.coverage.reduce((s, g) => s + g.observed, 0);
  const total = d?.coverage.reduce((s, g) => s + g.total, 0);
  const up = (c.groups || []).filter((g) => g.contrib > 0).sort((x, y) => y.contrib - x.contrib).slice(0, 2);
  const down = (c.groups || []).filter((g) => g.contrib < 0).sort((x, y) => x.contrib - y.contrib).slice(0, 2);
  return <div className="country-analysis">
    <nav className="country-sections" aria-label="Country dossier sections">
      {!c.historical && <><a href="#assessment">Assessment</a><a href="#history">Risk history</a><a href="#signals">Recent signals</a><a href="#institutions">Institutions & economy</a><a href="#region">Regional context</a><a href="#quality">Evidence quality</a><a href="#crowd">Market check</a></>}
      <a href="#archive">Coup archive</a>
    </nav>
    {!c.historical && <>
      <section id="assessment" className="card country-assessment">
<h2>Reading the current estimate</h2>
        <p className="country-reading">The model estimates a <strong>{pct(c.risk)}</strong> probability of at least one coup attempt in {c.name} between <strong>{meta.forecast_from}</strong> and <strong>{meta.forecast_to}</strong>. Successful and failed attempts both count.</p>
        <div className="country-stats">
          <div><span>Change over 3 months</span><strong>{pp(a.delta)}</strong><small>{meta.change_basis === "same_model" ? "Both dates evaluated with the current model" : "Difference between historical model estimates"}</small></div>
          <div><span>Regional position</span><strong>{a.region.rank == null ? "—" : `${a.region.rank} / ${a.region.count}`}</strong><small>{c.region}; equal estimates share a position</small></div>
          <div><span>Own historical percentile</span><strong>{a.history.percentile == null ? "—" : `${Math.round(a.history.percentile * 100)} / 100`}</strong><small>Share of past estimates at or below the current value</small></div>
          <div><span>Estimation range / 80%</span><strong>{c.risk_lo == null ? "Unavailable" : `${pct(c.risk_lo)} – ${pct(c.risk_hi)}`}</strong><small>{meta.boot || 0} country-resampled refits</small></div>
        </div>
        <div className="country-balance">
          <div><h3>Factors associated with higher risk</h3>{up.length ? <ul>{up.map((g) => <li key={g.key}>{labelEn(g.label)}</li>)}</ul> : <p>No positive group contribution exported.</p>}</div>
          <div><h3>Factors associated with lower risk</h3>{down.length ? <ul>{down.map((g) => <li key={g.key}>{labelEn(g.label)}</li>)}</ul> : <p>No negative group contribution exported.</p>}</div>
        </div>
        <p className="note">These are associations in the logistic component, measured against its training reference. They are neither causal explanations nor a decomposition of the final ensemble probability. The range reflects estimation variability with fixed calibration; it does not cover every source of uncertainty.</p>
      </section>

      <section id="signals" className="card">
<h2>Recent signals in context</h2>
        <p className="note">Last three months through {meta.data_end}, compared with the preceding 24 months (at least six observed months required). These descriptive ratios do not modify the forecast.</p>
        <div className="country-signals">{a.signals.map((s) => <article key={s.key}>
          <h3>{s.label}</h3><strong>{s.recentTotal == null ? "—" : num(s.recentTotal)}</strong><span>recorded in the last 3 months</span>
          <dl><div><dt>Recent monthly average</dt><dd>{value(s.recentMean)}</dd></div><div><dt>Earlier monthly average</dt><dd>{value(s.baselineMean)}</dd></div><div><dt>Relative activity</dt><dd>{s.ratio != null ? `${s.ratio.toFixed(2)}×` : s.newActivity ? "Activity after zero baseline" : s.baselineMean === 0 && s.recentMean === 0 ? "Zero in both periods" : "Insufficient data"}</dd></div></dl>
          <small>{s.baselineMonths} baseline months · ACLED</small>
        </article>)}</div>
        <p className="note">Counts depend on reporting coverage. Reported fatalities are estimates. An increase in activity is not itself evidence that a coup is imminent.</p>
      </section>

      <section id="institutions" className="card">
<h2>Institutions, leadership & economy</h2>
        <p className="note">{d?.regime ? `Latest available regime classification: ${d.regime}. ` : "Regime classification unavailable. "}Annual source records are delayed; these indicators may not reflect a recent change of government.</p>
        {d?.indicators ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Structural indicators"><table>
          <caption>Inputs available to this forecast · reference years are the annual records selected by the pipeline</caption>
          <thead><tr><th scope="col">Indicator</th><th scope="col">Value</th><th scope="col">Scale / interpretation</th><th scope="col">Reference year</th><th scope="col">Source</th></tr></thead>
          <tbody>{d.indicators.map((i) => <tr key={i.key}><th scope="row">{i.label}</th><td className="tnum">{value(i.value)}</td><td>{i.unit}</td><td>{i.reference_year ?? meta.data_end}</td><td>{i.source}</td></tr>)}</tbody>
        </table></div> : <p className="note">Indicator values are not included in this edition. Coverage is not inferred from the risk estimate.</p>}
      </section>

      <section id="region" className="card">
<h2>Compared with {c.region}</h2>
        <div className="country-stats">
          <div><span>Other countries / median</span><strong>{pct(a.region.median)}</strong><small>Excludes {c.name}</small></div>
          <div><span>Own historical median</span><strong>{pct(a.history.median)}</strong><small>Excludes the current estimate</small></div>
          <div><span>Historical model peak</span><strong>{pct(a.history.peak)}</strong><small>{a.history.peakMonth ?? "Unavailable"}</small></div>
        </div>
        <div className="table-scroll"><table><caption>Highest current estimates among other countries in the same region</caption><thead><tr><th scope="col">Country</th><th scope="col">Probability / {meta.horizon} months</th><th scope="col">Difference from {c.name}</th></tr></thead><tbody>
          {a.region.peers.map((p) => <tr key={p.slug}><th scope="row"><Link href={`/paese/${p.slug}`}>{p.name}</Link></th><td>{pct(p.risk)}</td><td>{pp(p.risk - c.risk)}</td></tr>)}
        </tbody></table></div>
        {!a.region.peers.length && <p className="note">No other country with a forecast is available in this region.</p>}
        <p className="note">Regional averages describe model estimates, not observed coup frequency. Historical estimates were reconstructed out of sample; only the forecast registry records predictions issued in advance.</p>
      </section>

      <section id="quality" className="card">
<h2>What supports this estimate</h2>
        <div className="country-balance"><div><h3>Input coverage</h3>
          {d ? <><p>{observed} of {total} model inputs available before estimator imputation, excluding calendar controls.</p><dl className="country-coverage">{d.coverage.map((g) => <div key={g.key}><dt>{labelEn(g.label)}</dt><dd>{g.observed} / {g.total}</dd></div>)}</dl></> : <p>Detailed coverage is not available for this edition.</p>}
          {c.structural === false && <p>Structural records are unavailable for this territory. Its estimate has a weaker evidence base.</p>}
        </div><div><h3>Component estimates</h3>
          {d?.components ? <dl className="country-coverage">{d.components.map((m) => <div key={m.key}><dt>{MODEL_NAMES[m.key] || m.key}</dt><dd>{pct(m.probability)}</dd></div>)}</dl> : <p>Component predictions are not available for this edition.</p>}
          <p className="note">Raw component probabilities, before ensemble calibration. Their disagreement is a sensitivity diagnostic, not a confidence interval.</p>
          <h3>Historical evidence</h3><p>{a.archive.modelEvents} archived attempts meet the model event definition; {a.archive.attempts} appear in the broader A–C archive. {a.archive.since2000} are dated since 2000.</p>
        </div></div>
        <details className="country-method"><summary>Sources, timing and interpretation</summary>
          <p>V-Dem annual indicators enter from April of the following year; economic indicators from July. These are assumed release lags, not a reconstruction of historical data vintages. Revised source datasets can contain information unavailable at the time.</p>
          <p>Missing inputs are imputed by the linear and random-forest components; the gradient-boosting components handle missingness directly. Missing data is not evidence of stability. Coverage counts are not confidence scores.</p>
          <p>Source agreement and forecast uncertainty describe different things. The forecast includes failed attempts, excludes plots, and does not estimate the probability of war, unrest or government collapse.</p>
          <p><a href="https://www.v-dem.net/data/">V-Dem data</a> · <a href="https://data.worldbank.org/">World Bank</a> · <a href="https://acleddata.com/">ACLED</a> · <Link href="/metodo">Full validation</Link> · <Link href="/registry">Forecast registry</Link></p>
        </details>
      </section>
    </>}
  </div>;
}
