"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Flag from "@/components/Flag";
import { fmtClose, marketVerdict, money, pct } from "@/lib/format";

const p1 = (v) => pct(v, v != null && v < 0.1 ? 1 : 0);
const gap = (p, model) => { if (model == null || !(model > 0)) return "–"; const r = p / model; return r >= 1 ? `${r >= 10 ? Math.round(r) : r.toFixed(1)}× higher` : `${1 / r >= 10 ? Math.round(1 / r) : (1 / r).toFixed(1)}× lower`; };

/** Every country with a coup market: the one market we lead with, next to our model at the same horizon. */
export default function MarketsTable() {
  const [d, setD] = useState(null), [err, setErr] = useState(false);
  useEffect(() => {
    let on = true;
    fetch("/api/markets").then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => on && setD(j)).catch(() => on && setErr(true));
    return () => { on = false; };
  }, []);
  const rows = Object.entries(d?.primary || {}).map(([slug, m]) => ({ slug, ...m })).sort((a, b) => (b.volume || 0) - (a.volume || 0));
  const down = d ? Object.entries(d.status).filter(([, s]) => !s.ok).map(([k]) => k) : [];
  return (
    <section className="card">
      {!d && !err && <p className="note">Loading markets…</p>}
      {err && <p className="note" role="alert">Prediction markets are unavailable right now.</p>}
      {d && !rows.length && !down.length && <p className="note">No open coup market that names a country we track was found.</p>}
      {rows.length > 0 && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Markets against the model"><table>
          <caption>One market per country, sorted by volume traded</caption>
          <thead><tr><th scope="col">Country</th><th scope="col">Market</th><th scope="col">Crowd</th><th scope="col">Our model, same horizon</th><th scope="col">Market against model</th><th scope="col">Venue</th><th scope="col">Volume</th><th scope="col">Closes</th></tr></thead>
          <tbody>{rows.map((m) => {
            const v = marketVerdict(m.p, m.model);
            return (
              <tr key={m.slug}>
                <th scope="row"><Link href={`/paese/${m.slug}#crowd`} className="vo-link" data-scramble><Flag iso={m.iso} height={12} /> <span className="sx">{m.name}</span></Link></th>
                <td>{m.question}</td>
                <td className="tnum">{p1(m.p)}</td><td className="tnum">{p1(m.model)}</td>
                <td className={`tnum mk-gap ${v?.kind || ""}`}>{gap(m.p, m.model)}</td>
                <td>{m.source}</td><td className="tnum">{money(m.volume)}</td><td>{fmtClose(m.closes)}</td>
              </tr>);
          })}</tbody></table></div>
      )}
      {down.length > 0 && <p className="note">Could not reach {down.join(" and ")} just now, so some countries may be missing.</p>}
    </section>
  );
}
