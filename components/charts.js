"use client";

import { bisector, extent, max } from "d3-array";
import { scaleLinear, scaleUtc } from "d3-scale";
import { area as d3area, line as d3line } from "d3-shape";
import { useState } from "react";
import { Tip, useTip } from "@/components/Tooltip";
import { labelEn } from "@/lib/english";
import { fmtMonth, num } from "@/lib/format";

/**
 * Grafico a linee nel tempo. series: [{name, cls, points: [[Date, valore]]}]
 * markers: [{d: Date, success}] golpe da segnare con una linea verticale.
 */
export function LineChart({ series, markers = [], height = 220, fmt = num, area = false }) {
  const [tip, showTip, hideTip] = useTip();
  const [hover, setHover] = useState(null);
  const W = 640, m = { t: 12, r: 12, b: 22, l: 46 };
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return <p className="note">Insufficient data for this chart.</p>;
  const x = scaleUtc().domain(extent(all, (p) => p[0])).range([m.l, W - m.r]);
  const y = scaleLinear().domain([0, max(all, (p) => p[1]) || 1]).nice(4).range([height - m.b, m.t]);
  const ln = d3line().x((p) => x(p[0])).y((p) => y(p[1]));
  const [d0, d1] = x.domain();
  const marks = markers.filter((k) => k.d >= d0 && k.d <= d1);
  const bis = bisector((p) => p[0]).center;

  function move(evt) {
    const box = evt.currentTarget.getBoundingClientRect();
    const px = ((evt.clientX - box.left) / box.width) * (W - m.l - m.r) + m.l;
    const date = x.invert(px);
    const rows = series.map((s) => s.points[bis(s.points, date)]).filter(Boolean);
    if (!rows.length) return;
    const ref = rows[0][0];
    const mk = marks.find((k) => k.d.getUTCFullYear() === ref.getUTCFullYear() && k.d.getUTCMonth() === ref.getUTCMonth());
    setHover({ x: x(ref), pts: series.map((s, i) => ({ cls: s.cls, p: rows[i] })).filter((r) => r.p) });
    showTip(evt, (<>
      <b>{fmtMonth(ref)}</b>
      {series.map((s, i) => rows[i] && <div key={s.name}>{s.name}: {fmt(rows[i][1])}</div>)}
      {mk && <span className="t2">Coup: {mk.success ? "successful" : "failed"}</span>}
    </>));
  }

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={series.map((s) => s.name).join(", ")}>
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line className="gridline" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
            <text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{fmt(t)}</text>
          </g>
        ))}
        {x.ticks(6).map((t) => (
          <text key={+t} x={x(t)} y={height - 6} textAnchor="middle">{t.getUTCFullYear()}</text>
        ))}
        {marks.map((k, i) => (
          <line key={i} className={`coup ${k.success ? "" : "failed"}`} x1={x(k.d)} x2={x(k.d)} y1={m.t} y2={height - m.b} />
        ))}
        {area && <path className="area" d={d3area().x((p) => x(p[0])).y0(y(0)).y1((p) => y(p[1]))(series[0].points)} />}
        {series.map((s) => <path key={s.name} className={`line ${s.cls || ""}`} d={ln(s.points)} />)}
        {hover && <line className="cross" x1={hover.x} x2={hover.x} y1={m.t} y2={height - m.b} />}
        {hover && hover.pts.map((r, i) => (
          <circle key={i} className={`dot ${r.cls || ""}`} r={4} cx={x(r.p[0])} cy={y(r.p[1])} />
        ))}
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={height - m.t - m.b} fill="transparent"
              onMouseMove={move} onMouseLeave={() => { setHover(null); hideTip(); }} />
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

