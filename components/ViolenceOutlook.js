"use client";

import { useState } from "react";

const TYPES = [["o", "Organized violence"], ["b", "Battles"], ["e", "Explosions / remote violence"], ["v", "Violence against civilians"]];
const fmtDay = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Political-violence outlook: 26 past four-week periods, six forecast periods with an interval, and the moving average for comparison. */
export default function ViolenceOutlook({ country, meta, admin1 }) {
  const [type, setType] = useState("o");
  const hist = country.hist[type], fc = country.fc[type], n = hist.length + fc.length;
  const W = 760, H = 220, L = 36, B = 22, T = 10, plotW = W - L - 8, plotH = H - B - T;
  const max = Math.max(1, ...hist, ...fc.map((f) => f[2])) * 1.08;
  const x = (i) => L + (i + 0.5) * (plotW / n), y = (v) => T + plotH - (v / max) * plotH, bw = Math.max(3, plotW / n - 3);
  const ma = type === "o" ? country.ma6 : hist.slice(-6).reduce((a, b) => a + b, 0) / 6;
  const path = fc.map((f, i) => `${i ? "L" : "M"}${x(hist.length + i)},${y(f[0])}`).join(" ");
  const band = [...fc.map((f, i) => `${x(hist.length + i)},${y(f[2])}`), ...fc.map((f, i) => `${x(hist.length + fc.length - 1 - i)},${y(fc[fc.length - 1 - i][1])}`)].join(" ");
  const next = fc[0][0], six = fc.reduce((a, f) => a + f[0], 0) / fc.length, change = ma > 0 ? six / ma - 1 : null;
  const ticks = [0, 0.5, 1].map((k) => Math.round(max * k));
  return (
    <section id="violence" className="card violence">
<h2>Political violence in the next six four-week periods</h2>
      <p className="note">Forecast event counts per four-week period: a light gradient boosted machine (one model for all six horizons, trained with absolute error), blended with the 6-period average and the last period, with provinces scaled to the country total and {meta.interval} intervals from a 24-origin backtest. Method adapted from ACLED&rsquo;s published CAST methodology; this is our own model, not ACLED&rsquo;s forecast.</p>
      <div className="vo-tabs" role="tablist" aria-label="Event type">
        {TYPES.map(([k, label]) => <button key={k} role="tab" aria-selected={type === k} className={type === k ? "on" : ""} onClick={() => setType(k)}>{label}</button>)}
      </div>
      <div className="vo-kpis">
        <div><span>Next period</span><b>{Math.round(next)}</b><small>{Math.round(fc[0][1])} to {Math.round(fc[0][2])}</small></div>
        <div><span>Average of the next six</span><b>{six.toFixed(0)}</b><small>{change == null ? "" : `${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(0)}% vs 6-period average`}</small></div>
        <div><span>Last 6 periods, average</span><b>{ma.toFixed(0)}</b><small>moving average</small></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="vo-chart" role="img" aria-label={`Past and forecast ${TYPES.find((t) => t[0] === type)[1]} events per four-week period`}>
        {[...new Set(ticks)].map((t) => <g key={t}><line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} className="grid" /><text x={L - 5} y={y(t) + 3} textAnchor="end">{t}</text></g>)}
        {hist.map((v, i) => <rect key={i} x={x(i) - bw / 2} y={y(v)} width={bw} height={Math.max(0, y(0) - y(v))} className="past" />)}
        <line x1={L} x2={W - 8} y1={y(ma)} y2={y(ma)} className="ma" />
        <polygon points={band} className="band" />
        <path d={path} className="fc" />
        {fc.map((f, i) => <circle key={i} cx={x(hist.length + i)} cy={y(f[0])} r="3" className="fcdot"><title>{`${fmtDay(meta.horizons[i])}: ${f[0]} (${f[1]} to ${f[2]})`}</title></circle>)}
        <line x1={x(hist.length - 1) + (plotW / n) / 2} x2={x(hist.length - 1) + (plotW / n) / 2} y1={T} y2={y(0)} className="now" />
        <text x={x(0)} y={H - 5} className="axis">{fmtDay(meta.history_ends[0])}</text>
        <text x={x(hist.length)} y={H - 5} className="axis">{fmtDay(meta.horizons[0])}</text>
        <text x={x(n - 1)} y={H - 5} textAnchor="end" className="axis">{fmtDay(meta.horizons[meta.horizons.length - 1])}</text>
      </svg>
      <p className="note">Bars: events in each past four-week period. Line and band: forecast and {meta.interval} interval. Dashed line: 6-period moving average.</p>
      {admin1.length > 0 && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Provinces with the most violence forecast"><table>
          <caption>Provinces with the most organized violence forecast over the next six periods</caption>
          <thead><tr><th scope="col">Province (admin1)</th><th scope="col">Last 6 periods, avg</th><th scope="col">Next period</th><th scope="col">Next six, avg</th></tr></thead>
          <tbody>{admin1.slice(0, 8).map((a) => <tr key={a.name}><th scope="row">{a.name}</th><td className="tnum">{a.ma6}</td><td className="tnum">{a.fc[0]}</td><td className="tnum">{(a.fc.reduce((s, v) => s + v, 0) / a.fc.length).toFixed(1)}</td></tr>)}</tbody>
        </table></div>
      )}
    </section>
  );
}
