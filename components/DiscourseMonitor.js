"use client";

import { useEffect, useState } from "react";

function Spark({ days, alert, label }) {
  const W = 360, H = 64, v = days.map((d) => d.v), max = Math.max(...v, 1), n = v.length;
  const pts = v.map((x, i) => `${(i / (n - 1)) * W},${H - 4 - (x / max) * (H - 10)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`dm-spark${alert ? " alert" : ""}`} role="img" aria-label={label}>
      <polyline points={pts} fill="none" strokeWidth="1.6" />
      <rect x={W - (7 / n) * W} y="0" width={(7 / n) * W} height={H} className="last" />
    </svg>
  );
}

/** Shifts in public attention and news tone around the country; descriptive alerts, not model inputs. */
export default function DiscourseMonitor({ slug, name }) {
  const [d, setD] = useState(null), [err, setErr] = useState(false);
  useEffect(() => {
    let on = true; setD(null); setErr(false);
    fetch(`/api/discourse/${slug}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => on && setD(j)).catch(() => on && setErr(true));
    return () => { on = false; };
  }, [slug]);
  const w = d?.wiki, nv = d?.news;
  return (
    <section id="discourse" className="card discourse">
      <p className="eyebrow">PUBLIC DISCOURSE MONITOR</p>
      <h2>Is public attention to {name} shifting?</h2>
      <p className="note">Background monitoring without polling: sudden changes in how much people read about the country and in how the news talks about it, compared with its own last three months. Social platforms such as X do not offer free access to their discourse, so this uses open sources: Wikipedia readership and the GDELT news archive. These are descriptive alerts. Signals of this kind were tested against the coup model and did not improve it, so they are not model inputs.</p>
      {!d && !err && <p className="note">Reading public signals…</p>}
      {err && <p className="note" role="alert">Public signals are unavailable right now.</p>}
      {d && (
        <div className="dm-grid">
          <div>
            <h3>Readership of the Wikipedia article {w?.alert && <em className="dm-flag">ATTENTION SPIKE</em>}</h3>
            {w ? (<><Spark days={w.days} alert={w.alert} label="Daily Wikipedia pageviews, last 120 days" />
              <p className="note">Last 7 days average {Math.round(w.recent).toLocaleString("en-GB")} views a day, {w.ratio}× the usual {Math.round(w.median).toLocaleString("en-GB")} (robust z = {w.z}).</p></>)
              : <p className="note">Not available ({d.errors.wikipedia || "no data"}).</p>}
          </div>
          <div>
            <h3>News volume on security and politics {nv?.volShift?.alert && <em className="dm-flag">VOLUME SPIKE</em>}</h3>
            {nv ? (<><Spark days={nv.vol} alert={nv.volShift?.alert} label="Share of global news coverage, last 90 days" />
              <p className="note">Volume {nv.volShift?.ratio ?? "–"}× the usual. Average tone last week {nv.toneRecent} against {nv.toneBase} before (more negative means grimmer coverage).</p></>)
              : <p className="note">The news archive did not answer ({d.errors.gdelt || "no data"}). It rate-limits requests; try again later.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
