"use client";

import { useEffect, useRef } from "react";
import { geoCentroid, geoEqualEarth, geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import topo from "world-atlas/countries-50m.json";

const GEOGRAPHY = feature(topo, topo.objects.countries);
const SHAPES = new Map(GEOGRAPHY.features.map((f) => [f.id, f]));
const TAU = Math.PI * 2;

export const CHANNELS = [
  { key: "unrest", name: "Protests & riots", short: "UNREST", color: "#f0a23a" },
  { key: "violence", name: "Political violence", short: "VIOLENCE", color: "#f4dfae" },
  { key: "fatalities", name: "Reported fatalities", short: "FATALITIES", color: "#b3a6f2" },
];

const INK = "#cfcabb", INK_2 = "#8d897d", INK_3 = "#5b584f", HOT = "#fff6dc";
const easeScene = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* ------------------------------------------------------------------ shaders
 * Every particle carries two target positions (field / atlas), so changing view is a morph of the
 * same matter rather than a swap. All motion is a function of time and a per-particle seed:
 * particles drift along coherent paths, they never jitter. */
const VERT = `
attribute vec2 aA; attribute vec2 aB; attribute vec4 aP; attribute float aK;
uniform vec2 uRes; uniform vec2 uCenter;
uniform float uDpr, uTime, uMix, uForm, uCursor, uAmb, uGlow, uMonths;
varying vec4 vCol;
float hash(float n){ return fract(sin(n * 127.1) * 43758.5453); }
vec3 ramp(float t){
  vec3 c0 = vec3(.34,.045,.03), c1 = vec3(.90,.27,.07), c2 = vec3(.96,.63,.12), c3 = vec3(.97,.90,.72), c4 = vec3(1.,1.,.98);
  t = clamp(t, 0., 1.);
  if (t < .30) return mix(c0, c1, t / .30);
  if (t < .58) return mix(c1, c2, (t - .30) / .28);
  if (t < .84) return mix(c2, c3, (t - .58) / .26);
  return mix(c3, c4, (t - .84) / .16);
}
void main(){
  float t = aP.x, heat = aP.y, disp = aP.z, seed = aP.w;
  float ph = seed * 6.2831853;
  float cls = hash(seed + 17.);
  vec2 p = mix(aA, aB, uMix);
  float lib = sin(3.14159265 * uMix);
  p += vec2(sin(ph * 14.6 + uTime * .37), cos(ph * 5.9 + uTime * .31)) * lib * (10. + 64. * hash(seed + 2.));
  vec2 dir = normalize(mix(vec2(0., -1.), normalize(aB - uCenter + vec2(.0001)), uMix));
  vec2 drift = vec2(sin(uTime * .19 + ph * 3.) + .6 * sin(uTime * .071 + ph * 7.),
                    cos(uTime * .16 + ph * 5.) + .6 * cos(uTime * .053 + ph * 11.));
  float alpha = 1.;
  if (aK < .5) {
    p += drift * (.4 + disp * 5.) * uAmb;
    p += dir * disp * disp * (3. + 4. * sin(uTime * .29 + ph)) * uAmb;
  } else if (aK < 1.5) {
    float life = fract(uTime * (.016 + .028 * hash(seed + 7.)) * uAmb + seed);
    p += drift * 2.6 * uAmb + dir * life * (8. + 44. * disp * hash(seed + 3.));
    alpha *= sin(3.14159265 * life);
  } else {
    p += drift * .3 * uAmb;
  }
  float delay = hash(seed + 11.) * .45;
  float f = smoothstep(delay, delay + .55, uForm);
  vec2 scatter = uRes * .5 + (vec2(hash(seed + 5.), hash(seed + 9.)) - .5) * uRes * vec2(1.25, 1.45);
  p = mix(scatter, p, f);
  alpha *= f;

  float dc = abs(t - uCursor) * uMonths;
  float cur = aK < 1.5 ? exp(-dc * dc / 1.15) : 0.;
  float wave = 1. + uAmb * (.11 * sin(t * 5.2 + uTime * .33) + .06 * sin(t * 13. - uTime * .21 + 1.7));
  float shim = 1. + uAmb * .10 * sin(uTime * (.6 + 1.9 * hash(seed + 13.)) + ph * 9.);

  vec3 col; float size; float a;
  if (aK < .5) {
    col = ramp(heat);
    size = cls < .70 ? .85 : (cls < .95 ? 1.35 : 2.1);
    a = (cls < .70 ? .26 : (cls < .95 ? .46 : .82)) * (.5 + .62 * heat);
  } else if (aK < 1.5) {
    col = mix(vec3(.83,.80,1.), vec3(.60,.54,.95), hash(seed + 19.));
    size = cls < .60 ? .95 : (cls < .92 ? 1.6 : 2.5);
    a = .5;
  } else if (aK < 2.5) {
    col = vec3(.80,.80,.76);
    size = cls < .80 ? .8 : 1.3;
    a = (.13 + .2 * cls) * mix(.5, 1., uMix);
  } else {
    col = vec3(.52,.2,.11); size = .9; a = .3;
  }
  col = mix(col, vec3(1.,.98,.92), cur * .6);
  a *= (1. + cur * 1.05) * wave * shim * alpha;
  size *= 1. + cur * .3;
  if (uGlow > .5) {
    if (cls < .9 || aK > 1.5) { gl_PointSize = 1.; gl_Position = vec4(2., 2., 2., 1.); vCol = vec4(0.); return; }
    size *= 9.; a *= .05 * (.35 + heat + cur * .35);
  }
  gl_PointSize = max(1.5, size * uDpr * 1.7);
  vec2 clip = p / uRes * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, 0., 1.);
  vCol = vec4(col * a, a);
}`;
const FRAG = `
precision mediump float; varying vec4 vCol;
void main(){ float r = length(gl_PointCoord - .5) * 2.; gl_FragColor = vCol * smoothstep(1., .12, r); }`;

function program(gl) {
  const make = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, make(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, make(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

/** Deterministic generator: the same country always renders the same cloud. */
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/**
 * Signal field. Real monthly observations drive a stacked profile (three signals, log-scaled);
 * particles only render that profile more densely. Scatter above the surface is proportional to
 * month-to-month change. Nothing here is forecast.
 */
export default function SignalField({ country, rows, events, index, onSelect, view, reduced, ambient, layers }) {
  const glRef = useRef(null), hudRef = useRef(null), wrapRef = useRef(null);
  const live = useRef({ index, onSelect, view, ambient });
  live.current = { index, onSelect, view, ambient };
  const memory = useRef({ iso: null, mix: view === "radial" ? 1 : 0 });

  useEffect(() => {
    const glc = glRef.current, hud = hudRef.current, ctx = hud.getContext("2d");
    const gl = glc.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    const M = rows.length;
    if (!ctx || !M) return;
    let prog = null, buffer = null, count = 0, loc = {};
    if (gl) { try { prog = program(gl); } catch { prog = null; } }

    const active = CHANNELS.map((c) => layers.includes(c.key));
    const maxima = CHANNELS.map((c) => Math.max(1, ...rows.map((r) => r[c.key])));
    const values = CHANNELS.map((c, j) => rows.map((r) => (active[j] ? Math.log1p(r[c.key]) / Math.log1p(maxima[j]) / 3 : 0)));
    // cumulative tops: tops[j][i] = height of the stack up to channel j in month i
    const tops = []; let acc = new Array(M).fill(0);
    for (let j = 0; j < CHANNELS.length; j++) { acc = acc.map((v, i) => v + values[j][i]); tops.push(acc); }
    const H = tops[CHANNELS.length - 1];
    const Hmax = Math.max(0.02, ...H);
    const vol = H.map((_, i) => Math.abs(H[Math.min(M - 1, i + 1)] - H[Math.max(0, i - 1)]));
    const volMax = Math.max(0.001, ...vol);
    const at = (arr, u) => { // smooth value at fractional month
      const x = Math.max(0, Math.min(M - 1, u - 0.5)), i = Math.floor(x), k = x - i, s = k * k * (3 - 2 * k);
      return arr[i] * (1 - s) + arr[Math.min(M - 1, i + 1)] * s;
    };
    const monthEvents = new Map();
    for (const e of events) { const d = e.date.slice(0, 7); if (!monthEvents.has(d)) monthEvents.set(d, []); monthEvents.get(d).push(e); }
    const shape = SHAPES.get(String(country.iso));

    let w = 1, h = 1, dpr = 1, frame = 0, last = 0, elapsed = 0, visible = true, dirty = true;
    let pointer = null, G = null, lite = false, slow = 0, frames = 0;
    const sameCountry = memory.current.iso === country.iso;
    memory.current.iso = country.iso;
    const st = { mix: memory.current.mix, mixFrom: memory.current.mix, mixTo: memory.current.mix, mixT: 1,
                 form: reduced ? 1 : sameCountry ? 0.5 : 0, cursor: live.current.index };

    function geometry() {
      const narrow = w < 620;
      const left = narrow ? 30 : 58, right = w - (narrow ? 18 : 44), base = h - (narrow ? 62 : 74), top = narrow ? 64 : 74;
      const R1 = Math.min(w * 0.44, h * 0.42), R0 = R1 * 0.5;
      return { left, right, base, top, plotW: right - left, plotH: (base - top) * 0.8, cx: w * 0.5, cy: h * 0.5, R0, R1, narrow };
    }
    const fieldXY = (u, s) => [G.left + (u / M) * G.plotW, G.base - (s / Hmax) * G.plotH];
    const radialXY = (u, s) => { const a = (u / M) * TAU - Math.PI / 2, r = G.R0 + (s / Hmax) * (G.R1 - G.R0) * 0.8;
      return [G.cx + Math.cos(a) * r, G.cy + Math.sin(a) * r]; };

    function build() {
      G = geometry();
      if (!gl || !prog) return;
      const rand = rng(Number(country.iso) * 7919 + M * 31 + active.reduce((n, a, i) => n + (a ? 1 << i : 0), 0));
      const budget = Math.round(Math.max(26000, Math.min(120000, (w * h) / 8)));
      const cells = M * 6, cdf = new Float32Array(cells), cdfDust = new Float32Array(cells);
      let total = 0, totalDust = 0;
      for (let c = 0; c < cells; c++) {
        const u = (c + 0.5) / 6, hh = at(H, u), vv = at(vol, u) / volMax;
        total += hh; cdf[c] = total;
        totalDust += hh * (0.12 + vv) * (0.3 + hh / Hmax); cdfDust[c] = totalDust;
      }
      const pick = (table, sum) => { const x = rand() * sum; let lo = 0, hi = cells - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (table[mid] < x) lo = mid + 1; else hi = mid; } return (lo + rand()) / 6; };
      const out = [];
      const push = (a, b, t, heat, disp, kind) => out.push(a[0], a[1], b[0], b[1], t, heat, disp, rand(), kind);
      if (total > 0) {
        for (let n = 0; n < budget; n++) {
          const u = pick(cdf, total), topH = at(H, u), s = topH * Math.pow(rand(), 0.88), edge = topH > 0 ? s / topH : 0;
          const disp = Math.pow(edge, 3) * (0.12 + 0.88 * (at(vol, u) / volMax)) * (0.3 + 0.7 * (topH / Hmax));
          push(fieldXY(u, s), radialXY(u, s), u / M, s / Hmax, disp, 0);
        }
        for (let n = 0; n < budget * 0.09; n++) {
          const u = pick(cdfDust, totalDust), topH = at(H, u), vv = at(vol, u) / volMax;
          const s = topH * (1 + -Math.log(1 - rand() * 0.98) * (0.05 + 0.3 * vv));
          push(fieldXY(u, s), radialXY(u, s), u / M, 1, 0.25 + 0.75 * vv, 1);
        }
      }
      for (let x = 0; x < G.plotW; x += 2.4) { const u = (x / G.plotW) * M; push(fieldXY(u, 0), radialXY(u, 0), u / M, 0, 0, 3); }
      if (shape) { // the territory as a point cloud: context, not event locations
        const boxB = [[G.cx - G.R0 * 0.72, G.cy - G.R0 * 0.62], [G.cx + G.R0 * 0.72, G.cy + G.R0 * 0.56]];
        const path = geoPath(geoMercator().fitExtent(boxB, shape)), outline = new Path2D(path(shape)), b = path.bounds(shape);
        const bw = Math.max(1, b[1][0] - b[0][0]), bh = Math.max(1, b[1][1] - b[0][1]);
        const boxA = { x: G.left + 6, y: G.top - 4, s: Math.min((G.narrow ? 70 : 132) / bw, (G.narrow ? 52 : 92) / bh) };
        const step = Math.max(1.5, Math.sqrt((bw * bh) / 11000));
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (let y = b[0][1]; y < b[1][1]; y += step) for (let x = b[0][0]; x < b[1][0]; x += step) {
          const px = x + (rand() - 0.5) * step, py = y + (rand() - 0.5) * step;
          if (ctx.isPointInPath(outline, px, py)) push([boxA.x + (px - b[0][0]) * boxA.s, boxA.y + (py - b[0][1]) * boxA.s], [px, py], 0, 0, 0, 2);
        }
        ctx.restore();
        G.outline = { b, boxA, bw, bh };
      }
      const data = new Float32Array(out);
      count = data.length / 9;
      if (!buffer) buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.useProgram(prog);
      const F = Float32Array.BYTES_PER_ELEMENT, stride = 9 * F;
      [["aA", 2, 0], ["aB", 2, 2], ["aP", 4, 4], ["aK", 1, 8]].forEach(([name, size, off]) => {
        const l = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride, off * F); });
      for (const u of ["uRes", "uCenter", "uDpr", "uTime", "uMix", "uForm", "uCursor", "uAmb", "uGlow", "uMonths"]) loc[u] = gl.getUniformLocation(prog, u);
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    }

    function render() {
      if (!gl || !prog || !count) return;
      gl.viewport(0, 0, glc.width, glc.height);
      gl.clearColor(0.016, 0.016, 0.02, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(loc.uRes, w, h); gl.uniform2f(loc.uCenter, G.cx, G.cy); gl.uniform1f(loc.uDpr, lite ? 1 : dpr);
      gl.uniform1f(loc.uTime, elapsed); gl.uniform1f(loc.uMix, easeScene(st.mix)); gl.uniform1f(loc.uForm, st.form);
      gl.uniform1f(loc.uCursor, (st.cursor + 0.5) / M); gl.uniform1f(loc.uMonths, M);
      gl.uniform1f(loc.uAmb, live.current.ambient && !reduced ? 1 : 0);
      gl.uniform1f(loc.uGlow, 1); gl.drawArrays(gl.POINTS, 0, count);   // light accumulation
      gl.uniform1f(loc.uGlow, 0); gl.drawArrays(gl.POINTS, 0, count);   // sharp particles
    }

    // ------------------------------------------------------------------ annotations (2D, crisp)
    const text = (s, x, y, color = INK_2, size = 8, align = "left") => {
      ctx.fillStyle = color; ctx.font = `${size}px "JetBrains Mono", "IBM Plex Mono", monospace`; ctx.textAlign = align; ctx.fillText(s, x, y); ctx.textAlign = "left"; };
    const seg = (pts, color, width = 0.6, alpha = 1, dash) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha *= alpha; if (dash) ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha /= alpha || 1; };
    const diamond = (x, y, filled) => { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = filled ? HOT : "#050506";
      ctx.fillRect(-2.6, -2.6, 5.2, 5.2); ctx.strokeStyle = HOT; ctx.lineWidth = 0.8; ctx.strokeRect(-2.6, -2.6, 5.2, 5.2); ctx.restore(); };
    const stepYears = M > 132 ? 3 : M > 72 ? 2 : 1;

    function hudField(k, sel) {
      if (k <= 0.01) return; ctx.globalAlpha = k;
      seg([[G.left, G.base + 0.5], [G.right, G.base + 0.5]], INK_3, 0.6);
      rows.forEach((r, i) => { if (!r.date.endsWith("-01")) return; const x = G.left + (i / M) * G.plotW, y = Number(r.date.slice(0, 4));
        seg([[x, G.base], [x, G.base + (y % stepYears ? 3 : 6)]], INK_3, 0.6); if (y % stepYears === 0) text(String(y), x, G.base + 17, INK_2, 7, "center"); });
      let lastY = G.base + 8;                                  // band labels never overlap: stacked upward
      CHANNELS.forEach((ch, j) => { if (!active[j]) return;
        seg(tops[j].map((v, i) => fieldXY(i + 0.5, v)), "#f4ecd2", 0.5, 0.2);
        const [, y] = fieldXY(M - 0.5, tops[j][M - 1]); lastY = Math.min(y + 2, lastY - 9);
        if (!G.narrow) text(ch.short.slice(0, 3), G.right + 6, lastY, ch.color, 6.5); });
      seg([[G.left - 8, G.base], [G.left - 8, G.base - G.plotH]], INK_3, 0.5);
      text("0", G.left - 13, G.base + 3, INK_3, 7, "right"); text("MAX", G.left - 13, G.base - G.plotH + 3, INK_3, 6.5, "right");
      rows.forEach((r, i) => { const ev = monthEvents.get(r.date); if (!ev) return; const [x] = fieldXY(i + 0.5, 0), [, yTop] = fieldXY(i + 0.5, H[i]);
        seg([[x, G.base + 20], [x, yTop - 10]], HOT, 0.5, 0.32, [1.5, 3]); diamond(x, G.base + 27, ev.some((e) => e.type === "riuscito")); });
      const [cx0, cyTop] = fieldXY(sel + 0.5, at(H, sel + 0.5));
      seg([[cx0, G.base], [cx0, Math.min(cyTop - 16, G.base - 26)]], HOT, 0.7, 0.85);
      if (G.outline && !G.narrow) text(country.name.toUpperCase(), G.outline.boxA.x, G.outline.boxA.y + G.outline.bh * G.outline.boxA.s + 13, INK_3, 6.5);
      text(G.narrow ? "MONTH × STACKED LOG INTENSITY" : "X / MONTH   Y / STACKED LOG INTENSITY   SCATTER / MONTH-TO-MONTH CHANGE", 18, h - 16, INK_3, G.narrow ? 6 : 7);
      ctx.globalAlpha = 1;
    }
    function hudRadial(k, sel) {
      if (k <= 0.01) return; ctx.globalAlpha = k;
      const ring = (r, c, wd = 0.5) => { ctx.beginPath(); ctx.arc(G.cx, G.cy, r, 0, TAU); ctx.strokeStyle = c; ctx.lineWidth = wd; ctx.stroke(); };
      ring(G.R0, INK_3, 0.6); ring(G.R0 + (G.R1 - G.R0) * 0.8, "#2a2924"); ring(G.R1 * 1.05, "#1f1e1b");
      rows.forEach((r, i) => { const a = (i / M) * TAU - Math.PI / 2, yr = r.date.endsWith("-01"), y = Number(r.date.slice(0, 4));
        const p = (rr) => [G.cx + Math.cos(a) * rr, G.cy + Math.sin(a) * rr];
        seg([p(G.R1 * 1.05), p(G.R1 * (yr ? 1.085 : 1.062))], yr ? INK_2 : INK_3, yr ? 0.7 : 0.4);
        if (yr && y % stepYears === 0) { const q = p(G.R1 * 1.14); text(String(y), q[0], q[1] + 3, INK_2, 7, "center"); }
        const ev = monthEvents.get(r.date); if (ev) { const am = ((i + 0.5) / M) * TAU - Math.PI / 2, q = [G.cx + Math.cos(am) * (G.R0 - 9), G.cy + Math.sin(am) * (G.R0 - 9)];
          seg([q, [G.cx + Math.cos(am) * G.R1, G.cy + Math.sin(am) * G.R1]], HOT, 0.5, 0.28, [1.5, 3]); diamond(q[0], q[1], ev.some((e) => e.type === "riuscito")); } });
      const a = ((sel + 0.5) / M) * TAU - Math.PI / 2;
      seg([[G.cx + Math.cos(a) * G.R0, G.cy + Math.sin(a) * G.R0], [G.cx + Math.cos(a) * G.R1 * 1.05, G.cy + Math.sin(a) * G.R1 * 1.05]], HOT, 0.7, 0.85);
      text(country.name.toUpperCase(), G.cx, G.cy + G.R0 * 0.72, INK, G.narrow ? 7 : 9, "center");
      if (shape) { const c = geoCentroid(shape); text(`${Math.abs(c[1]).toFixed(2)}°${c[1] >= 0 ? "N" : "S"}  ${Math.abs(c[0]).toFixed(2)}°${c[0] >= 0 ? "E" : "W"}`, G.cx, G.cy + G.R0 * 0.72 + 12, INK_3, 6.5, "center"); }
      text(G.narrow ? "ANGLE / MONTH · RADIUS / INTENSITY" : "ANGLE / MONTH   RADIUS / STACKED LOG INTENSITY   CENTRE / TERRITORY (CONTEXT)", 18, h - 16, INK_3, G.narrow ? 6 : 7);
      ctx.globalAlpha = 1;
    }
    function locate(x, y) {
      if (st.mix > 0.5) { const d = Math.hypot(x - G.cx, y - G.cy); if (d < G.R0 * 0.85 || d > G.R1 * 1.2) return null;
        return Math.floor((((Math.atan2(y - G.cy, x - G.cx) + Math.PI / 2 + TAU) % TAU) / TAU) * M) % M; }
      if (x < G.left - 4 || x > G.right + 4 || y < G.top - 20 || y > G.base + 34) return null;
      return Math.max(0, Math.min(M - 1, Math.floor(((x - G.left) / G.plotW) * M)));
    }
    function drawHud() {
      ctx.clearRect(0, 0, w, h);
      const m = easeScene(st.mix), sel = st.cursor, i = Math.max(0, Math.min(M - 1, live.current.index));
      hudField((1 - m) * st.form, sel); hudRadial(m * st.form, sel);
      for (const [x, y, sx, sy] of [[8, 8, 1, 1], [w - 8, 8, -1, 1], [8, h - 8, 1, -1], [w - 8, h - 8, -1, -1]]) seg([[x, y + sy * 10], [x, y], [x + sx * 10, y]], INK_3, 0.7);
      text(m > 0.5 ? "TEMPORAL ATLAS / SAME MATTER, POLAR" : "SIGNAL FIELD / COMPOSITE OF THREE SIGNALS", 18, 22, INK_2, 7.5);
      text(`${String(i + 1).padStart(3, "0")} / ${M}   ${rows[i].date}`, w - 18, 22, INK, 8, "right");
      if (!gl || !prog) text("WEBGL UNAVAILABLE — VALUES REMAIN IN THE READOUTS", w / 2, h / 2, INK_2, 9, "center");
      if (pointer) {
        const hit = locate(pointer.x, pointer.y);
        seg([[pointer.x - 5, pointer.y], [pointer.x + 5, pointer.y]], INK, 0.6); seg([[pointer.x, pointer.y - 5], [pointer.x, pointer.y + 5]], INK, 0.6);
        if (hit != null) { const r = rows[hit], right = pointer.x > w - 170, x = pointer.x + (right ? -12 : 12), y = Math.max(40, pointer.y - 10), al = right ? "right" : "left";
          text(r.date, x, y, HOT, 8, al); CHANNELS.forEach((ch, j) => text(`${ch.short.slice(0, 3)} ${r[ch.key].toLocaleString("en-GB")}`, x, y + 11 * (j + 1), ch.color, 7, al)); }
      }
    }

    // ------------------------------------------------------------------ clock
    function tick(now) {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
      if (!visible || document.hidden || !G) return;
      const moving = live.current.ambient && !reduced;
      let animating = false;
      const target = live.current.view === "radial" ? 1 : 0;
      if (target !== st.mixTo) { st.mixFrom = st.mix; st.mixTo = target; st.mixT = 0; }
      if (st.mixT < 1) { st.mixT = reduced ? 1 : Math.min(1, st.mixT + dt / 1.15); st.mix = st.mixFrom + (st.mixTo - st.mixFrom) * st.mixT; memory.current.mix = st.mixTo; animating = true; }
      if (st.form < 1) { st.form = reduced ? 1 : Math.min(1, st.form + dt / 1.05); animating = true; }
      const goal = Math.max(0, Math.min(M - 1, live.current.index)), gap = goal - st.cursor;
      if (Math.abs(gap) > 0.002) { st.cursor = reduced ? goal : st.cursor + gap * (1 - Math.exp(-dt * 7.5)); animating = true; } else st.cursor = goal;
      if (moving) elapsed += dt;
      if (moving && !lite && dpr > 1 && ++frames > 30) { if (dt > 0.03) slow++; if (frames > 150) { if (slow > 60) { lite = true; size(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); dirty = true; } frames = 31; slow = 0; } }
      if (moving || animating || dirty) render();
      if (animating || dirty) { drawHud(); dirty = false; }
    }
    const formEase = st.form; st.form = formEase; // formation starts from the remembered state
    const resize = new ResizeObserver(([e]) => {
      w = Math.max(1, e.contentRect.width); h = Math.max(1, e.contentRect.height); dpr = Math.min(window.devicePixelRatio || 1, 2);
      size();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); build(); dirty = true;
    });
    // On slow GPUs the particle layer drops to 1x resolution; annotations stay sharp.
    function size() { const g = lite ? 1 : dpr; glc.width = Math.round(w * g); glc.height = Math.round(h * g); hud.width = Math.round(w * dpr); hud.height = Math.round(h * dpr); }
    const seen = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { last = 0; dirty = true; } });
    const move = (e) => { const b = hud.getBoundingClientRect(); pointer = { x: e.clientX - b.left, y: e.clientY - b.top }; dirty = true; };
    const leave = () => { pointer = null; dirty = true; };
    const click = (e) => { const b = hud.getBoundingClientRect(), i = locate(e.clientX - b.left, e.clientY - b.top); if (i != null) live.current.onSelect(i); };
    hud.addEventListener("pointermove", move); hud.addEventListener("pointerleave", leave); hud.addEventListener("click", click);
    resize.observe(wrapRef.current); seen.observe(wrapRef.current); frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); seen.disconnect();
      hud.removeEventListener("pointermove", move); hud.removeEventListener("pointerleave", leave); hud.removeEventListener("click", click);
      if (gl) { if (buffer) gl.deleteBuffer(buffer); if (prog) gl.deleteProgram(prog); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country.iso, country.name, rows, events, reduced, layers.join("|")]);

  return (
    <div ref={wrapRef} className="fx-stage" role="img"
         aria-label={`${country.name}: monthly protests, political violence and fatalities as a stacked field. Exact counts are in the adjacent readouts.`}>
      <canvas ref={glRef} className="fx-gl" aria-hidden="true" />
      <canvas ref={hudRef} className="fx-hud" aria-hidden="true" />
    </div>
  );
}

export function GeoLocator({ iso }) {
  const p = geoEqualEarth().fitExtent([[4, 4], [176, 88]], GEOGRAPHY), path = geoPath(p), shape = SHAPES.get(String(iso)), center = shape ? p(geoCentroid(shape)) : null;
  return (
    <svg viewBox="0 0 180 92" role="img" aria-label="Selected country in world context">
      <path d={path(GEOGRAPHY)} fill="#17171a" stroke="#34332f" strokeWidth=".25" />
      {shape && <path d={path(shape)} fill="#f4dfae" />}
      {center && <g><circle cx={center[0]} cy={center[1]} r="5" fill="none" stroke="#f4dfae" strokeWidth=".5" />
        <path d={`M${center[0] - 10},${center[1]}h20M${center[0]},${center[1] - 10}v20`} fill="none" stroke="#f4dfae" strokeWidth=".5" /></g>}
    </svg>
  );
}
