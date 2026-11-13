"use client";

import { useEffect, useRef } from "react";
import { labelEn } from "@/lib/english";
import { buildParticles, camera, CH, fieldLayout, project, RING, ringCentre, signals, spine, STRIDE, traceLayout } from "@/components/lab/geometry";

const INK = "#d8d3c4", INK_2 = "#8f8a7f", INK_3 = "#57544d", HOT = "#f6f0df", WARM = "#e6c46e", COOL = "#b9afe2";
const VIEWS = ["field", "atlas", "trace"];
const easeScene = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const fmtN = (v) => Math.round(v).toLocaleString("en-GB");

/* ------------------------------------------------------------------ shaders */
const VERT = `
attribute vec4 aF; attribute vec4 aA; attribute vec4 aT; attribute vec4 aX; attribute vec4 aY;
uniform vec2 uRes, uCtr; uniform vec3 uW; uniform vec4 uCam;
uniform float uDpr, uTime, uForm, uCursor, uAmb, uMonths, uFade, uMid;
varying vec4 vCol; varying float vSharp;
float hash(float n){ return fract(sin(n * 127.1) * 43758.5453); }
vec3 ramp(float t){
  vec3 c0 = vec3(.24,.09,.06), c1 = vec3(.66,.25,.12), c2 = vec3(.86,.49,.22), c3 = vec3(.92,.73,.38), c4 = vec3(.94,.87,.66), c5 = vec3(.96,.94,.88);
  t = clamp(t, 0., 1.);
  if (t < .16) return mix(c0, c1, t / .16);
  if (t < .38) return mix(c1, c2, (t - .16) / .22);
  if (t < .6) return mix(c2, c3, (t - .38) / .22);
  if (t < .82) return mix(c3, c4, (t - .6) / .22);
  return mix(c4, c5, (t - .82) / .18);
}
vec3 pal(float c){
  if (c < 0.) return vec3(.92, .9, .86) * -c;
  if (c <= 1.) return ramp(c);
  return mix(vec3(.95,.93,.88), vec3(.64,.58,.88), clamp(c - 1., 0., 1.));
}
vec3 project(vec3 q){
  float cr = cos(uCam.x), sr = sin(uCam.x), ct = cos(uCam.y), st = sin(uCam.y);
  vec3 a = vec3(q.x * cr + q.z * sr, q.y, -q.x * sr + q.z * cr);
  float by = a.y * ct - a.z * st, bz = a.y * st + a.z * ct, k = uCam.w / (uCam.w + bz);
  return vec3(uCtr + vec2(a.x, -by) * uCam.z * k, k);
}
void main(){
  float seed = aX.x, t = aX.y, ph = seed * 6.2831853, cls = hash(seed + 17.), evt = aY.z;
  vec3 pa = project(aA.xyz);
  float near = clamp((pa.z - .72) / .75, 0., 1.);
  vec2 p = uW.x * aF.xy + uW.y * pa.xy + uW.z * aT.xy;
  p += vec2(sin(ph * 14.6 + uTime * .37), cos(ph * 5.9 + uTime * .31)) * uMid * (10. + 80. * hash(seed + 2.));   // matter loosens mid-morph
  vec2 drift = vec2(sin(uTime * .19 + ph * 3.) + .6 * sin(uTime * .071 + ph * 7.), cos(uTime * .16 + ph * 5.) + .6 * cos(uTime * .053 + ph * 11.));
  p += drift * uAmb * (uW.x * (.22 + aF.w * 4.) + uW.y * .3 + uW.z * .16);
  float delay = hash(seed + 11.) * .45, f = smoothstep(delay, delay + .55, uForm);
  vec2 away = vec2(hash(seed + 5.), hash(seed + 9.)) - .5;
  p = mix(p + away * (80. + 260. * hash(seed + 23.)), p, f);                     // cohesion is lost and regained locally

  float aAtlas = aX.w * mix(.36, 1.15, near);
  float alpha = uW.x * aX.z + uW.y * aAtlas + uW.z * aT.w;
  vec3 col = uW.x * pal(aF.z) + uW.y * pal(aA.w) + uW.z * pal(aT.z);
  float dc = abs(t - uCursor) * uMonths;
  float cur = exp(-dc * dc / 1.4) * (uW.x + uW.y);
  float flow = aY.y > .5 ? .5 + .5 * pow(.5 + .5 * sin(6.2831 * (aY.x * 2.4 - uTime * .2)), 3.) : 1.;
  alpha *= mix(1., flow, uW.z);
  float wave = 1. + uAmb * (.09 * sin(t * 4.6 + uTime * .29) + .05 * sin(t * 12. - uTime * .19 + 1.7));
  float shim = 1. + uAmb * .08 * sin(uTime * (.5 + 1.7 * hash(seed + 13.)) + ph * 9.);
  col = mix(col, vec3(.99,.97,.92), cur * .5);
  alpha *= (1. + cur * .85) * wave * shim * f * uFade;
  float size = cls < .7 ? .6 : (cls < .95 ? 1.05 : 1.7);
  float a = cls < .7 ? .36 : (cls < .95 ? .54 : .9);
  float ev = evt * (uW.x + uW.y);
  size = mix(size, .9 + .9 * cls, ev); a = mix(a, .62, ev);
  size *= mix(1., mix(.72, 1.35, near), uW.y) * mix(1., .9, uW.z);
  gl_PointSize = max(1.2, size * uDpr * 2.);
  vec2 clip = p / uRes * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, 0., 1.);
  vCol = vec4(col * alpha * a, alpha * a); vSharp = mix(.25, .8, ev);
}`;
const FRAG = `
precision mediump float; varying vec4 vCol; varying float vSharp;
void main(){ float r = length(gl_PointCoord - .5) * 2.; gl_FragColor = vCol * smoothstep(1., mix(.08, .82, vSharp), r); }`;
const QUAD = `attribute vec2 aXY; varying vec2 vUV; void main(){ vUV = aXY * .5 + .5; gl_Position = vec4(aXY, 0., 1.); }`;
const BLUR = `
precision mediump float; varying vec2 vUV; uniform sampler2D uTex; uniform vec2 uStep; uniform float uKnee;
vec3 pick(vec2 uv){ vec3 c = texture2D(uTex, uv).rgb; float l = dot(c, vec3(.3,.5,.2)); return c * mix(1., smoothstep(.1, .75, l), uKnee); }
void main(){
  vec3 c = pick(vUV) * .227;
  c += (pick(vUV + uStep * 1.385) + pick(vUV - uStep * 1.385)) * .316;
  c += (pick(vUV + uStep * 3.231) + pick(vUV - uStep * 3.231)) * .07;
  gl_FragColor = vec4(c, 1.);
}`;
const COMPOSE = `
precision mediump float; varying vec2 vUV; uniform sampler2D uScene, uLight; uniform float uTime, uBloom;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 c = texture2D(uScene, vUV).rgb + texture2D(uLight, vUV).rgb * uBloom;
  c = 1. - exp(-c * 1.35);
  vec2 q = vUV - .5; c *= 1. - .32 * smoothstep(.35, .95, length(q * vec2(1.05, 1.25)));
  c *= 1. - .02 * step(.5, fract(gl_FragCoord.y / 3.));
  c += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - .5) * .03;
  gl_FragColor = vec4(c + vec3(.012, .012, .015), 1.);
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
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
  if (!gl) return null;
  try {
    const e = { gl, points: compile(gl, VERT, FRAG), blur: compile(gl, QUAD, BLUR), compose: compile(gl, QUAD, COMPOSE), targets: null, ghost: null };
    e.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, e.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    e.loc = Object.fromEntries(["aF", "aA", "aT", "aX", "aY"].map((n) => [n, gl.getAttribLocation(e.points.p, n)]));
    return e;
  } catch (err) { console.error("Stage shaders:", err); return null; }
}

/**
 * One body of particles, three readings of the same data:
 *   field  — cumulative record (curve) with monthly intensity as thickness, three signals inner → outer
 *   atlas  — a ring of fibres: angle = month, tube = intensity, twist = month-to-month change
 *   trace  — the model's evidence graph, with the selected country's path lit
 */
export default function Stage({ country, detail, rows, events, model, meta, view, index, onSelect, reduced, ambient, layers, playing, speed }) {
  const glRef = useRef(null), hudRef = useRef(null), wrapRef = useRef(null), eng = useRef(null);
  const live = useRef({});
  live.current = { index, onSelect, view, ambient, playing, speed };
  const memory = useRef({ iso: null, w: [1, 0, 0] });

  useEffect(() => {
    const glc = glRef.current, hud = hudRef.current, ctx = hud.getContext("2d");
    const M = rows.length;
    if (!ctx || !M) return;
    if (eng.current === null) eng.current = engine(glc) || false;
    const E = eng.current, gl = E ? E.gl : null;
    const S = signals(rows, layers);
    const monthEvents = new Map();
    for (const e of events) { const d = e.date.slice(0, 7); if (!monthEvents.has(d)) monthEvents.set(d, []); monthEvents.get(d).push(e); }

    let w = 1, h = 1, dpr = 1, frame = 0, last = 0, elapsed = 0, visible = true, dirty = true;
    let pointer = null, F = null, TR = null, lite = false, slow = 0, frames = 0, buffer = null, count = 0, ring = [], cam = null;
    const sameCountry = memory.current.iso === country.iso;
    memory.current.iso = country.iso;
    const wNow = memory.current.w.slice();
    const st = { w: wNow, from: wNow.slice(), to: wNow.slice(), t: 1, form: reduced ? 1 : sameCountry ? 0.55 : 0,
                 cursor: Math.max(0, Math.min(M - 1, live.current.index)) };
    if (E && E.ghost) E.ghost.t = sameCountry ? 0.2 : 0.6;

    function build() {
      F = fieldLayout(S, w, h);
      TR = traceLayout(model, detail, w, h);
      if (!gl) return;
      const budget = Math.round(Math.max(36000, Math.min(lite ? 70000 : 150000, (w * h) / 4.2)));
      const seed = Number(country.iso || 7) * 7919 + M * 31 + S.active.reduce((n, a, i) => n + (a ? 1 << i : 0), 0);
      const out = buildParticles({ S, rows, events, W: w, H: h, budget, seed, trace: TR });
      count = out.count;
      if (!buffer) buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, out.data, gl.STATIC_DRAW);
    }

    // ---------------------------------------------------------------- GPU
    function attribs(buf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      ["aF", "aA", "aT", "aX", "aY"].forEach((name, i) => { const l = E.loc[name]; if (l < 0) return;
        gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, STRIDE * 4, i * 16); });
    }
    function quad(prog) { gl.bindBuffer(gl.ARRAY_BUFFER, E.quad); const l = gl.getAttribLocation(prog.p, "aXY");
      gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    function render() {
      if (!gl || !count || !E.targets) return;
      const T = E.targets, moving = live.current.ambient && !reduced, u = E.points.u, wv = st.w.map((x) => x);
      for (const l of Object.values(E.loc)) if (l >= 0) gl.disableVertexAttribArray(l);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fbo); gl.viewport(0, 0, T.scene.w, T.scene.h);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(E.points.p); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform2f(u.uRes, w, h); gl.uniform2f(u.uCtr, cam.cx, cam.cy); gl.uniform3f(u.uW, wv[0], wv[1], wv[2]);
      gl.uniform4f(u.uCam, cam.rot, RING.tilt, cam.scale, RING.dist);
      gl.uniform1f(u.uDpr, lite ? 1 : dpr); gl.uniform1f(u.uTime, elapsed); gl.uniform1f(u.uAmb, moving ? 1 : 0);
      gl.uniform1f(u.uMid, Math.min(1, (1 - Math.max(...wv)) * 1.7)); gl.uniform1f(u.uMonths, M);
      if (E.ghost && E.ghost.t > 0) {
        attribs(E.ghost.buffer); gl.uniform1f(u.uForm, Math.min(1, E.ghost.t / 0.6)); gl.uniform1f(u.uFade, Math.min(1, E.ghost.t / 0.35));
        gl.uniform1f(u.uCursor, -9); gl.drawArrays(gl.POINTS, 0, E.ghost.count);
      }
      attribs(buffer); gl.uniform1f(u.uForm, st.form); gl.uniform1f(u.uFade, 1); gl.uniform1f(u.uCursor, (st.cursor + 0.5) / M);
      gl.drawArrays(gl.POINTS, 0, count);
      for (const l of Object.values(E.loc)) if (l >= 0) gl.disableVertexAttribArray(l);
      gl.disable(gl.BLEND); gl.useProgram(E.blur.p); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(E.blur.u.uTex, 0);
      const pass = (src, dst, sx, sy, knee) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, dst.w, dst.h);
        gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform2f(E.blur.u.uStep, sx / dst.w, sy / dst.h); gl.uniform1f(E.blur.u.uKnee, knee); quad(E.blur); };
      pass(T.scene, T.a, 1.2, 0, 1); pass(T.a, T.b, 0, 1.2, 0); pass(T.b, T.a, 2.6, 0, 0); pass(T.a, T.b, 0, 2.6, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, glc.width, glc.height); gl.useProgram(E.compose.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.scene.tex); gl.uniform1i(E.compose.u.uScene, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.b.tex); gl.uniform1i(E.compose.u.uLight, 1);
      gl.uniform1f(E.compose.u.uTime, moving ? elapsed : 0);
      gl.uniform1f(E.compose.u.uBloom, 0.66 + (moving ? 0.05 * Math.sin(elapsed * 0.34) : 0));
      quad(E.compose); gl.activeTexture(gl.TEXTURE0);
    }

    // ---------------------------------------------------------------- annotations
    const font = (size, weight = 400) => `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`;
    const text = (s, x, y, color = INK_2, size = 8, align = "left", weight) => { ctx.fillStyle = color; ctx.font = font(size, weight); ctx.textAlign = align; ctx.fillText(s, x, y); ctx.textAlign = "left"; };
    const seg = (pts, color, width = 0.6, alpha = 1, dash) => { const keep = ctx.globalAlpha; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = keep * alpha; if (dash) ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = keep; };
    const dot = (x, y, r, fill, stroke) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.7; ctx.stroke(); } };
    const diamond = (x, y, filled) => { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = filled ? HOT : "#050506";
      ctx.fillRect(-2.4, -2.4, 4.8, 4.8); ctx.strokeStyle = HOT; ctx.lineWidth = 0.7; ctx.strokeRect(-2.4, -2.4, 4.8, 4.8); ctx.restore(); };
    const tag = (s, x, y, color = HOT, align = "left", sub) => {
      ctx.font = font(7); const tw = Math.max(ctx.measureText(s).width, sub ? ctx.measureText(sub).width : 0) + 10, th = sub ? 22 : 13;
      const bx = align === "left" ? x : align === "right" ? x - tw : x - tw / 2;
      ctx.fillStyle = "rgba(6,6,8,.82)"; ctx.fillRect(bx, y - 9, tw, th); ctx.strokeStyle = "rgba(246,240,223,.28)"; ctx.lineWidth = 0.6; ctx.strokeRect(bx + 0.5, y - 8.5, tw - 1, th - 1);
      text(s, bx + 5, y, color, 7); if (sub) text(sub, bx + 5, y + 9, INK_2, 6.5);
    };
    const stepYears = M > 132 ? 3 : M > 72 ? 2 : 1;

    function hudField(k, sel) {
      if (k <= 0.01) return; ctx.globalAlpha = k;
      const bottom = F.yB + F.Wmax * 1.1;
      seg([[F.x0, bottom], [F.x1 + F.Wmax * 1.2, bottom]], INK_3, 0.5);
      rows.forEach((r, i) => { if (!r.date.endsWith("-01")) return; const x = F.x0 + (i / M) * (F.x1 - F.x0), y = Number(r.date.slice(0, 4));
        seg([[x, bottom], [x, bottom + (y % stepYears ? 2.5 : 5)]], INK_3, 0.5); if (y % stepYears === 0) text(String(y), x, bottom + 15, INK_3, 6.5, "center"); });
      seg([[F.x0 - 14, F.yB], [F.x0 - 14, F.yT]], INK_3, 0.5);
      for (const q of [0, 0.25, 0.5, 0.75, 1]) { const y = F.yB - q * (F.yB - F.yT); seg([[F.x0 - 17, y], [F.x0 - 14, y]], INK_3, 0.5);
        if (!F.narrow) text(fmtN(S.total * q), F.x0 - 20, y + 2.5, INK_3, 6, "right"); }
      if (!F.narrow) text("CUMULATIVE EVENTS", F.x0 - 14, F.yT - 12, INK_3, 6);
      rows.forEach((r, i) => { const ev = monthEvents.get(r.date); if (!ev) return; const p = spine(S, F, i + 0.5);
        seg([[p[0], bottom + 20], [p[0], p[1] + 6]], HOT, 0.45, 0.28, [1.5, 3]); diamond(p[0], bottom + 26, ev.some((e) => e.type === "riuscito")); });
      const p = spine(S, F, sel + 0.5), i = Math.max(0, Math.min(M - 1, Math.round(sel)));
      seg([[p[0], bottom], [p[0], p[1]]], HOT, 0.6, 0.7);
      seg([[p[0], p[1]], [p[0] - 26, p[1] - 26]], HOT, 0.5, 0.6); dot(p[0], p[1], 2.2, null, HOT);
      tag(`${rows[i].date}  Σ ${fmtN(S.cum[i + 1])}`, p[0] - 26, p[1] - 30, HOT, "right", `${fmtN(S.T[i])} events this month`);
      const lx = w - (F.narrow ? 12 : 20), ly = h - (F.narrow ? 30 : 34);
      if (!F.narrow) { text("INNER → OUTER", lx, ly - 22, INK_3, 6, "right");
        let x = lx; [...CH].reverse().forEach((c, j) => { const kk = 2 - j; if (!S.active[kk]) return; ctx.font = font(6.5); const tw = ctx.measureText(c.short).width;
          text(c.short, x, ly - 10, INK_2, 6.5, "right"); seg([[x - tw - 12, ly - 12], [x - tw - 4, ly - 12]], c.color, 1.2); x -= tw + 22; });
        text("SCATTER = INTENSITY OF THE OUTER SIGNAL", lx, ly + 1, INK_3, 6, "right"); }
      ctx.globalAlpha = 1;
    }
    function hudAtlas(k, sel) {
      if (k <= 0.01) return; ctx.globalAlpha = k;
      ring = rows.map((_, m) => project(ringCentre(S, m + 0.5), cam, w, h));
      rows.forEach((r, m) => { if (!r.date.endsWith("-01")) return; const y = Number(r.date.slice(0, 4)); if (y % stepYears) return;
        const c = ringCentre(S, m), o = project([c[0] * 1.36, c[1], c[2] * 1.36], cam, w, h);
        text(String(y), o[0], o[1] + 2, INK_3, 6.5, "center"); });
      rows.forEach((r, m) => { const ev = monthEvents.get(r.date); if (!ev) return; const p = ring[m]; diamond(p[0], p[1], ev.some((e) => e.type === "riuscito")); });
      const i = Math.max(0, Math.min(M - 1, Math.round(sel))), p = project(ringCentre(S, sel + 0.5), cam, w, h);
      const side = p[0] > cam.cx ? 1 : -1, ex = p[0] + side * 46, ey = p[1] - 30;
      dot(p[0], p[1], 3, null, HOT); seg([[p[0], p[1]], [ex, ey]], HOT, 0.5, 0.65);
      tag(rows[i].date, ex, ey - 2, HOT, side > 0 ? "left" : "right", CH.filter((_, j) => S.active[j]).map((c) => `${c.short.slice(0, 3)} ${rows[i][c.key]}`).join("  "));
      text(country.name.toUpperCase(), cam.cx, cam.cy + 3, INK, w < 620 ? 7.5 : 9, "center");
      text(`${M} MONTHS / ${rows[0].date} → ${rows[M - 1].date}`, cam.cx, cam.cy + 15, INK_3, 6, "center");
      if (w >= 620) {
        const lx = w - 20, ly = h - 34;
        text("ANGLE = MONTH   TUBE RADIUS = INTENSITY", lx, ly - 10, INK_3, 6, "right");
        text("TWIST = MONTH-TO-MONTH CHANGE   UP = VIOLENCE > PROTEST", lx, ly + 1, INK_3, 6, "right");
      }
      ctx.globalAlpha = 1;
    }
    function hudTrace(k) {
      if (k <= 0.01) return; ctx.globalAlpha = k;
      const T = TR, narrow = w < 620;
      const srcLabel = { coups: ["COUP DATABASE", `${fmtN(meta.n_coups_history || 0)} ATTEMPTS A–C`], acled: ["ACLED", `${fmtN(meta.n_events || 0)} EVENTS`], vdem: ["V-DEM", "REGIME & LEADERS"], wb: ["WORLD BANK", "ECONOMY"] };
      for (const s of T.sources) { dot(s.x, s.y, 2.4, T.lit.has(s) ? HOT : null, T.lit.has(s) ? null : INK_2);
        text(srcLabel[s.key][0], s.x, s.y - 9, T.lit.has(s) ? INK : INK_2, 7, "center"); if (!narrow) text(srcLabel[s.key][1], s.x, s.y - 18, INK_3, 6, "center"); }
      for (const f of T.feats) dot(f.x, f.y, T.lit.has(f) ? 2 : 0.9, T.lit.has(f) ? HOT : INK_3);
      for (const g of T.groups) { const on = T.lit.has(g); dot(g.x, g.y, on ? 3 : 1.8, on ? HOT : null, on ? null : INK_2);
        if (on) text(labelEn(g.label).toUpperCase(), g.x, g.y + 14, INK, 6, "center");
        const c = T.gContrib.get(g.key); if (on && c != null) text(`${c >= 0 ? "+" : "−"}${Math.abs(c).toFixed(2)}`, g.x, g.y + 23, c >= 0 ? WARM : COOL, 6.5, "center"); }
      const names = { logit: "LOGISTIC", gbm: "BOOSTING", rf: "FOREST" };
      for (const c of T.comps) { dot(c.x, c.y, 2.4, T.lit.has(c) ? HOT : null, INK_2); text(names[c.key], c.x, c.y + 13, T.lit.has(c) ? INK : INK_3, 6, "center"); }
      dot(T.ens.x, T.ens.y, 2.6, HOT); text("ENSEMBLE / MEAN LOG-ODDS", T.ens.x + 9, T.ens.y + 2.5, INK_2, 6.5);
      dot(T.cal.x, T.cal.y, 2.6, HOT); text("CALIBRATION", T.cal.x + 9, T.cal.y + 2.5, INK_2, 6.5);
      const g = ctx.createRadialGradient(T.out.x, T.out.y, 0, T.out.x, T.out.y, 16); g.addColorStop(0, "rgba(246,240,223,.55)"); g.addColorStop(1, "rgba(246,240,223,0)");
      ctx.fillStyle = g; ctx.fillRect(T.out.x - 16, T.out.y - 16, 32, 32); dot(T.out.x, T.out.y, 3.4, HOT);
      tag(`${(country.risk * 100).toFixed(1)}%  ${country.name.toUpperCase()}`, T.out.x + 12, T.out.y + 3, HOT, "left", `P(ATTEMPT) / NEXT ${meta.horizon} MONTHS`);
      // driver tags: packed into rows above the variables so they never overlap
      ctx.font = font(7);
      const rowsUsed = [];
      [...T.drivers].sort((a, b) => a.f.x - b.f.x).forEach((d) => {
        const label = `${labelEn(d.label)}  ${d.contrib >= 0 ? "+" : "−"}${Math.abs(d.contrib).toFixed(2)}`, tw = ctx.measureText(label).width + 10;
        const left = Math.max(6, Math.min(w - tw - 6, d.f.x - tw / 2));
        let r = 0; while ((rowsUsed[r] || []).some(([a, b]) => left < b + 6 && left + tw > a - 6)) r++;
        (rowsUsed[r] = rowsUsed[r] || []).push([left, left + tw]);
        const y0 = T.Y.feat - 18 - r * 15, col = d.contrib >= 0 ? WARM : COOL;
        seg([[d.f.x, d.f.y - 3], [d.f.x, y0 + 4]], col, 0.5, 0.6);
        tag(label, left, y0, col, "left");
      });
      if (pointer) {
        let best = null, bd = 14;
        for (const f of T.feats) { const dd = Math.hypot(pointer.x - f.x, pointer.y - f.y); if (dd < bd) { bd = dd; best = f; } }
        let bestG = null, bg = 16;
        for (const g of T.groups) { const dd = Math.hypot(pointer.x - g.x, pointer.y - g.y); if (dd < bg) { bg = dd; bestG = g; } }
        if (bestG && !best) { dot(bestG.x, bestG.y, 4, null, HOT); const c = T.gContrib.get(bestG.key);
          tag(labelEn(bestG.label), bestG.x, bestG.y + 30, INK, bestG.x > w / 2 ? "right" : "left", c != null ? `contribution for ${country.name}: ${c >= 0 ? "+" : "−"}${Math.abs(c).toFixed(2)} log-odds` : "not decomposed for this country"); }
        if (best) { dot(best.x, best.y, 3.2, null, HOT);
          tag(labelEn(best.label), best.x, best.y + 26, INK, best.x > w / 2 ? "right" : "left",
              `${best.odds != null ? `odds ×${best.odds.toFixed(2)} per s.d.` : "spline term"} · top-6 driver in ${best.freq} countries`); }
      }
      if (!narrow) { text("SOURCES → VARIABLES → GROUPS → MODELS → FORECAST", 20, h - 34, INK_3, 6);
        text("FIBRES = HOW MANY COUNTRIES THE VARIABLE DRIVES · LIT PATH = TOP CONTRIBUTIONS, LINEAR COMPONENT", 20, h - 23, INK_3, 6); }
      ctx.globalAlpha = 1;
    }
    function locate(x, y) {
      const v = VIEWS[st.w.indexOf(Math.max(...st.w))];
      if (v === "field") { if (x < F.x0 - 8 || x > F.x1 + F.Wmax || y < F.yT - 30 || y > F.yB + F.Wmax * 1.6) return null;
        return Math.max(0, Math.min(M - 1, Math.floor(((x - F.x0) / (F.x1 - F.x0)) * M))); }
      if (v === "atlas" && ring.length) { let best = null, bd = 36; ring.forEach((p, m) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = m; } }); return best; }
      return null;
    }
    function drawHud() {
      ctx.clearRect(0, 0, w, h);
      const [a, b, c] = st.w.map((x) => Math.pow(x, 3) * st.form);
      hudField(a, st.cursor); hudAtlas(b, st.cursor); hudTrace(c);
      for (const [x, y, sx, sy] of [[7, 7, 1, 1], [w - 7, 7, -1, 1], [7, h - 7, 1, -1], [w - 7, h - 7, -1, -1]]) seg([[x, y + sy * 8], [x, y], [x + sx * 8, y]], INK_3, 0.6);
      if (!gl) text("WEBGL UNAVAILABLE — VALUES REMAIN IN THE READOUTS", w / 2, h / 2, INK_2, 9, "center");
      if (pointer && st.w[2] < 0.5) { seg([[pointer.x - 5, pointer.y], [pointer.x + 5, pointer.y]], INK, 0.5); seg([[pointer.x, pointer.y - 5], [pointer.x, pointer.y + 5]], INK, 0.5);
        const hit = locate(pointer.x, pointer.y);
        if (hit != null) { const r = rows[hit], right = pointer.x > w - 170, x = pointer.x + (right ? -12 : 12), y = Math.max(40, pointer.y - 10), al = right ? "right" : "left";
          text(r.date, x, y, HOT, 7.5, al); CH.forEach((ch, j) => text(`${ch.short.slice(0, 3)} ${r[ch.key].toLocaleString("en-GB")}`, x, y + 10 * (j + 1), ch.color, 6.5, al)); } }
    }

    // ---------------------------------------------------------------- clock: every change is time-based
    function advance(dt) {
      const moving = live.current.ambient && !reduced;
      let animating = false;
      const goalW = VIEWS.map((v) => (v === live.current.view ? 1 : 0));
      if (goalW.some((x, i) => x !== st.to[i])) { st.from = st.w.slice(); st.to = goalW; st.t = 0; }
      if (st.t < 1) { st.t = reduced ? 1 : Math.min(1, st.t + dt / 1.15); const e = easeScene(st.t);
        st.w = st.from.map((x, i) => x + (st.to[i] - x) * e); memory.current.w = st.to.slice(); animating = true; }
      if (st.form < 1) { st.form = reduced ? 1 : Math.min(1, st.form + dt / 1.0); animating = true; }
      if (E && E.ghost && E.ghost.t > 0) { E.ghost.t = reduced ? 0 : Math.max(0, E.ghost.t - dt); animating = true;
        if (E.ghost.t === 0) { gl.deleteBuffer(E.ghost.buffer); E.ghost = null; } }
      const goal = Math.max(0, Math.min(M - 1, live.current.index)), gap = goal - st.cursor;
      if (Math.abs(gap) > 0.002) {
        if (reduced) st.cursor = goal;
        else if (live.current.playing && Math.abs(gap) < 3) { const v = (1000 / live.current.speed) * 1.04 * dt; st.cursor += Math.max(-v, Math.min(v, gap)); }
        else st.cursor += gap * (1 - Math.exp(-dt * 6.5));
        animating = true;
      } else st.cursor = goal;
      if (moving) elapsed += dt;
      cam = camera(w, h, 0.62 + (moving ? elapsed * 0.045 : 0) + (reduced ? 0 : 0));
      if (moving && !lite && dpr > 1 && ++frames > 30) { if (dt > 0.03) slow++; if (frames > 150) { if (slow > 60) { lite = true; size(); build(); dirty = true; } frames = 31; slow = 0; } }
      const atlasMoving = moving && st.w[1] > 0.01, traceHover = st.w[2] > 0.01 && pointer;
      if (moving || animating || dirty) render();
      if (animating || dirty || atlasMoving || traceHover) { drawHud(); dirty = false; }
    }
    function tick(now) {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
      if (!visible || document.hidden || !F) return;
      advance(dt);
    }
    function size() {
      const g = lite ? 1 : dpr, W = Math.round(w * g), Hh = Math.round(h * g);
      glc.width = W; glc.height = Hh; hud.width = Math.round(w * dpr); hud.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cam = camera(w, h, 0.62);
      if (!gl) return;
      if (E.targets) for (const t of Object.values(E.targets)) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      const bw = Math.max(2, Math.round(W / 3)), bh = Math.max(2, Math.round(Hh / 3));
      E.targets = { scene: target(gl, W, Hh), a: target(gl, bw, bh), b: target(gl, bw, bh) };
    }
    const fit = () => { const r = wrapRef.current.getBoundingClientRect(); w = Math.max(1, r.width); h = Math.max(1, r.height); dpr = Math.min(window.devicePixelRatio || 1, 2); size(); build(); dirty = true; };
    const resize = new ResizeObserver(fit);
    const seen = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { last = 0; dirty = true; } });
    const move = (e) => { const b = hud.getBoundingClientRect(); pointer = { x: e.clientX - b.left, y: e.clientY - b.top }; dirty = true; };
    const leave = () => { pointer = null; dirty = true; };
    const click = (e) => { const b = hud.getBoundingClientRect(), i = locate(e.clientX - b.left, e.clientY - b.top); if (i != null) live.current.onSelect(i); };
    hud.addEventListener("pointermove", move); hud.addEventListener("pointerleave", leave); hud.addEventListener("click", click);
    resize.observe(wrapRef.current); seen.observe(wrapRef.current); frame = requestAnimationFrame(tick);
    if (process.env.NODE_ENV !== "production") window.__stage = { fit: () => { fit(); return [w, h, dpr]; }, step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { dirty = true; if (F) advance(dt); } return { ...st, count }; }, canvas: glc, hud };
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); seen.disconnect();
      hud.removeEventListener("pointermove", move); hud.removeEventListener("pointerleave", leave); hud.removeEventListener("click", click);
      if (gl && buffer) { if (E.ghost) gl.deleteBuffer(E.ghost.buffer); E.ghost = { buffer, count, t: 0 }; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country.iso, detail, rows, events, model, reduced, layers.join("|")]);

  useEffect(() => () => {
    const E = eng.current; if (!E) return; const gl = E.gl;
    if (E.ghost) gl.deleteBuffer(E.ghost.buffer);
    if (E.targets) for (const t of Object.values(E.targets)) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    gl.deleteBuffer(E.quad); for (const k of ["points", "blur", "compose"]) gl.deleteProgram(E[k].p);
    eng.current = null;
  }, []);

  const label = { field: "cumulative record of monthly protests, political violence and fatalities", atlas: "ring of fibres, one turn per window, thickness following monthly intensity", trace: "evidence graph from data sources to the forecast" }[view];
  return (
    <div ref={wrapRef} className="lab-stage" role="img" aria-label={`${country.name}: ${label}. Exact values are in the readouts.`}>
      <canvas ref={glRef} className="lab-gl" aria-hidden="true" />
      <canvas ref={hudRef} className="lab-hud" aria-hidden="true" />
    </div>
  );
}
