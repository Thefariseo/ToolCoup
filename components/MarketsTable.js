"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Flag from "@/components/Flag";
import { fmtClose, fmtEventDate, marketNotice, marketVerdict, money, pct } from "@/lib/format";

const p1 = (v) => pct(v, v != null && v < 0.1 ? 1 : 0);
const gap = (p, model) => { if (model == null || !(model > 0)) return "–"; const r = p / model; return r >= 1 ? `${r >= 10 ? Math.round(r) : r.toFixed(1)}× higher` : `${1 / r >= 10 ? Math.round(1 / r) : (1 / r).toFixed(1)}× lower`; };

// both figures on one log scale, from 0.1% to 50%, so a market ten times the model reads as a long gap
const at = (v) => `${Math.max(0, Math.min(100, (Math.log(Math.max(v, 0.001) / 0.001) / Math.log(0.5 / 0.001)) * 100)).toFixed(2)}%`;
const TICKS = [0.001, 0.01, 0.1, 0.5];
function Gaps({ rows }) {
  return (
    <div className="gaps">
      <p className="gaps__key"><span><i className="mk" />Market price</span><span><i className="md" />Our model, same closing date</span><span>log scale</span></p>
      <ol>
        {rows.map((m) => {
          const v = marketVerdict(m.p, m.model);
          return (
            <li key={m.slug}>
              <Link href={`/paese/${m.slug}#crowd`} className="gaps__row">
                <span className="gaps__name"><Flag iso={m.iso} height={14} eager />{m.name}</span>
                <span className="gaps__plot" aria-hidden="true">
                  {TICKS.map((t) => <b key={t} style={{ left: at(t) }} />)}
                  {m.model > 0 && <em style={{ left: at(Math.min(m.p, m.model)), width: `calc(${at(Math.max(m.p, m.model))} - ${at(Math.min(m.p, m.model))})` }} />}
                  {m.model > 0 && <i className="md" style={{ left: at(m.model) }} />}
                  <i className="mk" style={{ left: at(m.p) }} />
                </span>
                <span className="gaps__num"><b><span className="sr-only">market </span>{p1(m.p)}</b><small><span className="sr-only">model </span>{p1(m.model)}</small></span>
                <span className="gaps__meta"><q>{m.question}</q><span>{m.source} · {money(m.volume)} traded · closes {fmtClose(m.closes)}</span><b className={v?.kind || ""}>{gap(m.p, m.model)}</b></span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="gaps__axis" aria-hidden="true"><span /><span>{TICKS.map((t) => <b key={t} style={{ left: at(t) }}>{`${t * 100}%`}</b>)}</span><span /></p>
    </div>
  );
}

/** Every country with a coup market: the one market we lead with, next to our model at the same horizon, by volume
 *  traded. The dated reading shipped with the page stands until the live prices arrive. */
export default function MarketsTable({ initial }) {
  const [d, setD] = useState(null), [err, setErr] = useState(false);
  useEffect(() => {
    let on = true;
    fetch("/api/markets").then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => on && setD(j)).catch(() => on && setErr(true));
    return () => { on = false; };
  }, []);
  const live = d ? Object.entries(d.primary || {}).map(([slug, m]) => ({ slug, ...m })) : null;
  const rows = [...(live || initial?.rows || [])].sort((a, b) => (b.volume || 0) - (a.volume || 0));
  const read = initial?.asOf ? fmtEventDate({ date: initial.asOf.slice(0, 10), prec: "day" }) : null;
  const down = d ? Object.entries(d.status).filter(([, s]) => !s.ok).map(([k]) => k) : [], notice = d ? marketNotice(d.status) : null;
  return (
    <section className="block" aria-labelledby="gaps-h">
      <h2 id="gaps-h" className="gaps-h">One market per country, by volume traded</h2>
      {!d && !err && <p className="note" aria-live="polite">{rows.length ? `Reading of ${read}; checking live prices…` : "Loading markets…"}</p>}
      {err && <p className="note" role="alert">Live prices are unavailable right now.{rows.length ? ` These are from the reading of ${read}.` : ""}</p>}
      {d && !rows.length && !down.length && <p className="note">No open coup market that names a country we track was found.</p>}
      {rows.length > 0 && <Gaps rows={rows} />}
      {notice && <p className="note">{notice}</p>}
    </section>
  );
}
