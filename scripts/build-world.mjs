// Builds the dot grid used by the Signal Field: one point per land cell, tagged with its country.
// Rows are evenly spaced in latitude; the number of cells per row shrinks with cos(latitude), so
// dots are evenly spread on the sphere. Output: public/geo/land.bin (Int16 triples: lon*100,
// lat*100, country index) and public/geo/land.json (index -> ISO numeric, name, centroid).
//
//   node scripts/build-world.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { geoArea, geoBounds, geoCentroid, geoContains } from "d3-geo";
import { feature } from "topojson-client";

export const STEP = 0.75;
const topo = JSON.parse(readFileSync(new URL("../node_modules/world-atlas/countries-50m.json", import.meta.url)));
const features = feature(topo, topo.objects.countries).features.filter((f) => f.id !== "010");

const mainCentroid = (f) => {
  if (f.geometry.type !== "MultiPolygon") return geoCentroid(f);
  let best = null, area = -1;
  for (const coordinates of f.geometry.coordinates) {
    const poly = { type: "Polygon", coordinates }, a = geoArea(poly);
    if (a > area) { area = a; best = poly; }
  }
  return geoCentroid(best);
};
const meta = features.map((f) => ({ iso: f.id || null, name: f.properties.name, c: mainCentroid(f).map((v) => +v.toFixed(2)) }));
const bounds = features.map((f) => geoBounds(f));
const inBox = ([[w, s], [e, n]], lon, lat) => lat >= s && lat <= n && (w <= e ? lon >= w && lon <= e : lon >= w || lon <= e);

const out = [], count = new Array(features.length).fill(0);
const rows = Math.round(180 / STEP);
for (let r = 0; r < rows; r++) {
  const lat = -90 + (r + 0.5) * STEP;
  if (lat < -58) continue;
  const n = Math.max(1, Math.round((360 / STEP) * Math.cos((lat * Math.PI) / 180)));
  for (let c = 0; c < n; c++) {
    const lon = -180 + ((c + 0.5) / n) * 360;
    for (let i = 0; i < features.length; i++) {
      if (inBox(bounds[i], lon, lat) && geoContains(features[i], [lon, lat])) { out.push(lon, lat, i); count[i]++; break; }
    }
  }
}
features.forEach((_, i) => { if (!count[i]) out.push(meta[i].c[0], meta[i].c[1], i); }); // small states: one dot

const bin = new Int16Array(out.length);
for (let i = 0; i < out.length; i += 3) { bin[i] = Math.round(out[i] * 100); bin[i + 1] = Math.round(out[i + 1] * 100); bin[i + 2] = out[i + 2]; }
mkdirSync(new URL("../public/geo/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/geo/land.bin", import.meta.url), Buffer.from(bin.buffer));
writeFileSync(new URL("../public/geo/land.json", import.meta.url), JSON.stringify({ step: STEP, n: out.length / 3, countries: meta }));
console.log(`${out.length / 3} dots, ${features.length} countries, ${(bin.byteLength / 1024).toFixed(0)} KB`);
