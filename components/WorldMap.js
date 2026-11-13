"use client";

import { geoArea, geoNaturalEarth1, geoPath, geoGraticule10 } from "d3-geo";
import { feature } from "topojson-client";
import topo from "world-atlas/countries-50m.json";

const W = 960, H = 480;
const features = feature(topo, topo.objects.countries).features.filter((f) => f.id !== "010"); // senza Antartide
const projection = geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: "FeatureCollection", features });
const path = geoPath(projection);

/** Centro della parte piu' grande del paese (evita che i territori d'oltremare spostino il punto). */
function mainCentroid(f) {
  if (f.geometry.type !== "MultiPolygon") return path.centroid(f);
  let best = null, bestArea = -1;
  for (const coords of f.geometry.coordinates) {
    const poly = { type: "Polygon", coordinates: coords };
    const a = geoArea(poly);
    if (a > bestArea) { bestArea = a; best = poly; }
  }
  return path.centroid(best);
}

const SHAPES = features.map((f) => ({ id: f.id, name: f.properties.name, d: path(f), c: mainCentroid(f) }));
const CENTROID = new Map(SHAPES.filter((s) => s.id).map((s) => [s.id, s.c]));
export const MAP_IDS = new Set(SHAPES.map((s) => s.id).filter(Boolean));

/**
 * classOf(iso) -> classe di colore ("q0".."q5") o ""; active(iso) -> il paese e' cliccabile;
 * dots: [{iso, type, i, n}] eventi da segnare (i = posizione tra gli n eventi dello stesso paese).
 */
export default function WorldMap({ classOf, active, selectedIso, dots = [], onSelect, onHover, onLeave, label }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <path d={path(geoGraticule10())} className="graticule" aria-hidden="true" />
      <g>
        {SHAPES.map((s, k) => {
          const on = s.id && active(s.id);
          return (
            <path
              key={k} d={s.d}
              className={`country ${classOf(s.id) || ""} ${on ? "has" : ""} ${s.id && s.id === selectedIso ? "sel" : ""}`}
              onMouseMove={(e) => onHover(e, s.id, s.name)} onMouseLeave={onLeave}
              role={on ? "button" : undefined} tabIndex={on ? 0 : undefined}
              aria-label={on ? `Select ${s.name}` : undefined}
              onKeyDown={on ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(s.id); } } : undefined}
              onClick={on ? () => onSelect(s.id) : undefined}
            />
          );
        })}
      </g>
      {selectedIso && SHAPES.filter((s) => s.id === selectedIso).map((s) => (
        <path key="sel" d={s.d} className="country sel" style={{ fill: "none", pointerEvents: "none" }} />
      ))}
      <g>
        {dots.map((d, k) => {
          const c = CENTROID.get(d.iso);
          if (!c || Number.isNaN(c[0])) return null;
          const x = c[0] + (d.i - (d.n - 1) / 2) * 9;
          return (
            <g key={k}>
              <circle className="ev-halo" cx={x} cy={c[1]} r={6} />
              <circle className={`ev ${d.type}`} cx={x} cy={c[1]} r={3.6} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
