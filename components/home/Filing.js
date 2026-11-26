// The three drawings of the registry's steps, from the registry export: the filed issue, its window and the score
// it is waiting for. Nothing here is computed beyond what the export holds.
export function FiledCard({ issue, filed }) {
  return (
    <div className="filing" data-ui="filing" role="img" aria-label={`Issue ${issue.issue}, filed on ${filed}, checksum ${issue.sha256.slice(0, 12)}`}>
      <p className="filing__bar"><span>registry/forecasts/{issue.issue}.json</span><span className="filing__tag">Filed</span></p>
      <dl className="filing__kv">
        <div><dt>Issue</dt><dd>{issue.issue}</dd></div>
        <div><dt>Filed</dt><dd>{filed}</dd></div>
        <div><dt>Countries and territories</dt><dd>{issue.n}</dd></div>
        <div><dt>Attempts the model expects</dt><dd>{issue.expected.toFixed(2)}</dd></div>
      </dl>
      <p className="filing__hash"><span>SHA-256</span>{issue.sha256}</p>
    </div>
  );
}

export function WindowCard({ issue, filed, months, closes }) {
  return (
    <div className="filing" data-ui="window" role="img" aria-label={`The issue's window runs for six months, ${months[0]} to ${months.at(-1)}`}>
      <p className="filing__bar"><span>Window for issue {issue.issue}</span><span className="filing__tag open">Open</span></p>
      <ol className="filing__months">
        {months.map((m, i) => <li key={m}><i style={{ "--k": i }} /><span>{m}</span></li>)}
      </ol>
      <dl className="filing__kv">
        <div><dt>Filed before it opened</dt><dd>{filed}</dd></div>
        <div><dt>Closes at the end of</dt><dd>{closes}</dd></div>
        <div><dt>Attempts counted so far</dt><dd>{issue.events.length}</dd></div>
        <div><dt>Months observed</dt><dd>{issue.months_observed} of {months.length}</dd></div>
      </dl>
    </div>
  );
}

export function ScoreCard({ h, closes }) {
  const rows = [["Chance it ranked an attempt above a quiet window (AUC)", h.auc.toFixed(2)], ["Better than quoting the base rate (Brier skill)", `+${(h.skill * 100).toFixed(1)}%`],
    ["Attempts in the model's top tenth", `${h.top10_hits} of ${h.events}`], ["Attempts expected, against attempts seen", `${h.expected.toFixed(0)} / ${h.events}`]];
  return (
    <div className="filing" data-ui="score" role="img" aria-label={`The rebuilt record: AUC ${h.auc.toFixed(2)}; the first live score comes after ${closes}`}>
      <p className="filing__bar"><span>Scorecard</span><span className="filing__tag">Rebuilt record</span></p>
      <dl className="filing__score">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <p className="filing__next">First live score after {closes}.</p>
    </div>
  );
}
