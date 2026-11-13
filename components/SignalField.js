"use client";

import { useEffect, useRef } from "react";
import { geoCentroid, geoEqualEarth, geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import topo from "world-atlas/countries-50m.json";

const GEOGRAPHY = feature(topo, topo.objects.countries);
const SHAPES = new Map(GEOGRAPHY.features.map((f) => [f.id, f]));
const TAU = Math.PI * 2;

export const CHANNELS = [
  { key: "unrest", name: "Protests & riots", short: "UNREST", color: "#d67c42" },
  { key: "violence", name: "Political violence", short: "VIOLENCE", color: "#e9d9a2" },
  { key: "fatalities", name: "Reported fatalities", short: "FATALITIES", color: "#b6acd9" },
];

const INK = "#cdc8ba", INK_2 = "#87837a", INK_3 = "#55524b", HOT = "#f4eedd";
const STRIDE = 11; // aA(2) aB(2) aP(4: t, heat, disp, seed) aQ(3: kind, depth, edge)
const easeScene = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ------------------------------------------------------------------ shaders
 * Pipeline: particles (sharp) -> framebuffer -> blurred light layer -> composite with grain and vignette.
 * Each particle has two target positions (field / atlas) and a depth, so the view change is a morph of
 * the same matter and a slow change of viewpoint gives it volume. Motion is a function of time and a
 * fixed per-particle seed: particles drift, they never jitter. */
const VERT = `
attribute vec2 aA; attribute vec2 aB; attribute vec4 aP; attribute vec3 aQ;
uniform vec2 uRes, uCenter, uPar;
uniform float uDpr, uTime, uMix, uForm, uCursor, uAmb, uMonths, uFade;
varying vec4 vCol; varying float vSharp;
float hash(float n){ return fract(sin(n * 127.1) * 43758.5453); }
vec3 ramp(float t){
  vec3 c0 = vec3(.20,.085,.06), c1 = vec3(.66,.24,.12), c2 = vec3(.85,.47,.22), c3 = vec3(.92,.72,.36),
       c4 = vec3(.93,.86,.64), c5 = vec3(.93,.90,.84);
  t = clamp(t, 0., 1.);
  if (t < .16) return mix(c0, c1, t / .16);
  if (t < .40) return mix(c1, c2, (t - .16) / .24);
  if (t < .62) return mix(c2, c3, (t - .40) / .22);
  if (t < .82) return mix(c3, c4, (t - .62) / .20);
  return mix(c4, c5, (t - .82) / .18);
}
void main(){
  float t = aP.x, heat = aP.y, disp = aP.z, seed = aP.w;
  float kind = aQ.x, depth = aQ.y, edge = aQ.z;
  float ph = seed * 6.2831853, cls = hash(seed + 17.);
  vec2 p = mix(aA, aB, uMix);
  float lib = sin(3.14159265 * uMix);                                   // matter loosens mid-morph
  p += vec2(sin(ph * 14.6 + uTime * .37), cos(ph * 5.9 + uTime * .31)) * lib * (8. + 58. * hash(seed + 2.));
  vec2 dir = normalize(mix(vec2(0., -1.), normalize(aB - uCenter + vec2(.0001)), uMix));
  vec2 drift = vec2(sin(uTime * .19 + ph * 3.) + .6 * sin(uTime * .071 + ph * 7.),
                    cos(uTime * .16 + ph * 5.) + .6 * cos(uTime * .053 + ph * 11.));
  float alpha = 1.;
  if (kind < .5) {
    p += drift * (.22 + disp * 3.4) * uAmb + dir * disp * disp * (2. + 3. * sin(uTime * .29 + ph)) * uAmb;
  } else if (kind < 1.5) {
    float life = fract(uTime * (.012 + .02 * hash(seed + 7.)) * uAmb + seed);
    p += drift * 1.6 * uAmb + dir * (life - .35) * (3. + 9. * hash(seed + 3.));
    alpha *= .35 + .65 * sin(3.14159265 * life);
  } else {
    p += drift * .25 * uAmb;
  }
  p += uPar * depth * (kind > 2.5 ? .4 : 1.);                           // change of viewpoint: depth reads as volume
  float delay = hash(seed + 11.) * .45;
  float f = smoothstep(delay, delay + .55, uForm);
  vec2 away = (vec2(hash(seed + 5.), hash(seed + 9.)) - .5);
  p = mix(p + away * (60. + 240. * hash(seed + 23.)) + dir * 40., p, f);  // cohesion is lost and regained locally
  alpha *= f * uFade;

  float dc = abs(t - uCursor) * uMonths;
  float cur = kind < 1.5 ? exp(-dc * dc / 1.3) : 0.;
  float wave = 1. + uAmb * (.10 * sin(t * 4.6 + uTime * .29) + .05 * sin(t * 12. - uTime * .19 + 1.7));
  float shim = 1. + uAmb * .09 * sin(uTime * (.5 + 1.7 * hash(seed + 13.)) + ph * 9.);
  float near = depth * .5 + .5;

  vec3 col; float size; float a; float sharp = .25;
  if (kind < .5) {
    col = ramp(mix(heat, floor(heat * 7.) / 7. + .07, .5));              // banded colour scale: strata of equal height
    float top = clamp(heat / max(edge, .06), 0., 1.);                   // how tall this column is
    col = mix(col, vec3(.72,.68,.87), smoothstep(.80, 1., edge) * smoothstep(.35, .9, top) * .85);
    size = cls < .70 ? .62 : (cls < .95 ? 1.1 : 1.75);
    a = (cls < .70 ? .36 : (cls < .95 ? .54 : .9)) * (.5 + .62 * heat);
  } else if (kind < 1.5) {
    float far = clamp(disp, 0., 1.);                                    // 0 at the surface, 1 at the observed value
    col = mix(vec3(.66,.61,.86), vec3(.95,.94,.92), step(.93, cls) * (.4 + .6 * far));
    size = cls < .62 ? .55 : (cls < .93 ? .9 : 1.55);
    a = (cls < .93 ? .30 : .85) * mix(1., .55, far); sharp = cls < .93 ? .3 : .78;
  } else if (kind < 2.5) {
    col = vec3(.80,.79,.75); size = cls < .82 ? .62 : 1.15; a = (.12 + .2 * cls) * smoothstep(.25, 1., uMix);
  } else {
    col = vec3(.34,.15,.10); size = .7; a = .4;
  }
  size *= mix(.74, 1.3, near); a *= mix(.62, 1.12, near);
  col = mix(col, vec3(.98,.96,.90), cur * .55);
  a *= (1. + cur * .9) * wave * shim * alpha;
  gl_PointSize = max(1.2, size * uDpr * 2.);
  vec2 clip = p / uRes * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, 0., 1.);
  vCol = vec4(col * a, a); vSharp = sharp;
}`;
const FRAG = `
precision mediump float; varying vec4 vCol; varying float vSharp;
void main(){ float r = length(gl_PointCoord - .5) * 2.; gl_FragColor = vCol * smoothstep(1., mix(.08, .82, vSharp), r); }`;
const QUAD = `attribute vec2 aXY; varying vec2 vUV; void main(){ vUV = aXY * .5 + .5; gl_Position = vec4(aXY, 0., 1.); }`;
const BLUR = `
precision mediump float; varying vec2 vUV; uniform sampler2D uTex; uniform vec2 uStep; uniform float uKnee;
vec3 pick(vec2 uv){ vec3 c = texture2D(uTex, uv).rgb; float l = dot(c, vec3(.3,.5,.2)); return c * mix(1., smoothstep(.10, .75, l), uKnee); }
void main(){
  vec3 c = pick(vUV) * .227;
  c += (pick(vUV + uStep * 1.385) + pick(vUV - uStep * 1.385)) * .316;
  c += (pick(vUV + uStep * 3.231) + pick(vUV - uStep * 3.231)) * .070;
  gl_FragColor = vec4(c, 1.);
}`;
const COMPOSE = `
precision mediump float; varying vec2 vUV; uniform sampler2D uScene, uLight; uniform float uTime, uBloom;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 c = texture2D(uScene, vUV).rgb + texture2D(uLight, vUV).rgb * uBloom;
  c = 1. - exp(-c * 1.35);                                            // soft shoulder: dense cores approach white without clipping
  vec2 q = vUV - .5; c *= 1. - .34 * smoothstep(.35, .95, length(q * vec2(1.05, 1.25)));
  c *= 1. - .022 * step(.5, fract(gl_FragCoord.y / 3.));              // faint scan structure
  c += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - .5) * .034;     // grain
  gl_FragColor = vec4(c + vec3(.013, .013, .016), 1.);
}`;

function compile(gl, vs, fs) {
  const make = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, make(gl.VERTEX_SHADER, vs)); gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}
