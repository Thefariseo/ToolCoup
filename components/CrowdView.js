"use client";

import { useEffect, useState } from "react";
import { fmtClose, marketNotice, marketVerdict, money, pct } from "@/lib/format";

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
  const notice = d ? marketNotice(d.status) : null;
  const lead = d?.primary, verdict = lead ? marketVerdict(lead.p, lead.model) : null;
  return (
    <section id="crowd" className="card crowd">
      <h2>What the prediction markets say</h2>
      <p className="note">A second opinion on a similar question. For each country we show one market: the coup question with the most volume on Polymarket or Kalshi. Markets differ from our target in wording, horizon and liquidity, so we restate our probability for the market&rsquo;s horizon (the same risk every month up to six months, a fitted correction beyond). A gap is a reason to look closer. Both venues trade real money and are blocked in some countries, so we do not link to them.</p>
      {!d && !err && <p className="note">Loading markets…</p>}
      {err && <p className="note" role="alert">Prediction markets are unavailable right now.</p>}
      {d && !d.markets.length && <p className="note">No open market on a coup or leader exit in {name} was found. Few countries have one, so absence says nothing about risk.</p>}
      {lead && (
        <div className={`mk-lead ${verdict?.kind || ""}`}>
          <div className="mk-big"><b>{p1(lead.p)}</b><span>{lead.source} · {money(lead.volume)} traded · closes {fmtClose(lead.closes)}</span></div>
          <p className="mk-q">{lead.question}</p>
          <div className="mk-vs">
            <div><span>Our model, same horizon</span><b>{lead.model != null ? p1(lead.model) : "–"}</b></div>
            {verdict && <p>{verdict.text} Definitions differ: markets often count rumours and looser attempts, while our target counts only confirmed events.</p>}
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
              <td>{m.question}{m.kind === "exit" && <small>leader exit, not a coup</small>}</td>
              <td className="tnum">{pct(m.p, 0)}</td>
              <td className="tnum">{m.model != null ? p1(m.model) : "–"}</td>
              <td>{fmtClose(m.closes)}</td><td className="tnum">{money(m.volume)}</td>
            </tr>))}
          </tbody></table></div>
      )}
      {notice && <p className="note">{notice}</p>}
    </section>
  );
}
