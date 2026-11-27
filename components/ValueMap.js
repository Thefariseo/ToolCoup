import "server-only";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import topo from "world-atlas/countries-110m.json";
import MapHover from "@/components/MapHover";
import { allSlugs } from "@/lib/data";

// A world map drawn on the server: each country takes one of five steps of a single colour by its value.
// Names do the matching where the map's ISO code is missing (Kosovo, Somaliland and the like stay unfilled).
const features = feature(topo, topo.objects.countries).features.filter((f) => f.id !== "010");
const W = 1000, H = 500;
const projection = geoNaturalEarth1().fitExtent([[2, 2], [W - 2, H - 2]], { type: "FeatureCollection", features });
const path = geoPath(projection).digits(1);
const SHAPES = features.map((f) => ({ id: f.id, d: path(f) }));
const pad = (v) => String(v).padStart(3, "0");
const PAGES = new Set(allSlugs());

/**
 * values: [{iso, value, name, text, slug}]; steps: four thresholds, ascending; tone: "coup" | "rise" | "fall".
 * A pointer on a filled country reads its figure; a click opens its page (at `hash`).
 */
export default function ValueMap({ values, steps, tone = "rise", label, className = "", hash = "" }) {
  const by = new Map(values.filter((v) => v.iso).map((v) => [pad(v.iso), v]));
  const step = (v) => steps.reduce((n, s) => (v >= s ? n + 1 : n), 0);
  return (
    <MapHover hash={hash}>
      <svg className={`value-map tone-${tone} ${className}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMid meet" role="img" aria-label={label}>
        {SHAPES.map((s, i) => {
          const v = by.get(s.id);
          return v ? <path key={i} d={s.d} className={`s${step(v.value)}`} data-n={v.name} data-t={v.text} data-slug={PAGES.has(v.slug) ? v.slug : undefined} /> : <path key={i} d={s.d} className="none" />;
        })}
      </svg>
    </MapHover>
  );
}

export function MapKey({ labels, tone = "rise" }) {
  return (
    <ul className={`map-key tone-${tone}`} aria-label="Map key">
      {labels.map((l, i) => <li key={l}><i className={`s${i}`} />{l}</li>)}
    </ul>
  );
}
