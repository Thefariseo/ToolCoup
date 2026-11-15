"use client";

import { useEffect, useState } from "react";
import { fmtClose, marketVerdict, money, pct } from "@/lib/format";

const p1 = (v) => pct(v, v != null && v < 0.1 ? 1 : 0);

/** Open prediction markets that name this country, shown next to our model (never blended into it). Leads with the one market that matters most. */
export default function CrowdView({ slug, name }) {
  const [d, setD] = useState(null), [err, setErr] = useState(false);
  useEffect(() => {
    let on = true; setD(null); setErr(false);
    fetch(`/api/markets/${slug}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => on && setD(j)).catch(() => on && setErr(true));
    return () => { on = false; };
  }, [slug]);
  const coup = (d?.markets || []).filter((m) => m.kind === "coup"), exit = (d?.markets || []).filter((m) => m.kind === "exit");
  const down = d ? Object.entries(d.status).filter(([, s]) => !s.ok).map(([k]) => k) : [];
  const lead = d?.primary, verdict = lead ? marketVerdict(lead.p, lead.model) : null;
  return (
    <section id="crowd" className="card crowd">
      <p className="eyebrow">MARKET CHECK / PREDICTION MARKETS</p>
      <h2>What bettors with money at stake say</h2>
      <p className="note">An independent reading of the same question. The site leads with one market per country: of Polymarket and Kalshi, the coup question with the most volume traded; Manifold, which trades play money, only when neither lists one. Markets differ from our target in wording, horizon and liquidity, so our probability is restated for the market&rsquo;s horizon (constant hazard). A gap is a prompt to look closer, not a verdict. Polymarket and Kalshi trade real money and are blocked in some countries, so they appear without links.</p>
      {!d && !err && <p className="note">Reading markets…</p>}
      {err && <p className="note" role="alert">Prediction markets are unavailable right now.</p>}
      {d && !d.markets.length && <p className="note">No open market on a coup or leader exit in {name} was found. Few countries have one, so absence says nothing about risk.</p>}
      {lead && (
        <div className={`mk-lead ${verdict?.kind || ""}`}>
          <div className="mk-big"><b>{p1(lead.p)}</b><span>{lead.source} · {money(lead.volume)} traded · closes {fmtClose(lead.closes)}</span></div>
          <p className="mk-q">{lead.url ? <a href={lead.url} target="_blank" rel="noopener noreferrer">{lead.question}<span aria-hidden="true"> ↗</span></a> : lead.question}</p>
          <div className="mk-vs">
            <div><span>Our model, same horizon</span><b>{lead.model != null ? p1(lead.model) : "–"}</b></div>
            {verdict && <p>{verdict.text} Definitions differ: the market often counts rumours and looser attempts, our target only confirmed events.</p>}
          </div>
        </div>
      )}
      {d && d.markets.length > 0 && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Prediction markets"><table>
          <caption>All open markets that name {name}</caption>
          <thead><tr><th scope="col">Source</th><th scope="col">Market</th><th scope="col">Crowd</th><th scope="col">Our model, same horizon</th><th scope="col">Closes</th><th scope="col">Volume</th></tr></thead>
          <tbody>{[...coup, ...exit].map((m) => (
            <tr key={m.source + m.question}>
              <td>{m.source}</td>
              <td>{m.url ? <a href={m.url} target="_blank" rel="noopener noreferrer">{m.question}<span aria-hidden="true"> ↗</span></a> : m.question}{m.kind === "exit" && <small>leader exit, not a coup</small>}</td>
              <td className="tnum">{pct(m.p, 0)}</td>
              <td className="tnum">{m.model != null ? p1(m.model) : "–"}</td>
              <td>{fmtClose(m.closes)}</td><td className="tnum">{money(m.volume)}</td>
            </tr>))}
          </tbody></table></div>
      )}
      {down.length > 0 && <p className="note">Not reachable at the moment: {down.join(", ")}.</p>}
    </section>
  );
}
