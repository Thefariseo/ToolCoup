// Cover page of the country brief. White page, the full horizontal logo (statue, wordmark and tagline) centred, then the country shown twice side by side: its flag and its outline in
// plain black on white (only the country, no neighbours and no map), the name under them, and a row of identifiers at the foot. It follows the
// restraint of EU briefings and country reports: the cover says what the document is and about whom, and carries no figure.
// The layout is fixed (A4); nothing here is measured against the other pages.
import "server-only";
import { rgb } from "pdf-lib";
import { LENSES } from "@/lib/dossier-profile";

const W = 595.28, H = 841.89, CX = W / 2, X0 = 48, X1 = W - 48, CW = X1 - X0;
const NAVY = rgb(0.06, 0.13, 0.21), INK = rgb(0.07, 0.08, 0.09), MUTED = rgb(0.38, 0.43, 0.46), RULE = rgb(0.8, 0.83, 0.85);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (s) => { const m = /^(\d{4})-(\d{2})/.exec(String(s ?? "")); return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : String(s ?? ""); };

export async function drawCover({ page, F, clean, img, flagImg, facts }) {
  const fc = facts.forecast, name = facts.country.name;
  const lens = LENSES[facts.reader?.lens]?.label || "Analyst";
  const w = (t, f, size, track = 0) => F[f].widthOfTextAtSize(t, size) + track * Math.max(0, [...t].length - 1);
  // text with its top at `top`; align l|c|r; optional letter-spacing
  const text = (t, x, top, { f = "sans", size = 8, color = INK, align = "l", track = 0 } = {}) => {
    const s = clean(t); if (!s) return 0;
    const tw = w(s, f, size, track), x0 = align === "c" ? x - tw / 2 : align === "r" ? x - tw : x, y = H - (top + size * 0.82);
    if (!track) page.drawText(s, { x: x0, y, font: F[f], size, color });
    else { let cx = x0; for (const ch of s) { page.drawText(ch, { x: cx, y, font: F[f], size, color }); cx += F[f].widthOfTextAtSize(ch, size) + track; } }
    return tw;
  };
  const line = (x1, t1, x2, t2, { color = RULE, t = 0.5 } = {}) => page.drawLine({ start: { x: x1, y: H - t1 }, end: { x: x2, y: H - t2 }, thickness: t, color });
  const wrapWords = (t, f, size, width) => { const out = []; let ln = ""; for (const word of clean(t).split(" ")) { const x = ln ? `${ln} ${word}` : word; if (w(x, f, size) <= width || !ln) ln = x; else { out.push(ln); ln = word; } } if (ln) out.push(ln); return out; };
  // the country name, as large as the width allows; a long name goes on two lines
  const nameLines = (max) => {
    for (let s = 54; s >= 34; s -= 2) { const ls = wrapWords(name, "serifB", s, max); if (ls.length === 1) return { ls, s }; }
    for (let s = 46; s >= 30; s -= 2) { const ls = wrapWords(name, "serifB", s, max); if (ls.length <= 2) return { ls, s }; }
    return { ls: wrapWords(name, "serifB", 30, max).slice(0, 3), s: 30 };
  };

  // ---- the logo, centred: the horizontal lockup with its tagline, as one image
  const logo = await img("praevex-lockup-tagline-light.png");
  if (logo) { const wd = 340, h = (logo.height / logo.width) * wd; page.drawImage(logo, { x: CX - wd / 2, y: H - (112 + h), width: wd, height: h }); }
  line(CX - 22, 262, CX + 22, 262, { color: NAVY, t: 0.8 });

  // ---- the flag and the outline of the country, side by side, the outline a little taller than the flag
  const rowTop = 318, fh = 92, fw = flagImg ? Math.min(150, fh * (flagImg.width / flagImg.height)) : 0;
  let shape = await outline(facts.country.iso, 170, fh * 1.16);
  if (shape && shape.w < shape.h * 0.3) shape = await outline(facts.country.iso, 170, fh * 1.5);     // a long thin country (Chile) gets more height, or it reads as a line
  const gap = 40, rowH = Math.max(flagImg ? fh : 0, shape?.h ?? 0);
  const total = fw + (fw && shape ? gap : 0) + (shape?.w ?? 0);
  let x = CX - total / 2;
  if (flagImg) {
    const top = rowTop + (rowH - fh) / 2;
    page.drawImage(flagImg, { x, y: H - (top + fh), width: fw, height: fh });
    page.drawRectangle({ x, y: H - (top + fh), width: fw, height: fh, borderColor: RULE, borderWidth: 0.6 });
    x += fw + gap;
  }
  if (shape) {
    const d = shape.path(x, rowTop + (rowH - shape.h) / 2);
    if (flagImg) line(x - gap / 2, rowTop + 6, x - gap / 2, rowTop + rowH - 6, { color: RULE, t: 0.6 });
    page.drawSvgPath(d, { x: 0, y: H, borderColor: INK, borderWidth: 1.1 });
  }

  // ---- the name, the region and what the brief is
  let top = rowTop + rowH + 40;
  const { ls, s } = nameLines(CW - 24);
  ls.forEach((l, i) => text(l, CX, top + i * s * 1.08, { f: "serifB", size: s, color: NAVY, align: "c" }));
  top += ls.length * s * 1.08 + 8;
  text(facts.country.region, CX, top, { f: "mono", size: 7.4, color: MUTED, align: "c", track: 1.6 });
  top += 34;
  text(`Country brief. Coup-attempt outlook, ${month(fc.window[0])} to ${month(fc.window[1])}`, CX, top, { f: "serif", size: 13, color: INK, align: "c" });

  // ---- identifiers at the foot
  const mt = H - 112, cells = [["ISSUE", fc.issue], ["WINDOW", `${month(fc.window[0])} to ${month(fc.window[1])}`], ["DATA THROUGH", month(fc.data_through)], ["PREPARED FOR", lens]];
  line(X0, mt, X1, mt, { color: NAVY, t: 0.9 });
  cells.forEach(([l, v], i) => { const cx = X0 + (i * CW) / cells.length; text(l, cx, mt + 9, { f: "mono", size: 5.8, color: MUTED, track: 0.6 }); text(v, cx, mt + 20, { f: "sansB", size: 8.6, color: NAVY }); });
  line(X0, H - 58, X1, H - 58, { color: RULE, t: 0.5 });
  text(`Ref. PX-${fc.issue}-${facts.country.iso}`, X0, H - 46, { f: "mono", size: 5.8, color: MUTED });
  text("Model estimates from the Praevex forecast registry. Not investment advice.", X1, H - 46, { size: 6.2, color: MUTED, align: "r" });
}

