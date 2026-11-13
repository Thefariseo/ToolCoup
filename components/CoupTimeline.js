"use client";

import { scaleUtc } from "d3-scale";
import { Tip, useTip } from "@/components/Tooltip";
import { CONF_LABEL, fmtEventDate, parseDate, TYPE_LABEL } from "@/lib/format";

const LANES = ["riuscito", "fallito", "complotto"];
const RADIUS = { A: 6.5, B: 5.5, C: 4.5, D: 3.5 };

/** Tutti gli eventi di un paese dal 1900: una riga per tipo, punto piu' grande = fonti piu' solide. */
export default function CoupTimeline({ events, endYear }) {
  const [tip, showTip, hideTip] = useTip();
  const W = 1000, laneH = 34, m = { t: 8, r: 16, b: 24, l: 86 };
  const lanes = LANES.filter((l) => l !== "complotto" || events.some((e) => e.type === "complotto"));
  const H = m.t + lanes.length * laneH + m.b;
  const x = scaleUtc().domain([new Date(Date.UTC(1900, 0, 1)), new Date(Date.UTC(endYear + 1, 0, 1))]).range([m.l, W - m.r]);
  const ticks = [];
  for (let y = 1900; y <= endYear; y += 10) ticks.push(y);

  // punti quasi sovrapposti nella stessa riga: sfalsati in verticale
  const placed = [];
  const marks = [...events].sort((a, b) => a.date.localeCompare(b.date)).map((e) => {
    const px = x(parseDate(e.date)), lane = lanes.indexOf(e.type);
    const near = placed.filter((p) => p.lane === lane && Math.abs(p.px - px) < 9).length;
    placed.push({ px, lane });
    const dy = near === 0 ? 0 : (near % 2 ? -1 : 1) * Math.ceil(near / 2) * 7;
    return { e, px, py: m.t + lane * laneH + laneH / 2 + dy };
  });

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Linea del tempo dei colpi di stato">
        {ticks.map((t) => {
          const px = x(new Date(Date.UTC(t, 0, 1)));
          return (
            <g key={t}>
              <line className="gridline" x1={px} x2={px} y1={m.t} y2={H - m.b} />
              <text x={px} y={H - 6} textAnchor="middle">{t}</text>
            </g>
          );
        })}
        {lanes.map((l, i) => (
          <g key={l}>
            <line className="gridline" x1={m.l} x2={W - m.r} y1={m.t + i * laneH + laneH / 2} y2={m.t + i * laneH + laneH / 2} />
            <text className="lab" x={m.l - 10} y={m.t + i * laneH + laneH / 2} dy="0.32em" textAnchor="end">
              {l === "riuscito" ? "Riusciti" : l === "fallito" ? "Falliti" : "Complotti"}
            </text>
          </g>
        ))}
        {marks.map(({ e, px, py }) => (
          <circle key={e.id} className={`tl-mark ${e.type}`} cx={px} cy={py} r={RADIUS[e.conf]}
                  onMouseMove={(evt) => showTip(evt, (<>
                    <b>{fmtEventDate(e)} · {TYPE_LABEL[e.type]}</b>
                    {e.label && <div>{e.label.length > 110 ? e.label.slice(0, 108) + "…" : e.label}</div>}
                    <span className="t2">Affidabilità {e.conf} · {CONF_LABEL[e.conf].split(":")[1].trim()}</span>
                  </>))}
                  onMouseLeave={hideTip} />
        ))}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}
