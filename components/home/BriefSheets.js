import "server-only";
import { geoArea, geoAzimuthalEqualArea, geoCentroid, geoDistance, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import topo from "world-atlas/countries-50m.json";
import details from "@/webdata/details.json";
import { watchlist } from "@/lib/console";
import { getSummary, queryCoups } from "@/lib/data";
import { flagSrc } from "@/lib/flags";
import { MONTHS, pct } from "@/lib/format";

// Two pages of the country brief drawn on screen from the same files the PDF is built from: the cover (same layout
// as lib/dossier-cover.js) and the figures that open page two. Drawn per issue, so they never go stale.
const NAVY = "#102135", INK = "#121416", MUTED = "#5f6d75", RULE = "#ccd4d9", TEAL = "#00706a", RED = "#c0392b", AMB = "#c77700";
const month = (s) => { const [y, m] = String(s).split("-"); return `${MONTHS[Number(m) - 1]} ${y}`; };

function outline(iso, maxW, maxH) {
  const all = feature(topo, topo.objects.countries).features;
  const me = all.find((f) => f.id === String(iso).padStart(3, "0"));
  if (!me) return null;
  const polys = me.geometry.type === "MultiPolygon" ? me.geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates })) : [me.geometry];
  const big = polys.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a)), bc = geoCentroid(big);
  const main = { type: "MultiPolygon", coordinates: polys.filter((q) => geoArea(q) >= geoArea(big) * 0.004 && geoDistance(geoCentroid(q), bc) < 0.7).map((q) => q.coordinates) };
  const proj = geoAzimuthalEqualArea().rotate([-bc[0], -bc[1]]).precision(0.1).fitExtent([[0, 0], [maxW, maxH]], main);
  const gp = geoPath(proj).digits(1), [[x0, y0], [x1, y1]] = gp.bounds(main);
  return { w: x1 - x0, h: y1 - y0, x0, y0, d: gp(main) };
}

const T = ({ x, y, size = 8, fill = INK, anchor = "start", f = "var(--font-text)", w = 400, track = 0, children }) => (
  <text x={x} y={y} style={{ font: `${w} ${size}px ${f}`, fill, letterSpacing: track }} textAnchor={anchor}>{children}</text>
);