// The country alone as an SVG path: { w, h, path(x, top) } with the outline fitted into a box of maxW x maxH (aspect kept), or null when the
// country has no outline in the atlas (small dependencies). Azimuthal equal-area centred on the country, so shapes are not stretched by latitude.
// Distant territories (Guiana for France, Hawaii for the United States) are left out, as are specks smaller than 0.4% of the main land.
async function outline(iso, maxW, maxH) {
  try {
    const [{ geoAzimuthalEqualArea, geoPath, geoCentroid, geoArea, geoDistance }, { feature }, topo] = await Promise.all([
      import("d3-geo"), import("topojson-client"), import("world-atlas/countries-50m.json").then((m) => m.default ?? m),
    ]);
    const all = feature(topo, topo.objects.countries).features;
    const me = String(iso) === "000" ? all.find((f) => f.properties.name === "Kosovo") : all.find((f) => f.id === String(iso).padStart(3, "0"));
    if (!me) return null;
    const polys = me.geometry.type === "MultiPolygon" ? me.geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates })) : [me.geometry];
    const big = polys.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a)), bc = geoCentroid(big);
    const main = { type: "MultiPolygon", coordinates: polys.filter((q) => geoArea(q) >= geoArea(big) * 0.004 && geoDistance(geoCentroid(q), bc) < 0.7).map((q) => q.coordinates) };
    const proj = geoAzimuthalEqualArea().rotate([-bc[0], -bc[1]]).precision(0.1).fitExtent([[0, 0], [maxW, maxH]], main);
    const gp = geoPath(proj).digits(1), [[bx0, by0], [bx1, by1]] = gp.bounds(main), [tx, ty] = proj.translate();
    return {
      w: bx1 - bx0, h: by1 - by0,
      path: (x, top) => { proj.translate([tx + x - bx0, ty + top - by0]); return gp(main); },
    };
  } catch (e) {
    console.error("cover outline failed", e?.message);
    return null;
  }
}
