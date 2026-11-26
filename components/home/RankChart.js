"use client";

import { useEffect, useRef, useState } from "react";
import { fmtEventDate, pct, TYPE_LABEL } from "@/lib/format";

/** Every attempt since the first reconstructed issue: when it happened (across) and where the model had ranked the
 *  country among all of them beforehand (down: the top is the highest chance). Drawn at the frame's real size. */
export default function RankChart({ events, from }) {
  const ref = useRef(null), [size, setSize] = useState({ w: 1280, h: 348 });
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(280, Math.round(e.contentRect.width)), h: Math.max(220, Math.round(e.contentRect.height)) }));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  const w = size.w, H = size.h, narrow = w < 640, L = narrow ? 44 : 72, R = 8, T = 10, B = 28;
  const t = (d) => Number(d.slice(0, 4)) + (Number(d.slice(5, 7)) - 0.5) / 12;
  const t0 = from, t1 = Math.ceil(Math.max(...events.map((e) => t(e.date))) + 0.05);
  const x = (d) => L + ((t(d) - t0) / (t1 - t0)) * (w - L - R);
  const y = (share) => T + Math.sqrt(share) * (H - T - B);     // square-root: the top of the ranking, where most attempts fall, gets room
  const years = []; for (let yr = t0; yr <= t1; yr += narrow ? 10 : 5) years.push(yr);
  return (
    <div ref={ref} className="record-plot fill">
      <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img"
        aria-label={`${events.length} coup attempts since ${from} by the rank the model gave the country beforehand; most sit near the top of the ranking`}>
        <rect className="band" x={L} y={y(0)} width={w - L - R} height={y(0.1) - y(0)} />
        {[0, 0.1, 0.25, 0.5, 1].map((s) => (
          <g key={s}>
            <line className="gridline" x1={L} x2={w - R} y1={y(s)} y2={y(s)} />
            <text x={L - 8} y={y(s) + 4} textAnchor="end">{s === 0 ? "1st" : s === 1 ? "last" : `${s * 100}%`}</text>
          </g>
        ))}
        {years.map((yr) => <text key={yr} x={L + ((yr - t0) / (t1 - t0)) * (w - L - R)} y={H - 6} textAnchor={yr === t0 ? "start" : "middle"}>{yr}</text>)}
        {events.map((e) => (
          <circle key={e.slug + e.date} className={e.type === "riuscito" ? "ok" : "ko"} cx={x(e.date)} cy={y((e.rank - 1) / (e.n - 1))} r={narrow ? 3 : 4.5}>
            <title>{`${e.name}, ${fmtEventDate({ date: e.date, prec: "day" })}: ${TYPE_LABEL[e.type].toLowerCase()}; ranked ${e.rank} of ${e.n} at ${pct(e.p, 2)}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
