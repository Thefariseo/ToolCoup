"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MONTHS, pct } from "@/lib/format";

const WINDOWS = [{ key: "all", label: "1975→", months: null }, { key: "25", label: "25Y", months: 300 }, { key: "10", label: "10Y", months: 120 }];
const CHANNELS = [{ key: "unrest", label: "UNREST", cls: "c1" }, { key: "violence", label: "VIOLENCE", cls: "c2" }, { key: "fatalities", label: "FATALITIES", cls: "c3" }];
const ym = (s) => { const [y, m] = s.split("-").map(Number); return y * 12 + (m - 1); };
const label = (t) => `${MONTHS[t % 12].toUpperCase()} ${Math.floor(t / 12)}`;

/** Selected country over time: published risk (monthly), recorded coups, ACLED monthly counts. */
export default function Strip({ country, detail }) {
  const ref = useRef(null);
  const [w, setW] = useState(800), [win, setWin] = useState("all"), [hover, setHover] = useState(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);

  const d = useMemo(() => {
    const risk = detail?.risk_hist, series = detail?.series;
    if (!risk?.values?.length) return null;
    const r0 = ym(risk.start), end = r0 + risk.values.length - 1, span = WINDOWS.find((x) => x.key === win).months;
    const t0 = span ? Math.max(r0, end - span + 1) : r0, s0 = series ? ym(series.start) : null;
    const at = (arr, base, t) => (arr && t >= base && t - base < arr.length ? arr[t - base] : null);
    const months = Array.from({ length: end - t0 + 1 }, (_, i) => t0 + i);
    const maxRisk = Math.max(0.02, ...months.map((t) => at(risk.values, r0, t) ?? 0));
    const maxOf = Object.fromEntries(CHANNELS.map((c) => [c.key, Math.max(1, ...months.map((t) => at(series?.[c.key], s0, t) ?? 0))]));
    const coups = (detail.coups || []).filter((e) => e.type !== "complotto" && e.conf !== "D" && !e.dup)
      .map((e) => ({ ...e, t: ym(e.date.slice(0, 7)) })).filter((e) => e.t >= t0 && e.t <= end);
    return { t0, end, months, maxRisk, maxOf, coups, risk: (t) => at(risk.values, r0, t), ch: (k, t) => at(series?.[k], s0, t) };
  }, [detail, win]);

  const H = 150, padL = 44, padR = 14, top = 16, riskH = 66, rowH = 14, rowsTop = top + riskH + 8;
  const x = (t) => padL + ((t - d.t0) / Math.max(1, d.end - d.t0)) * (w - padL - padR);
  const y = (v) => top + riskH - (v / d.maxRisk) * riskH;
  const path = d ? d.months.map((t, i) => { const v = d.risk(t); return v == null ? "" : `${i && d.risk(t - 1) != null ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`; }).join("") : "";
  const years = d ? (() => { const span = (d.end - d.t0) / 12, step = span > 30 ? 10 : span > 12 ? 5 : 1, out = []; for (let yr = Math.ceil(d.t0 / 12 / step) * step; yr * 12 <= d.end; yr += step) out.push(yr); return out; })() : [];
  const bw = d ? Math.max(1, (w - padL - padR) / d.months.length - 0.5) : 1;
  const onMove = (e) => {
    if (!d) return;
    const r = ref.current.getBoundingClientRect(), f = (e.clientX - r.left - padL) / (w - padL - padR);
    setHover(f < 0 || f > 1 ? null : d.t0 + Math.round(f * (d.end - d.t0)));
  };
  const t = hover ?? d?.end;

  return (
    <section className="cx-strip" aria-label="Country timeline">
      <header>
        <h2>TIMELINE <em>{country?.name?.toUpperCase()}</em></h2>
        {d && (
          <p className="cx-strip-read">
            <b>{label(t)}</b><span>P {d.risk(t) == null ? "—" : pct(d.risk(t), 2)}</span>
            {CHANNELS.map((c) => <span key={c.key} className={c.cls}>{c.label} {d.ch(c.key, t) ?? "—"}</span>)}
          </p>
        )}
        <div className="cx-seg" role="group" aria-label="Time window">
          {WINDOWS.map((o) => <button key={o.key} className={win === o.key ? "on" : ""} onClick={() => setWin(o.key)}>{o.label}</button>)}
        </div>
      </header>
      <div ref={ref} className="cx-strip-plot" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {!d ? <p className="cx-wait">{detail ? "NO FORECAST HISTORY FOR THIS COUNTRY" : "RETRIEVING SERIES"}<i>_</i></p> : (
          <svg width={w} height={H} role="img" aria-label={`Monthly coup-attempt probability for ${country.name}, with recorded coups and ACLED counts`}>
            {years.map((yr) => <g key={yr}><line className="grid" x1={x(yr * 12)} x2={x(yr * 12)} y1={top} y2={H - 14} /><text className="axis" x={x(yr * 12) + 3} y={H - 3}>{yr}</text></g>)}
            <line className="grid" x1={padL} x2={w - padR} y1={top} y2={top} /><line className="base" x1={padL} x2={w - padR} y1={top + riskH} y2={top + riskH} />
            <text className="axis" x={padL - 5} y={top + 4} textAnchor="end">{pct(d.maxRisk, 1)}</text>
            <text className="axis" x={padL - 5} y={top + riskH + 3} textAnchor="end">0</text>
            <path className="risk-fill" d={`${path}L${x(d.end)},${top + riskH}L${x(d.months.find((m) => d.risk(m) != null) ?? d.t0)},${top + riskH}Z`} />
            <path className="risk" d={path} />
            {d.coups.map((e) => (
              <g key={e.id} className={`coup ${e.type === "riuscito" ? "ok" : "ko"}`}>
                <line x1={x(e.t)} x2={x(e.t)} y1={top - 6} y2={top + riskH} />
                <path d={`M${x(e.t)},${top - 12}l4,4l-4,4l-4,-4Z`} /><title>{`${e.date} · ${e.type === "riuscito" ? "successful coup" : "failed attempt"} · confidence ${e.conf}`}</title>
              </g>
            ))}
            {CHANNELS.map((c, i) => (
              <g key={c.key} className={c.cls}>
                <text className="axis" x={padL - 5} y={rowsTop + i * (rowH + 3) + rowH - 3} textAnchor="end">{c.label.slice(0, 3)}</text>
                {d.months.map((m) => { const v = d.ch(c.key, m); if (!v) return null; const h = Math.max(1, (Math.log1p(v) / Math.log1p(d.maxOf[c.key])) * rowH); return <rect key={m} x={x(m) - bw / 2} y={rowsTop + i * (rowH + 3) + rowH - h} width={bw} height={h} />; })}
              </g>
            ))}
            {hover != null && <line className="cursor" x1={x(hover)} x2={x(hover)} y1={top - 6} y2={H - 14} />}
            {d.risk(d.end) != null && <circle className="now" cx={x(d.end)} cy={y(d.risk(d.end))} r="3" />}
          </svg>
        )}
      </div>
    </section>
  );
}
