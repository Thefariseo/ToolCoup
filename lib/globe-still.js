import "server-only";
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import topo from "world-atlas/countries-110m.json";

// The signal field as a still drawing, from the same figures and colour ramp as the WebGL stage: what the home hero
// shows until the globe draws, and instead of it where WebGL cannot.
const RAMP = [[0, [10, 43, 43]], [0.38, [26, 184, 163]], [0.72, [255, 178, 46]], [1, [255, 56, 25]]];
const ramp = (r) => {
  const t = Math.max(0, Math.min(1, r)), i = Math.max(1, RAMP.findIndex(([s]) => s >= t));
  const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], k = (t - a) / (b - a || 1);
  return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * k)).join(",")})`;
};
const shapes = feature(topo, topo.objects.countries).features;

/** The paths of an orthographic globe fitted into `box`, turned to `center` ([lon, lat]) when one is given. */
export function globePaths(list, box, center = null) {
  const byIso = new Map(list.filter((c) => c.iso).map((c) => [String(c.iso).padStart(3, "0"), c]));
  const max = list[0]?.risk || 0.05;
  const projection = geoOrthographic().rotate(center ? [-center[0], -center[1] * 0.85] : [-17, -12]).fitExtent(box, { type: "Sphere" }).precision(0.5);
  const path = geoPath(projection).digits(1);
  return {
    sphere: path({ type: "Sphere" }), graticule: path(geoGraticule10()),
    land: shapes.map((f) => { const c = byIso.get(f.id), d = path(f); return d ? { d, fill: c ? ramp(Math.sqrt(c.risk / max)) : "#13201f" } : null; }).filter(Boolean),
  };
}

/** The hero's still: a wide drawing with the globe where the stage puts it, right of the words. */
export function heroSvg(list) {
  const { sphere, graticule, land } = globePaths(list, [[650, 70], [1410, 830]]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900"><rect width="1440" height="900" fill="#040707"/>`
    + `<path d="${sphere}" fill="#030606" stroke="#1b3a37"/><path d="${graticule}" fill="none" stroke="#12302d" stroke-width=".6"/>`
    + land.map((l) => `<path d="${l.d}" fill="${l.fill}" stroke="#030606" stroke-width=".5"/>`).join("") + `</svg>`;
}
