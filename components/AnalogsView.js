import { pct } from "@/lib/format";

/** Historical analogs: what happened after the past country-months that look most like this one. */
export default function AnalogsView({ analog, name, modelRisk }) {
  if (!analog) return null;
  const hits = Math.round(analog.rate * analog.k);
  return (
    <section id="analogs" className="card analogs">
<h2>What happened after the {analog.k} most similar cases</h2>
      <p className="note">The model computes a probability; analogy asks a different question: among past country-months with a similar coup history, regime, leader, economy and regional contagion, how many were followed by a coup attempt within six months? It uses {analog.features} variables and {analog.pool.toLocaleString("en-GB")} resolved country-months, one case per country and two-year span.</p>
      <div className="km-grid analog-stats">
        <div className="km-tile"><span>Analogs followed by an attempt</span><b>{hits} of {analog.k}</b><small>{pct(analog.rate, 0)}</small></div>
        <div className="km-tile"><span>Unconditional rate in the same pool</span><b>{pct(analog.base, 1)}</b><small>any country-month</small></div>
        <div className="km-tile"><span>Our model for {name}</span><b>{pct(modelRisk, 1)}</b><small>{analog.rate > modelRisk * 1.5 ? "analogs are more alarming" : analog.rate < modelRisk / 1.5 ? "analogs are less alarming" : "broadly in line"}</small></div>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Closest historical analogs"><table>
        <caption>The six closest analogs</caption>
        <thead><tr><th scope="col">Country</th><th scope="col">Month</th><th scope="col">Similarity (distance)</th><th scope="col">Coup attempt in the next 6 months</th></tr></thead>
        <tbody>{analog.nearest.map((c) => <tr key={c.country + c.month}><th scope="row">{c.country}</th><td className="tnum">{c.month}</td><td className="tnum">{c.distance}</td><td>{c.attempt_within_6m ? "Yes" : "No"}</td></tr>)}</tbody>
      </table></div>
      <p className="note">Analogy is a sanity check, not an independent forecast: the same variables feed the model. It is most useful when it disagrees, because it points to the specific historical episodes behind a number.</p>
    </section>
  );
}
