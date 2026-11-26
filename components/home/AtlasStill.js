import "server-only";
import { atlasMatrix } from "@/lib/console";

// The temporal atlas as a still drawing, from the same matrix: every fourth ridge, drawn with the stage's own
// geometry. It stands under the WebGL stage until the data arrive, and stays if WebGL cannot draw.
const X = (t, row) => -0.95 + 1.47 * t + (1 - row) * 0.22;
const Y = (row) => 0.38 - 1.16 * row;
const H = (v) => Math.sqrt(Math.min(1, v / 0.3));

export default function AtlasStill() {
  const { rows, quarters } = atlasMatrix(), W = 1000, Hh = 560;
  const sx = (x) => ((x + 1) / 2) * W, sy = (y) => ((1 - y) / 2) * Hh;
  const paths = [];
  for (let i = 0; i < rows.length; i += 4) {
    const pos = i / (rows.length - 1);
    let d = "", peak = 0;
    for (let q = 0; q < quarters; q += 3) {
      const v = rows[i].v[q] < 0 ? 0 : rows[i].v[q] / 10000, y = Y(pos) + H(v) * 0.3;
      peak = Math.max(peak, v);
      d += `${d ? "L" : "M"}${sx(X(q / (quarters - 1), pos)).toFixed(0)},${sy(y).toFixed(0)}`;
    }
    paths.push({ d, hot: peak > 0.08, warm: peak > 0.03 });
  }
  return (
    <svg className="atlas-still" viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" aria-hidden="true">
      {paths.map((p, i) => <path key={i} d={p.d} className={p.hot ? "hot" : p.warm ? "warm" : "calm"} />)}
    </svg>
  );
}
