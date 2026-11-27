"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fmtEventDate, pct, TYPE_LABEL } from "@/lib/format";

/** Every attempt since the first reconstructed issue: when it happened (across) and where the model had ranked the
 *  country among all of them beforehand (down: the top is the highest chance). Drawn at the frame's real size.
 *  The nearest dot to the pointer names itself; a click (or the name, on a touch screen) opens the country. */
export default function RankChart({ events, from }) {
  const ref = useRef(null), [size, setSize] = useState({ w: 1280, h: 348 }), [on, setOn] = useState(null);
  const router = useRouter(), kind = useRef("mouse");
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(280, Math.round(e.contentRect.width)), h: Math.max(220, Math.round(e.contentRect.height)) }));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  const w = size.w, H = size.h, narrow = w < 640, L = narrow ? 44 : 72, R = 8, T = 28, B = 28;
  const t = (d) => Number(d.slice(0, 4)) + (Number(d.slice(5, 7)) - 0.5) / 12;
  const t0 = from, t1 = Math.ceil(Math.max(...events.map((e) => t(e.date))) + 0.05);
  const x = (d) => L + ((t(d) - t0) / (t1 - t0)) * (w - L - R);
  const y = (share) => T + Math.sqrt(share) * (H - T - B);     // square-root: the top of the ranking, where most attempts fall, gets room
  const years = []; for (let yr = t0; yr <= t1; yr += narrow ? 10 : 5) years.push(yr);
  const dots = events.map((e) => ({ ...e, cx: x(e.date), cy: y((e.rank - 1) / (e.n - 1)) }));
  const near = (ev) => {
    const box = ev.currentTarget.getBoundingClientRect(), px = ev.clientX - box.left, py = ev.clientY - box.top;
    let best = null, gap = 18 * 18;                                              // within a fingertip of a dot
    for (const d of dots) { const g = (d.cx - px) ** 2 + (d.cy - py) ** 2; if (g < gap) { gap = g; best = d; } }
    return best;
  };
  const say = (d) => `${fmtEventDate({ date: d.date, prec: "day" })}, ${TYPE_LABEL[d.type].toLowerCase()}`;
  return (
    <div ref={ref} className="record-plot fill" onPointerLeave={(e) => { if (e.pointerType === "mouse") setOn(null); }}>
      <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" className={on ? "aim" : undefined}
        aria-label={`${events.length} coup attempts since ${from} by the rank the model gave the country beforehand; most sit near the top of the ranking`}
        onPointerDown={(e) => { kind.current = e.pointerType; }}
        onPointerMove={(e) => { if (e.pointerType === "mouse") setOn(near(e)); }}
        onClick={(e) => {
          const d = near(e);
          if (d && kind.current === "mouse") router.push(`/paese/${d.slug}#history`);
          else setOn(d);                                                           // a finger first reads the dot, then follows its name
        }}>
        <rect className="band" x={L} y={y(0)} width={w - L - R} height={y(0.1) - y(0)} />
        <text className="axis-name" x={0} y={12}>Model&apos;s rank before the attempt</text>
        {[0, 0.1, 0.25, 0.5, 1].map((s) => (
          <g key={s}>
            <line className="gridline" x1={L} x2={w - R} y1={y(s)} y2={y(s)} />
            <text x={L - 8} y={y(s) + 4} textAnchor="end">{s === 0 ? "1st" : s === 1 ? "last" : `${s * 100}%`}</text>
          </g>
        ))}
        {years.map((yr) => <text key={yr} x={L + ((yr - t0) / (t1 - t0)) * (w - L - R)} y={H - 6} textAnchor={yr === t0 ? "start" : "middle"}>{yr}</text>)}
        {dots.map((d) => <circle key={d.slug + d.date} className={d.type === "riuscito" ? "ok" : "ko"} cx={d.cx} cy={d.cy} r={narrow ? 3 : 4.5} />)}
        {on && <circle className="halo" cx={on.cx} cy={on.cy} r="10" />}
      </svg>
      {on && (
        <div className={`record-tip${on.cx > w * 0.62 ? " left" : ""}${on.cy > H * 0.55 ? " up" : ""}`} style={{ left: on.cx, top: on.cy }} aria-live="polite">
          <Link href={`/paese/${on.slug}#history`} prefetch={false}>{on.name}</Link>
          <span>{say(on)}</span>
          <span>Ranked <b>{on.rank}</b> of {on.n} at {pct(on.p, 2)}</span>
        </div>
      )}
    </div>
  );
}
