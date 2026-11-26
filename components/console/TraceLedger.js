"use client";

import { Fragment } from "react";
import { pct } from "@/lib/format";

const AM = "#ffb22e", CY = "#29c7e0", TE = "#2fd3bd", TX = "#d8e4e0", MU = "#7d8b88", LN = "#1d2a28", PEER = "#6a817c";
const prob = (v) => pct(v, v < 0.001 ? 3 : v < 0.01 ? 2 : v < 0.1 ? 1 : 0);
const tick = (p) => { const v = p * 100; return `${+(v >= 1 ? v.toFixed(0) : v.toPrecision(1))}%`; };
const fill = (c) => ({ fill: c });                      // an inline style: the global "svg text" rule beats a fill attribute
const signed = (d) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`;
const mult = (d) => `×${Math.exp(d).toFixed(d >= 0 ? 1 : 2)}`;

/**
 * The Model Trace as crisp vector rows over the swarm. Left of each group row: its bar on a log-probability axis, from the probability before
 * the group's term to the probability after it. Right: every other country as a tick on the same group, and this country as a dot.
 */
export default function TraceLedger({ ledger: L, focus, onFocus, name, readOnly = false }) {
  if (!L) return null;
  const groups = L.rows.filter((r) => r.kind === "group"), axisEnd = L.top + L.rows.length * L.rh;
  const stripEnd = groups.length ? groups.at(-1).y + L.rh / 2 : axisEnd;
  const toggle = (key) => onFocus(focus === key ? null : key);
  return (
    <svg className="cx-ledger" viewBox={`0 0 ${L.W} ${L.H}`} width={L.W} height={L.H} role={readOnly ? "img" : "group"} aria-label={`Model trace for ${name}`}>
      <text className="cap" x={L.bx0} y={L.top - 32}>Probability, log scale</text>
      {L.legend && (
        <>
          <text className="cap" x={L.bx0 + 186} y={L.top - 32} style={fill(AM)}>■ raises</text>
          <text className="cap" x={L.bx0 + 252} y={L.top - 32} style={fill(CY)}>■ lowers</text>
        </>
      )}
      {L.strips && <text className="cap" x={L.sx0} y={L.top - 32}>Other countries, log-odds</text>}
      {L.axis.map((t) => (
        <Fragment key={t.p}>
          <line x1={t.x} x2={t.x} y1={L.top - 8} y2={axisEnd} stroke={LN} />
          <text className="tick" x={t.x} y={L.top - 16} textAnchor="middle">{tick(t.p)}</text>
        </Fragment>
      ))}
      {L.stripAxis.map((t) => (
        <Fragment key={t.v}>
          <line x1={t.x} x2={t.x} y1={L.top - 8} y2={stripEnd} stroke={t.v === 0 ? MU : LN} />
          <text className="tick" x={t.x} y={L.top - 16} textAnchor="middle">{t.v > 0 ? "+" : t.v < 0 ? "−" : ""}{Math.abs(t.v)}</text>
        </Fragment>
      ))}

      {L.rows.map((r, i) => {
        const prev = L.rows[i - 1];
        if (r.kind === "ref") return (
          <g key="ref">
            <text className="lab" x={16} y={r.y + 4} style={fill(MU)}>{r.label}</text>
            <circle cx={r.x} cy={r.y} r={4} fill={MU} />
            <text className="num" x={L.numX} y={r.y + 4} style={fill(MU)}>{prob(r.p)}</text>
          </g>
        );
        if (r.kind === "group") {
          const on = focus === r.key, dim = focus && !on, col = r.s.d >= 0 ? AM : CY;
          return (
            <g key={r.key} className={`row${on ? " on" : ""}`} opacity={dim ? 0.45 : 1} {...(readOnly ? {} : { role: "button", tabIndex: 0, "aria-pressed": on, onClick: () => toggle(r.key), onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(r.key); } } })}>
              <title>{`${r.label}: odds ${mult(r.s.d)} (log-odds ${signed(r.s.d)}); ${r.s.share == null ? "no peer data" : `${r.s.side} ${Math.max(1, Math.round(r.s.share * 100))}% of countries on this group`}.${readOnly ? "" : " Click to list its drivers."}`}</title>
              <rect className="hit" x={8} y={r.y - L.rh / 2} width={L.W - 16} height={L.rh} />
              <line x1={r.xa} x2={r.xa} y1={prev.y + 4} y2={r.y - 4} stroke={MU} strokeWidth="0.6" />
              <text className="lab" x={16} y={r.y + 4} style={fill(on ? "#fff" : TX)}>{r.label}</text>
              <rect x={Math.min(r.xa, r.xb)} y={r.y - 4} width={Math.max(2, Math.abs(r.xb - r.xa))} height={8} fill={col} />
              <text className="num" x={L.numX} y={r.y + 4} style={fill(col)}>{L.compact ? mult(r.s.d) : `${signed(r.s.d)}  ${mult(r.s.d)}`}</text>
              {L.strips && (
                <>
                  <line x1={L.sx0} x2={L.sx1} y1={r.base} y2={r.base} stroke={LN} />
                  {r.bars.map((d, k) => <rect key={k} x={d.x - 1.1} y={r.base - d.h} width={2.2} height={d.h} fill={PEER} opacity="0.7" />)}
                  <circle cx={r.mark} cy={r.base} r={4.5} fill={col} stroke="#000" strokeWidth="1" />
                  <text className="num" x={L.shareX} y={r.y + 4} style={fill(col)}>{r.s.share == null ? "" : `${r.s.side} ${Math.max(1, Math.round(r.s.share * 100))}%`}</text>
                </>
              )}
            </g>
          );
        }
        if (r.kind === "logit") return (
          <g key="logit">
            <line x1={r.x} x2={r.x} y1={prev.y + 4} y2={r.y - 4} stroke={MU} strokeWidth="0.6" />
            <text className="lab" x={16} y={r.y + 4}>{r.label}</text>
            <circle cx={r.x} cy={r.y} r={4} fill={TX} />
            <text className="num" x={L.numX} y={r.y + 4} style={fill(TX)}>{prob(r.p)}</text>
          </g>
        );
        if (r.kind === "avg") {
          const xs = L.comps.map((c) => c.x), lo = Math.min(...xs), hi = Math.max(...xs);
          return (
            <g key="avg">
              <text className="lab" x={16} y={r.y + 4}>{r.label}</text>
              <rect x={lo} y={r.y - 6} width={Math.max(2, hi - lo)} height={12} fill={TX} opacity="0.07" />
              {L.comps.map((c) => <circle key={c.key} cx={c.x} cy={r.y} r={2.6} fill={MU}><title>{`${c.key}: ${prob(c.p)}`}</title></circle>)}
              <circle cx={r.x} cy={r.y} r={4.5} fill="none" stroke={TX} strokeWidth="1.4" />
              <text className="num" x={L.numX} y={r.y + 4} style={fill(TX)}>{prob(r.p)}</text>
            </g>
          );
        }
        return (
          <g key="pub">
            <text className="lab" x={16} y={r.y + 4} style={fill("#fff")}>{r.label}</text>
            <line x1={r.xl} x2={r.xh} y1={r.y} y2={r.y} stroke={TE} strokeWidth="2.4" />
            <line x1={r.xl} x2={r.xl} y1={r.y - 4} y2={r.y + 4} stroke={TE} />
            <line x1={r.xh} x2={r.xh} y1={r.y - 4} y2={r.y + 4} stroke={TE} />
            <circle cx={r.x} cy={r.y} r={5.5} fill={TE} stroke="#000" strokeWidth="1" />
            <text className="num big" x={L.numX} y={r.y + 4} style={fill(TE)}>{prob(r.p)}</text>
            {!L.compact && <text className="cap" x={L.numX} y={r.y + 18}>80%: {prob(r.lo)}–{prob(r.hi)}</text>}
          </g>
        );
      })}
      {L.foot.map((t, k) => <text key={k} className="foot" x={16} y={L.H - 30 + k * 16}>{t}</text>)}
    </svg>
  );
}