/** Barre orizzontali; con diverging le barre partono dallo zero al centro. */
export function HBars({ rows, value, label, fmt, cls, diverging = false, tipFor, labelWidth = 240 }) {
  const [tip, showTip, hideTip] = useTip();
  const W = 520, rowH = 26, m = { r: 56, l: labelWidth };
  const H = rows.length * rowH + 4;
  const ext = max(rows, (r) => Math.abs(value(r))) || 1;
  const x = scaleLinear().domain(diverging ? [-ext, ext] : [0, ext]).range([m.l, W - m.r]);
  const cut = Math.floor(labelWidth / 6.4);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {rows.map((r, i) => {
          const v = value(r), name = label(r);
          return (
            <g key={i} transform={`translate(0,${2 + i * rowH})`}
               onMouseMove={(e) => tipFor && showTip(e, tipFor(r))} onMouseLeave={hideTip}>
              <rect width={W} height={rowH} fill="transparent" />
              <text className="lab" x={m.l - 8} y={rowH / 2} dy="0.32em" textAnchor="end">
                {name.length > cut ? name.slice(0, cut - 1) + "…" : name}
              </text>
              <rect className={typeof cls === "function" ? cls(r) : cls} rx={3} x={Math.min(x(0), x(v))} y={5}
                    width={Math.max(1, Math.abs(x(v) - x(0)))} height={rowH - 10} />
              <text x={v >= 0 ? x(v) + 6 : x(v) - 6} y={rowH / 2} dy="0.32em" textAnchor={v >= 0 ? "start" : "end"}>{fmt(r)}</text>
            </g>
          );
        })}
        {diverging && <line className="zero" x1={x(0)} x2={x(0)} y1={0} y2={H} />}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

/** Andamento medio attorno ai golpe: asse x in mesi dall'evento, y in deviazioni standard. */
export function StudyChart({ offsets, values, lo, hi, title }) {
  const [tip, showTip, hideTip] = useTip();
  const [hover, setHover] = useState(null);
  const W = 300, H = 170, m = { t: 10, r: 10, b: 24, l: 36 };
  const x = scaleLinear().domain(extent(offsets)).range([m.l, W - m.r]);
  const y = scaleLinear().domain([lo, hi]).nice(4).range([H - m.b, m.t]);
  const pts = offsets.map((o, i) => [o, values[i]]).filter((p) => p[1] != null);
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
  function move(evt) {
    const box = evt.currentTarget.getBoundingClientRect();
    const o = Math.round(x.invert(((evt.clientX - box.left) / box.width) * (W - m.l - m.r) + m.l));
    const p = pts.find((q) => q[0] === o);
    if (!p) return;
    setHover(p);
    showTip(evt, (<>
      <b>{o === 0 ? "Coup month" : o > 0 ? `${o} months after` : `${-o} months before`}</b>
      {title}: {sign(p[1])} std. dev.
    </>));
  }
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line className={t === 0 ? "zero" : "gridline"} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
            <text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{sign(t)}</text>
          </g>
        ))}
        <line className="coup" x1={x(0)} x2={x(0)} y1={m.t} y2={H - m.b} />
        {[-12, -6, 0, 6].map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle">{t === 0 ? "coup" : `${t > 0 ? "+" : ""}${t} months`}</text>
        ))}
        <path className="line" d={d3line().x((p) => x(p[0])).y((p) => y(p[1]))(pts)} />
        {hover && <circle className="dot" r={4} cx={x(hover[0])} cy={y(hover[1])} />}
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="transparent"
              onMouseMove={move} onMouseLeave={() => { setHover(null); hideTip(); }} />
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

/** Fattori di rischio: scostamento dell'odds ratio da 1 (scala logaritmica). */
export function FactorBars({ factors }) {
  const rows = factors.map((f) => ({ ...f, v: Math.log(f.odds_ratio) }));
  return (
    <HBars rows={rows} value={(r) => r.v} label={(r) => labelEn(r.label)} diverging
           cls={(r) => (r.v >= 0 ? "bar-up" : "bar-down")}
           fmt={(r) => "×" + r.odds_ratio.toFixed(2)}
           tipFor={(r) => (<><b>{labelEn(r.label)}</b>Odds multiply by {r.odds_ratio.toFixed(2)} for each one-standard-deviation increase</>)} />
  );
}

/** Calibrazione: per ogni fascia di rischio, probabilita' prevista (punti) e frequenza osservata (barre). */
export function CalibrationChart({ bins }) {
  const [tip, showTip, hideTip] = useTip();
  const W = 640, H = 240, m = { t: 12, r: 12, b: 34, l: 46 };
  const top = max(bins, (b) => Math.max(b.predicted, b.observed)) || 1;
  const y = scaleLinear().domain([0, top]).nice(4).range([H - m.b, m.t]);
  const bw = (W - m.l - m.r) / bins.length;
  const pc = (v) => (v * 100).toFixed(v < 0.01 ? 2 : 1) + "%";
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Predicted probability and observed frequency by risk band">
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line className="gridline" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
            <text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{pc(t)}</text>
          </g>
        ))}
        {bins.map((b, i) => {
          const cx = m.l + i * bw + bw / 2;
          return (
            <g key={i} onMouseMove={(e) => showTip(e, (<>
                 <b>Band {i + 1} of {bins.length}</b>
                 Predicted {pc(b.predicted)} · observed {pc(b.observed)}
                 <br /><span className="t2">{b.events} events in {b.n.toLocaleString("en-GB")} country-months</span>
               </>))} onMouseLeave={hideTip}>
              <rect x={m.l + i * bw} y={m.t} width={bw} height={H - m.t - m.b} fill="transparent" />
              <rect className="bar-s" rx={3} x={cx - bw * 0.3} width={bw * 0.6} y={y(b.observed)} height={Math.max(0, y(0) - y(b.observed))} />
              <circle className="dot s2" r={5} cx={cx} cy={y(b.predicted)} />
              <text x={cx} y={H - 18} textAnchor="middle">{i + 1}</text>
            </g>
          );
        })}
        <text x={(W + m.l) / 2} y={H - 3} textAnchor="middle">risk bands, lowest to highest</text>
      </svg>
      <Tip tip={tip} />
    </div>
  );
}