export default function BriefSheets({ slug }) {
  const { meta } = getSummary(), list = watchlist(), c = list.find((x) => x.slug === slug) || list[0];
  const d = details[c.slug] || {}, flag = flagSrc(c.iso);
  const span = `${month(meta.forecast_from)} to ${month(meta.forecast_to)}`;
  const shape = outline(c.iso, 170, 106);
  const fw = 138, gap = 40, total = fw + (shape ? gap + shape.w : 0), x0 = 297.6 - total / 2;
  const coups = queryCoups({ slug: c.slug, conf: "C", types: ["riuscito", "fallito"] });
  const delta = c.risk_3m_ago == null ? null : c.risk - c.risk_3m_ago;
  const lastY = c.last ? Number(c.last.date.slice(0, 4)) + Number(c.last.date.slice(5, 7)) / 12 : null;
  const nowY = Number(meta.data_end.slice(0, 4)) + Number(meta.data_end.slice(5, 7)) / 12;
  const since = lastY == null ? "none" : `${Math.max(1, Math.round((nowY - lastY) * 12))} mo`;
  // where it sits among all countries, log scale
  const risks = list.map((x) => x.risk).filter((r) => r > 0), lo = Math.log(Math.max(1e-4, Math.min(...risks))), hi = Math.log(0.1);
  const sx = (r) => 48 + ((Math.log(Math.max(Math.exp(lo), r)) - lo) / (hi - lo)) * 499;
  const bins = new Map(); for (const r of risks) { const k = Math.round(sx(r) / 5); bins.set(k, (bins.get(k) || 0) + 1); }
  // forecast since 1975
  const h = d.risk_hist, t0 = h ? Number(h.start.slice(0, 4)) + (Number(h.start.slice(5, 7)) - 1) / 12 : 1975, n = h?.values.length || 1;
  const peak = h ? Math.max(...h.values.filter((v) => v != null)) : 0.1;
  const hx = (t) => 48 + ((t - t0) / (n / 12)) * 499, hy = (v) => 530 - (v / peak) * 104;
  const path = h ? h.values.map((v, i) => (v == null ? "" : `${i && h.values[i - 1] != null ? "L" : "M"}${hx(t0 + i / 12).toFixed(1)},${hy(v).toFixed(1)}`)).join("") : "";
  const cells = [["Probability, 6 mo", pct(c.risk), `80% range ${pct(c.risk_lo)} to ${pct(c.risk_hi)}`, TEAL],
    ["Rank", `${c.pos} / ${list.length}`, c.region, INK],
    ["3-month change", delta == null ? "n/a" : `${delta >= 0 ? "+" : "−"}${Math.abs(delta * 100).toFixed(1)} pp`, "in the estimate", INK],
    ["Since last attempt", since, `${c.attempts} since 1900`, INK]];

  return (
    <>
      <div className="sheet span-4" data-visual>
        <svg viewBox="0 0 595.3 841.9" role="img" aria-label={`Cover of the country brief for ${c.name}, coup-attempt outlook, ${span}`}>
          <image href="/brand/praevex-lockup-tagline-light.png" x="127.6" y="112" width="340" height="123.8" preserveAspectRatio="xMidYMid meet" />
          <line x1="275.6" x2="319.6" y1="262" y2="262" stroke={NAVY} strokeWidth=".8" />
          {flag && <><image href={flag} x={x0} y="325" width={fw} height="92" preserveAspectRatio="xMidYMid slice" /><rect x={x0} y="325" width={fw} height="92" fill="none" stroke={RULE} strokeWidth=".8" /></>}
          {shape && <><line x1={x0 + fw + gap / 2} x2={x0 + fw + gap / 2} y1="322" y2="422" stroke={RULE} strokeWidth=".6" /><path d={shape.d} transform={`translate(${x0 + fw + gap - shape.x0},${371 - shape.h / 2 - shape.y0})`} fill="none" stroke={INK} strokeWidth="1.2" /></>}
          <T x="297.6" y="510" size={c.name.length > 16 ? 36 : 52} f="var(--font-display)" w={500} fill={NAVY} anchor="middle">{c.name}</T>
          <T x="297.6" y="540" size={9} f="var(--font-mono)" fill={MUTED} anchor="middle" track="1.6">{c.region}</T>
          <T x="297.6" y="582" size={14} f="var(--font-display)" w={500} anchor="middle">Country brief. Coup-attempt outlook, {span}</T>
          <line x1="48" x2="547" y1="730" y2="730" stroke={NAVY} strokeWidth="1" />
          {[["Issue", meta.forecast_from], ["Window", span], ["Data through", month(meta.data_end)], ["Prepared for", "Analyst"]].map(([k, v], i) => (
            <g key={k}><T x={48 + i * 125} y="748" size={8} f="var(--font-mono)" fill={MUTED}>{k}</T><T x={48 + i * 125} y="764" size={10} w={500} fill={NAVY}>{v}</T></g>
          ))}
          <line x1="48" x2="547" y1="784" y2="784" stroke={RULE} strokeWidth=".6" />
          <T x="48" y="802" size={8} f="var(--font-mono)" fill={MUTED}>Praevex</T>
          <T x="547" y="802" size={8} fill={MUTED} anchor="end">Model estimates. Not investment advice.</T>
        </svg>
      </div>
      <div className="sheet span-4" data-visual>
        <svg viewBox="0 0 595.3 841.9" role="img" aria-label={`Figures from the brief for ${c.name}: probability ${pct(c.risk)}, rank ${c.pos} of ${list.length}, and its forecast history`}>
          <image href="/brand/praevex-lockup-light.png" x="252" y="22" width="92" height="34.5" preserveAspectRatio="xMidYMid meet" />
          <line x1="48" x2="547" y1="70" y2="70" stroke={NAVY} strokeWidth="1.4" />
          {flag && <image href={flag} x="48" y="92" width="52" height="35" preserveAspectRatio="xMidYMid slice" />}
          <T x="112" y="121" size={32} f="var(--font-display)" w={500} fill={NAVY}>{c.name}</T>
          <rect x="48" y="150" width="499" height="108" fill="#eef2f4" />
          {cells.map(([k, v, s, col], i) => (
            <g key={k}>
              <T x={60 + i * 124} y="174" size={9} f="var(--font-mono)" fill={MUTED}>{k}</T>
              <T x={60 + i * 124} y="212" size={v.length > 7 ? 19 : 22} f="var(--font-mono)" w={500} fill={col}>{v}</T>
              <T x={60 + i * 124} y="240" size={9} fill={MUTED}>{s}</T>
            </g>
          ))}
          <T x="48" y="292" size={11} f="var(--font-mono)" w={500} fill={TEAL}>Among all countries</T>
          <line x1="48" x2="547" y1="300" y2="300" stroke={NAVY} strokeWidth=".8" />
          {[...bins.entries()].flatMap(([k, count]) => Array.from({ length: Math.min(count, 12) }, (_, j) => <circle key={`${k}-${j}`} cx={k * 5} cy={374 - j * 5} r="1.7" fill="#9aa7ad" />))}
          <line x1={sx(meta.base_rate)} x2={sx(meta.base_rate)} y1="310" y2="380" stroke={RED} strokeDasharray="3 3" />
          <line x1={sx(c.risk)} x2={sx(c.risk)} y1="318" y2="368" stroke={TEAL} strokeWidth="1.4" />
          <circle cx={sx(c.risk)} cy="368" r="5" fill={TEAL} />
          <T x={Math.min(sx(c.risk), 540)} y="314" size={10} w={500} fill={TEAL} anchor="end">{c.name} {pct(c.risk)}</T>
          <T x={sx(meta.base_rate) + 5} y="320" size={9} fill={RED}>base rate</T>
          <T x="48" y="392" size={9} f="var(--font-mono)" fill={MUTED}>{pct(Math.exp(lo), 2)}</T><T x="547" y="392" size={9} f="var(--font-mono)" fill={MUTED} anchor="end">10%</T>

          <T x="48" y="412" size={11} f="var(--font-mono)" w={500} fill={TEAL}>Forecast since {Math.floor(t0)}</T>
          <line x1="48" x2="547" y1="418" y2="418" stroke={NAVY} strokeWidth=".8" />
          <line x1="48" x2="547" y1="530" y2="530" stroke={RULE} />
          <path d={`${path}L547,530L48,530Z`} fill="#e3eef0" />
          <path d={path} fill="none" stroke={NAVY} strokeWidth="1.1" />
          <T x="547" y="432" size={9} f="var(--font-mono)" fill={MUTED} anchor="end">peak {pct(peak)}</T>
          {coups.filter((e) => Number(e.date.slice(0, 4)) >= Math.floor(t0)).map((e) => { const t = Number(e.date.slice(0, 4)) + (Number(e.date.slice(5, 7) || 6) - 1) / 12; return <circle key={e.id} cx={hx(t)} cy="546" r="3.6" fill={e.type === "riuscito" ? RED : "#fff"} stroke={e.type === "riuscito" ? RED : AMB} strokeWidth="1.4" />; })}
          {[1980, 1990, 2000, 2010, 2020].map((y) => <T key={y} x={hx(y)} y="566" size={9} f="var(--font-mono)" fill={MUTED} anchor="middle">{y}</T>)}

          <T x="48" y="602" size={11} f="var(--font-mono)" w={500} fill={TEAL}>Every recorded attempt since 1900</T>
          <line x1="48" x2="547" y1="608" y2="608" stroke={NAVY} strokeWidth=".8" />
          <line x1="48" x2="547" y1="656" y2="656" stroke={RULE} />
          {coups.map((e) => { const t = Number(e.date.slice(0, 4)) + (Number(e.date.slice(5, 7) || 6) - 1) / 12; return <circle key={e.id} cx={48 + ((t - 1900) / (nowY - 1900)) * 499} cy={e.type === "riuscito" ? 640 : 672} r="4" fill={e.type === "riuscito" ? RED : "#fff"} stroke={e.type === "riuscito" ? RED : AMB} strokeWidth="1.5" />; })}
          {[1900, 1925, 1950, 1975, 2000].map((y) => <T key={y} x={48 + ((y - 1900) / (nowY - 1900)) * 499} y="696" size={9} f="var(--font-mono)" fill={MUTED} anchor="middle">{y}</T>)}
          <T x="48" y="630" size={9} fill={RED}>successful</T><T x="48" y="686" size={9} fill={AMB}>failed</T>
          <line x1="48" x2="547" y1="784" y2="784" stroke={RULE} strokeWidth=".6" />
          <T x="48" y="802" size={8} f="var(--font-mono)" fill={MUTED}>{c.name}, issue {meta.forecast_from}</T><T x="547" y="802" size={8} fill={MUTED} anchor="end">2 / 4</T>
        </svg>
      </div>
    </>
  );
}
