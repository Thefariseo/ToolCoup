"use client";

import { useEffect, useState } from "react";
import { pct } from "@/lib/format";

const fmtClose = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "open-ended");
// Polymarket and Kalshi are real-money venues that are blocked in some jurisdictions (Italy among them) and whose promotion is restricted
// there, so their markets are shown as data with attribution and no outbound link. Manifold uses play money and is linked.
const REAL_MONEY = new Set(["Polymarket", "Kalshi"]);
const money = (v) => (v == null ? "–" : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : `$${Math.round(v)}`);

/** Open prediction markets that name this country, shown next to our model (never blended into it). */
export default function CrowdView({ slug, name }) {
  const [d, setD] = useState(null), [err, setErr] = useState(false);
  useEffect(() => {
    let on = true; setD(null); setErr(false);
    fetch(`/api/markets/${slug}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => on && setD(j)).catch(() => on && setErr(true));
    return () => { on = false; };
  }, [slug]);
  const coup = (d?.markets || []).filter((m) => m.kind === "coup"), exit = (d?.markets || []).filter((m) => m.kind === "exit");
  const down = d ? Object.entries(d.status).filter(([, s]) => !s.ok).map(([k]) => k) : [];
  return (
    <section id="crowd" className="card crowd">
      <p className="eyebrow">CROWD VIEW / PREDICTION MARKETS</p>
      <h2>What bettors with money at stake say</h2>
      <p className="note">An independent reading of the same question from Polymarket, Kalshi and Manifold. Markets differ from our target in wording, horizon and liquidity, so the right-hand column restates our probability for each market&rsquo;s horizon (constant hazard). Treat the two as complements: a gap is a prompt to look closer, not a verdict. Polymarket and Kalshi trade real money and are blocked in some countries, so they appear without links.</p>
      {!d && !err && <p className="note">Reading markets…</p>}
      {err && <p className="note" role="alert">Prediction markets are unavailable right now.</p>}
      {d && !d.markets.length && <p className="note">No open market on a coup or leader exit in {name} was found. Few countries have one, so absence says nothing about risk.</p>}
      {d && d.markets.length > 0 && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Prediction markets"><table>
          <thead><tr><th scope="col">Source</th><th scope="col">Market</th><th scope="col">Crowd</th><th scope="col">Our model, same horizon</th><th scope="col">Closes</th><th scope="col">Volume</th></tr></thead>
          <tbody>{[...coup, ...exit].map((m) => (
            <tr key={m.url + m.question}>
              <td>{m.source}</td>
              <td>{REAL_MONEY.has(m.source) ? m.question : <a href={m.url} target="_blank" rel="noopener noreferrer">{m.question}<span aria-hidden="true"> ↗</span></a>}{m.kind === "exit" && <small>leader exit, not a coup</small>}</td>
              <td className="tnum">{pct(m.p, 0)}</td>
              <td className="tnum">{m.model != null ? pct(m.model, m.model < 0.1 ? 1 : 0) : "–"}</td>
              <td>{fmtClose(m.closes)}</td><td className="tnum">{money(m.volume)}</td>
            </tr>))}
          </tbody></table></div>
      )}
      {down.length > 0 && <p className="note">Not reachable at the moment: {down.join(", ")}.</p>}
    </section>
  );
}