function target(gl, w, h) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}
function engine(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;
  try {
    const e = { gl, points: compile(gl, VERT, FRAG), blur: compile(gl, QUAD, BLUR), compose: compile(gl, QUAD, COMPOSE), targets: null, ghost: null };
    e.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, e.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    return e;
  } catch (err) { console.error("SignalField shaders:", err); return null; }
}

/** Deterministic generator: the same country always renders the same cloud. */
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function smooth(arr, sigma) {
  const r = Math.ceil(sigma * 3), k = []; let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
  return arr.map((_, i) => { let acc = 0; for (let j = -r; j <= r; j++) acc += arr[Math.max(0, Math.min(arr.length - 1, i + j))] * k[j + r]; return acc / sum; });
}

/**
 * Signal field. Three real monthly signals (log-scaled) are stacked into one surface. The compact body
 * follows their trend; plumes above it rise to the value actually observed in each month. Particles
 * render that geometry densely and add no observations. Nothing here is forecast.
 */
export default function SignalField({ country, rows, events, index, onSelect, view, reduced, ambient, layers, playing = false, speed = 600 }) {
  const glRef = useRef(null), hudRef = useRef(null), wrapRef = useRef(null), eng = useRef(null);
  const live = useRef({});
  live.current = { index, onSelect, view, ambient, playing, speed };
  const memory = useRef({ iso: null, mix: view === "radial" ? 1 : 0 });

  useEffect(() => {
    const glc = glRef.current, hud = hudRef.current, ctx = hud.getContext("2d");
    const M = rows.length;
    if (!ctx || !M) return;
    if (eng.current === null) eng.current = engine(glc) || false;
    const E = eng.current, gl = E ? E.gl : null;

    // ---------------------------------------------------------------- data -> geometry
    const active = CHANNELS.map((c) => layers.includes(c.key));
    const maxima = CHANNELS.map((c) => Math.max(1, ...rows.map((r) => r[c.key])));
    const raw = CHANNELS.map((c, j) => rows.map((r) => (active[j] ? Math.log1p(r[c.key]) / Math.log1p(maxima[j]) / 3 : 0)));
    const sigma = Math.max(1.3, M / 72);
    const trend = raw.map((a) => smooth(a, sigma));
    const tops = []; let acc = new Array(M).fill(0);
    for (let j = 0; j < CHANNELS.length; j++) { acc = acc.map((v, i) => v + trend[j][i]); tops.push(acc); }
    const H = tops[CHANNELS.length - 1];                                       // trend surface
    const R = rows.map((_, i) => raw.reduce((n, a) => n + a[i], 0));           // observed monthly stack
    const Hmax = Math.max(0.02, ...H);
    const over = R.map((v, i) => Math.max(0, v - H[i]));                       // observation above trend -> plume
    const overMax = Math.max(0.001, ...over);
    const at = (arr, u) => { const x = Math.max(0, Math.min(M - 1, u - 0.5)), i = Math.floor(x), k = x - i, s = k * k * (3 - 2 * k);
      return arr[i] * (1 - s) + arr[Math.min(M - 1, i + 1)] * s; };
    const monthEvents = new Map();
    for (const e of events) { const d = e.date.slice(0, 7); if (!monthEvents.has(d)) monthEvents.set(d, []); monthEvents.get(d).push(e); }
    const shape = SHAPES.get(String(country.iso));

    let w = 1, h = 1, dpr = 1, frame = 0, last = 0, elapsed = 0, visible = true, dirty = true;
    let pointer = null, G = null, lite = false, slow = 0, frames = 0, buffer = null, count = 0;
    const sameCountry = memory.current.iso === country.iso;
    memory.current.iso = country.iso;
    const st = { mix: memory.current.mix, mixFrom: memory.current.mix, mixTo: memory.current.mix, mixT: 1,
                 form: reduced ? 1 : sameCountry ? 0.55 : 0, cursor: Math.max(0, Math.min(M - 1, live.current.index)) };
    if (E && E.ghost) E.ghost.t = sameCountry ? 0.2 : 0.55;                     // previous field decays as this one forms

    function geometry() {
      const narrow = w < 620;
      const left = narrow ? 26 : 46, right = w - (narrow ? 26 : 52), base = h - (narrow ? 56 : 62), top = narrow ? 58 : 66;
      const R1 = Math.min(w * 0.45, h * 0.43), R0 = R1 * 0.5;
      return { left, right, base, top, plotW: right - left, plotH: (base - top) * 0.74, cx: w * 0.5, cy: h * 0.5, R0, R1, narrow };
    }
    const fieldXY = (u, s) => [G.left + (u / M) * G.plotW, G.base - (s / Hmax) * G.plotH];
    const radialXY = (u, s) => { const a = (u / M) * TAU - Math.PI / 2, r = G.R0 + (s / Hmax) * (G.R1 - G.R0) * 0.74;
      return [G.cx + Math.cos(a) * r, G.cy + Math.sin(a) * r]; };
    const ceil = () => Hmax * 1.3;                                              // plumes are clipped just above the frame of the plot

    function build() {
      G = geometry();
      if (!gl) return;
      const rand = rng(Number(country.iso) * 7919 + M * 31 + active.reduce((n, a, i) => n + (a ? 1 << i : 0), 0));
      const budget = Math.round(Math.max(40000, Math.min(lite ? 80000 : 230000, (w * h) / 3.4)));
      const cells = M * 6, cdf = new Float32Array(cells), cdfDust = new Float32Array(cells);
      let total = 0, totalDust = 0;
      for (let c = 0; c < cells; c++) { const u = (c + 0.5) / 6, hh = at(H, u);
        total += hh; cdf[c] = total; totalDust += 0.03 * hh + at(over, u); cdfDust[c] = totalDust; }
      const pick = (table, sum) => { const x = rand() * sum; let lo = 0, hi = cells - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (table[mid] < x) lo = mid + 1; else hi = mid; } return (lo + rand()) / 6; };
      const data = new Float32Array(Math.ceil(budget * 1.2 + G.plotW + 16000) * STRIDE); let n = 0;
      const push = (a, b, t, heat, disp, kind, depth, edge) => { if (n + STRIDE > data.length) return;
        data[n++] = a[0]; data[n++] = a[1]; data[n++] = b[0]; data[n++] = b[1]; data[n++] = t; data[n++] = heat; data[n++] = disp; data[n++] = rand();
        data[n++] = kind; data[n++] = depth; data[n++] = edge; };
      const colStep = (3 / G.plotW) * M;                                        // fine vertical striation of the body
      if (total > 0) {
        for (let i = 0; i < budget; i++) {
          let u = pick(cdf, total); if (rand() < 0.5) u = Math.round(u / colStep) * colStep + (rand() - 0.5) * colStep * 0.18;
          u = Math.max(0, Math.min(M, u));
          const topH = at(H, u), s = topH * Math.pow(rand(), 0.8), edge = topH > 0 ? s / topH : 0, ov = at(over, u) / overMax;
          push(fieldXY(u, s), radialXY(u, s), u / M, s / Hmax, Math.pow(edge, 4) * (0.1 + 0.9 * ov), 0, rand() * 2 - 1, edge);
        }
        const plume = Math.round(budget * Math.min(0.11, 0.45 * totalDust / total));
        for (let i = 0; i < plume; i++) {                                       // plume: between the trend and the observed month
          const u = pick(cdfDust, totalDust), topH = at(H, u), reach = at(over, u) + topH * 0.03, k = Math.pow(rand(), 2.2);
          const s = Math.min(ceil(), topH + reach * k * 1.02);
          push(fieldXY(u, s), radialXY(u, s), u / M, 1, k, 1, rand() * 2 - 1, 1);
        }
      }
      for (let x = 0; x < G.plotW; x += 2.2) { const u = (x / G.plotW) * M; push(fieldXY(u, 0), radialXY(u, 0), u / M, 0, 0, 3, 0, 0); }
      if (shape) {                                                              // the territory as a point cloud: context, not event locations
        const boxB = [[G.cx - G.R0 * 0.72, G.cy - G.R0 * 0.62], [G.cx + G.R0 * 0.72, G.cy + G.R0 * 0.56]];
        const path = geoPath(geoMercator().fitExtent(boxB, shape)), outline = new Path2D(path(shape)), b = path.bounds(shape);
        const bw = Math.max(1, b[1][0] - b[0][0]), bh = Math.max(1, b[1][1] - b[0][1]);
        const boxA = { x: G.left + 4, y: G.top - 14, s: Math.min((G.narrow ? 64 : 120) / bw, (G.narrow ? 46 : 84) / bh) };
        const step = Math.max(1.3, Math.sqrt((bw * bh) / 13000));
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (let y = b[0][1]; y < b[1][1]; y += step) for (let x = b[0][0]; x < b[1][0]; x += step) {
          const px = x + (rand() - 0.5) * step, py = y + (rand() - 0.5) * step;
          if (ctx.isPointInPath(outline, px, py)) push([boxA.x + (px - b[0][0]) * boxA.s, boxA.y + (py - b[0][1]) * boxA.s], [px, py], 0, 0, 0, 2, rand() * 2 - 1, 0);
        }
        ctx.restore();
        G.outline = { boxA, bh };
      }
      count = n / STRIDE;
      if (!buffer) buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n), gl.STATIC_DRAW);
    }

    function attribs(buf) {
      const F = 4, p = E.points.p; gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      [["aA", 2, 0], ["aB", 2, 2], ["aP", 4, 4], ["aQ", 3, 8]].forEach(([name, size, off]) => {
        const l = gl.getAttribLocation(p, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, STRIDE * F, off * F); });
    }
    function quad(prog) { gl.bindBuffer(gl.ARRAY_BUFFER, E.quad); const l = gl.getAttribLocation(prog.p, "aXY");
      gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    function cloud(buf, n, months, form, fade, cursor, mix) {
      const u = E.points.u; attribs(buf);
      gl.uniform1f(u.uForm, form); gl.uniform1f(u.uFade, fade); gl.uniform1f(u.uCursor, cursor); gl.uniform1f(u.uMonths, months); gl.uniform1f(u.uMix, mix);
      gl.drawArrays(gl.POINTS, 0, n);
    }
    function render() {
      if (!gl || !count || !E.targets) return;
      const T = E.targets, moving = live.current.ambient && !reduced, u = E.points.u;
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fbo); gl.viewport(0, 0, T.scene.w, T.scene.h);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(E.points.p); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform2f(u.uRes, w, h); gl.uniform2f(u.uCenter, G.cx, G.cy); gl.uniform1f(u.uDpr, lite ? 1 : dpr);
      gl.uniform1f(u.uTime, elapsed); gl.uniform1f(u.uAmb, moving ? 1 : 0);
      // two incommensurate periods: the viewpoint never visibly loops
      gl.uniform2f(u.uPar, moving ? (Math.sin(elapsed * 0.27) + 0.6 * Math.sin(elapsed * 0.17 + 1.3)) * 7 : 0,
                           moving ? (Math.cos(elapsed * 0.21) + 0.5 * Math.sin(elapsed * 0.13)) * 2.4 : 0);
      const mix = easeScene(st.mix);
      if (E.ghost && E.ghost.t > 0) cloud(E.ghost.buffer, E.ghost.count, E.ghost.months, Math.min(1, E.ghost.t / 0.55), Math.min(1, E.ghost.t / 0.3), -9, mix);
      cloud(buffer, count, M, st.form, 1, (st.cursor + 0.5) / M, mix);
      gl.disable(gl.BLEND); gl.useProgram(E.blur.p); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(E.blur.u.uTex, 0);
      const pass = (src, dst, sx, sy, knee) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, dst.w, dst.h);
        gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform2f(E.blur.u.uStep, sx / dst.w, sy / dst.h); gl.uniform1f(E.blur.u.uKnee, knee); quad(E.blur); };
      pass(T.scene, T.a, 1.2, 0, 1); pass(T.a, T.b, 0, 1.2, 0); pass(T.b, T.a, 2.6, 0, 0); pass(T.a, T.b, 0, 2.6, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, glc.width, glc.height); gl.useProgram(E.compose.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.scene.tex); gl.uniform1i(E.compose.u.uScene, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.b.tex); gl.uniform1i(E.compose.u.uLight, 1);
      gl.uniform1f(E.compose.u.uTime, moving ? elapsed : 0);
      gl.uniform1f(E.compose.u.uBloom, 0.62 + (moving ? 0.05 * Math.sin(elapsed * 0.34) : 0));    // light breathes on an 18 s period
      quad(E.compose); gl.activeTexture(gl.TEXTURE0);
    }

    // ---------------------------------------------------------------- annotations (2D, crisp)
    const text = (s, x, y, color = INK_2, size = 8, align = "left") => {
      ctx.fillStyle = color; ctx.font = `${size}px "JetBrains Mono", "IBM Plex Mono", monospace`; ctx.textAlign = align; ctx.fillText(s, x, y); ctx.textAlign = "left"; };
    const seg = (pts, color, width = 0.6, alpha = 1, dash) => { const keep = ctx.globalAlpha; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = keep * alpha; if (dash) ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = keep; };
    const diamond = (x, y, filled) => { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = filled ? HOT : "#050506";
      ctx.fillRect(-2.4, -2.4, 4.8, 4.8); ctx.strokeStyle = HOT; ctx.lineWidth = 0.7; ctx.strokeRect(-2.4, -2.4, 4.8, 4.8); ctx.restore(); };
    const stepYears = M > 132 ? 3 : M > 72 ? 2 : 1;

    function hudField(k, sel) {
      if (k <= 0.01) return; ctx.globalAlpha = k;
      seg([[G.left, G.base + 0.5], [G.right, G.base + 0.5]], INK_3, 0.5);
      rows.forEach((r, i) => { if (!r.date.endsWith("-01")) return; const x = G.left + (i / M) * G.plotW, y = Number(r.date.slice(0, 4));
        seg([[x, G.base], [x, G.base + (y % stepYears ? 2.5 : 5)]], INK_3, 0.5); if (y % stepYears === 0) text(String(y), x, G.base + 15, INK_3, 6.5, "center"); });
      let lastY = G.base + 8;
      CHANNELS.forEach((ch, j) => { if (!active[j]) return;
        seg(tops[j].map((v, i) => fieldXY(i + 0.5, v)), "#f4ecd2", 0.45, 0.16);
        const [, y] = fieldXY(M - 0.5, tops[j][M - 1]); lastY = Math.min(y + 2, lastY - 8);
        if (!G.narrow) { seg([[G.right + 3, lastY - 2], [G.right + 8, lastY - 2]], ch.color, 0.8); text(ch.short.slice(0, 3), G.right + 11, lastY, INK_2, 6); } });
      rows.forEach((r, i) => { const ev = monthEvents.get(r.date); if (!ev) return; const [x] = fieldXY(i + 0.5, 0), [, yTop] = fieldXY(i + 0.5, Math.min(ceil(), Math.max(H[i], R[i])));
        seg([[x, G.base + 18], [x, yTop - 8]], HOT, 0.45, 0.3, [1.5, 3]); diamond(x, G.base + 24, ev.some((e) => e.type === "riuscito")); });
      const [cx0] = fieldXY(sel + 0.5, 0), topSel = fieldXY(sel + 0.5, Math.min(ceil(), Math.max(at(H, sel + 0.5), at(R, sel + 0.5))))[1];
      seg([[cx0, G.base], [cx0, topSel - 14]], HOT, 0.6, 0.8); seg([[cx0 - 3, topSel - 14], [cx0 + 3, topSel - 14]], HOT, 0.6, 0.8);
      text(G.narrow ? "MONTH × STACKED LOG INTENSITY" : `X / MONTH   Y / STACKED LOG INTENSITY   BODY / TREND σ ${sigma.toFixed(1)} MO   PLUME / OBSERVED MONTH`, 16, h - 14, INK_3, G.narrow ? 5.5 : 6.5);
      ctx.globalAlpha = 1;
    }
    function hudRadial(k, sel) {
      if (k <= 0.01) return; ctx.globalAlpha = k;
      const ring = (r, c, wd = 0.5) => { ctx.beginPath(); ctx.arc(G.cx, G.cy, r, 0, TAU); ctx.strokeStyle = c; ctx.lineWidth = wd; ctx.stroke(); };
      ring(G.R0, INK_3, 0.5); ring(G.R1 * 1.05, "#1d1c1a");
      rows.forEach((r, i) => { const a = (i / M) * TAU - Math.PI / 2, yr = r.date.endsWith("-01"), y = Number(r.date.slice(0, 4));
        const p = (rr) => [G.cx + Math.cos(a) * rr, G.cy + Math.sin(a) * rr];
        seg([p(G.R1 * 1.05), p(G.R1 * (yr ? 1.08 : 1.06))], yr ? INK_2 : INK_3, yr ? 0.6 : 0.35);
        if (yr && y % stepYears === 0) { const q = p(G.R1 * 1.13); text(String(y), q[0], q[1] + 3, INK_3, 6.5, "center"); }
        const ev = monthEvents.get(r.date); if (ev) { const am = ((i + 0.5) / M) * TAU - Math.PI / 2, q = [G.cx + Math.cos(am) * (G.R0 - 9), G.cy + Math.sin(am) * (G.R0 - 9)];
          seg([q, [G.cx + Math.cos(am) * G.R1, G.cy + Math.sin(am) * G.R1]], HOT, 0.45, 0.26, [1.5, 3]); diamond(q[0], q[1], ev.some((e) => e.type === "riuscito")); } });
      const a = ((sel + 0.5) / M) * TAU - Math.PI / 2;
      seg([[G.cx + Math.cos(a) * G.R0, G.cy + Math.sin(a) * G.R0], [G.cx + Math.cos(a) * G.R1 * 1.05, G.cy + Math.sin(a) * G.R1 * 1.05]], HOT, 0.6, 0.8);
      text(country.name.toUpperCase(), G.cx, G.cy + G.R0 * 0.72, INK, G.narrow ? 7 : 8.5, "center");
      if (shape) { const c = geoCentroid(shape); text(`${Math.abs(c[1]).toFixed(2)}°${c[1] >= 0 ? "N" : "S"}  ${Math.abs(c[0]).toFixed(2)}°${c[0] >= 0 ? "E" : "W"}`, G.cx, G.cy + G.R0 * 0.72 + 11, INK_3, 6, "center"); }
      text(G.narrow ? "ANGLE / MONTH · RADIUS / INTENSITY" : "ANGLE / MONTH   RADIUS / STACKED LOG INTENSITY   CENTRE / TERRITORY (CONTEXT)", 16, h - 14, INK_3, G.narrow ? 5.5 : 6.5);
      ctx.globalAlpha = 1;
    }
    function locate(x, y) {
      if (st.mix > 0.5) { const d = Math.hypot(x - G.cx, y - G.cy); if (d < G.R0 * 0.85 || d > G.R1 * 1.2) return null;
        return Math.floor((((Math.atan2(y - G.cy, x - G.cx) + Math.PI / 2 + TAU) % TAU) / TAU) * M) % M; }
      if (x < G.left - 4 || x > G.right + 4 || y < G.top - 30 || y > G.base + 32) return null;
      return Math.max(0, Math.min(M - 1, Math.floor(((x - G.left) / G.plotW) * M)));
    }
    function drawHud() {
      ctx.clearRect(0, 0, w, h);
      const m = easeScene(st.mix), i = Math.max(0, Math.min(M - 1, live.current.index));
      hudField(Math.pow(1 - m, 3) * st.form, st.cursor); hudRadial(Math.pow(m, 3) * st.form, st.cursor);   // annotations step aside while the matter moves
      for (const [x, y, sx, sy] of [[7, 7, 1, 1], [w - 7, 7, -1, 1], [7, h - 7, 1, -1], [w - 7, h - 7, -1, -1]]) seg([[x, y + sy * 8], [x, y], [x + sx * 8, y]], INK_3, 0.6);
      text(m > 0.5 ? "TEMPORAL ATLAS / SAME MATTER, POLAR" : "COMPOSITE FIELD / THREE SIGNALS, ONE SURFACE", 16, 20, INK_2, 7);
      text(`${String(i + 1).padStart(3, "0")} / ${M}   ${rows[i].date}`, w - 16, 20, INK, 7.5, "right");
      if (!gl) text("WEBGL UNAVAILABLE — VALUES REMAIN IN THE READOUTS", w / 2, h / 2, INK_2, 9, "center");
      if (pointer) {
        const hit = locate(pointer.x, pointer.y);
        seg([[pointer.x - 5, pointer.y], [pointer.x + 5, pointer.y]], INK, 0.5); seg([[pointer.x, pointer.y - 5], [pointer.x, pointer.y + 5]], INK, 0.5);
        if (hit != null) { const r = rows[hit], right = pointer.x > w - 170, x = pointer.x + (right ? -12 : 12), y = Math.max(40, pointer.y - 10), al = right ? "right" : "left";
          text(r.date, x, y, HOT, 7.5, al); CHANNELS.forEach((ch, j) => text(`${ch.short.slice(0, 3)} ${r[ch.key].toLocaleString("en-GB")}`, x, y + 10 * (j + 1), ch.color, 6.5, al)); }
      }
    }

    // ---------------------------------------------------------------- clock: every change is time-based
    function advance(dt) {
      const moving = live.current.ambient && !reduced;
      let animating = false;
      const targetMix = live.current.view === "radial" ? 1 : 0;
      if (targetMix !== st.mixTo) { st.mixFrom = st.mix; st.mixTo = targetMix; st.mixT = 0; }
      if (st.mixT < 1) { st.mixT = reduced ? 1 : Math.min(1, st.mixT + dt / 1.1); st.mix = st.mixFrom + (st.mixTo - st.mixFrom) * st.mixT; memory.current.mix = st.mixTo; animating = true; }
      if (st.form < 1) { st.form = reduced ? 1 : Math.min(1, st.form + dt / 1.0); animating = true; }
      if (E && E.ghost && E.ghost.t > 0) { E.ghost.t = reduced ? 0 : Math.max(0, E.ghost.t - dt); animating = true;
        if (E.ghost.t === 0) { gl.deleteBuffer(E.ghost.buffer); E.ghost = null; } }
      const goal = Math.max(0, Math.min(M - 1, live.current.index)), gap = goal - st.cursor;
      if (Math.abs(gap) > 0.002) {
        if (reduced) st.cursor = goal;
        else if (live.current.playing && Math.abs(gap) < 3) { const v = (1000 / live.current.speed) * 1.04 * dt; st.cursor += Math.max(-v, Math.min(v, gap)); }   // glides at the playback rate: no ticks
        else st.cursor += gap * (1 - Math.exp(-dt * 6.5));
        animating = true;
      } else st.cursor = goal;
      if (moving) elapsed += dt;
      if (moving && !lite && dpr > 1 && ++frames > 30) { if (dt > 0.03) slow++; if (frames > 150) { if (slow > 60) { lite = true; size(); build(); dirty = true; } frames = 31; slow = 0; } }
      if (moving || animating || dirty) render();
      if (animating || dirty) { drawHud(); dirty = false; }
    }
    function tick(now) {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
      if (!visible || document.hidden || !G) return;
      advance(dt);
    }
    // On slow GPUs the particle layer drops to 1x resolution and fewer particles; annotations stay sharp.
    function size() {
      const g = lite ? 1 : dpr, W = Math.round(w * g), Hh = Math.round(h * g);
      glc.width = W; glc.height = Hh; hud.width = Math.round(w * dpr); hud.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!gl) return;
      if (E.targets) for (const t of Object.values(E.targets)) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      const bw = Math.max(2, Math.round(W / 3)), bh = Math.max(2, Math.round(Hh / 3));
      E.targets = { scene: target(gl, W, Hh), a: target(gl, bw, bh), b: target(gl, bw, bh) };
    }
    const resize = new ResizeObserver(([e]) => { w = Math.max(1, e.contentRect.width); h = Math.max(1, e.contentRect.height); dpr = Math.min(window.devicePixelRatio || 1, 2); size(); build(); dirty = true; });
    const seen = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { last = 0; dirty = true; } });
    const move = (e) => { const b = hud.getBoundingClientRect(); pointer = { x: e.clientX - b.left, y: e.clientY - b.top }; dirty = true; };
    const leave = () => { pointer = null; dirty = true; };
    const click = (e) => { const b = hud.getBoundingClientRect(), i = locate(e.clientX - b.left, e.clientY - b.top); if (i != null) live.current.onSelect(i); };
    hud.addEventListener("pointermove", move); hud.addEventListener("pointerleave", leave); hud.addEventListener("click", click);
    resize.observe(wrapRef.current); seen.observe(wrapRef.current); frame = requestAnimationFrame(tick);
    if (process.env.NODE_ENV !== "production") window.__field = { fit: () => { const r = wrapRef.current.getBoundingClientRect(); w = Math.max(1, r.width); h = Math.max(1, r.height); dpr = Math.min(window.devicePixelRatio || 1, 2); size(); build(); dirty = true; return [w, h, dpr]; }, step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { dirty = true; if (G) advance(dt); } return { ...st, count }; }, canvas: glc, hud };
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); seen.disconnect();
      hud.removeEventListener("pointermove", move); hud.removeEventListener("pointerleave", leave); hud.removeEventListener("click", click);
      if (gl && buffer) { if (E.ghost) gl.deleteBuffer(E.ghost.buffer); E.ghost = { buffer, count, months: M, t: 0 }; }   // kept briefly so the next field can emerge from it
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country.iso, country.name, rows, events, reduced, layers.join("|")]);

  useEffect(() => () => {                                                       // unmount: release GPU resources
    const E = eng.current; if (!E) return; const gl = E.gl;
    if (E.ghost) gl.deleteBuffer(E.ghost.buffer);
    if (E.targets) for (const t of Object.values(E.targets)) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    gl.deleteBuffer(E.quad); for (const k of ["points", "blur", "compose"]) gl.deleteProgram(E[k].p);
    eng.current = null;
  }, []);

  return (
    <div ref={wrapRef} className="fx-stage" role="img"
         aria-label={`${country.name}: monthly protests, political violence and fatalities as one stacked field. Exact counts are in the adjacent readouts.`}>
      <canvas ref={glRef} className="fx-gl" aria-hidden="true" />
      <canvas ref={hudRef} className="fx-hud" aria-hidden="true" />
    </div>
  );
}

export function GeoLocator({ iso }) {
  const p = geoEqualEarth().fitExtent([[4, 4], [176, 88]], GEOGRAPHY), path = geoPath(p), shape = SHAPES.get(String(iso)), center = shape ? p(geoCentroid(shape)) : null;
  return (
    <svg viewBox="0 0 180 92" role="img" aria-label="Selected country in world context">
      <path d={path(GEOGRAPHY)} fill="#151517" stroke="#2e2d2a" strokeWidth=".25" />
      {shape && <path d={path(shape)} fill="#e9d9a2" />}
      {center && <g><circle cx={center[0]} cy={center[1]} r="5" fill="none" stroke="#e9d9a2" strokeWidth=".5" />
        <path d={`M${center[0] - 10},${center[1]}h20M${center[0]},${center[1] - 10}v20`} fill="none" stroke="#e9d9a2" strokeWidth=".5" /></g>}
    </svg>
  );
}
