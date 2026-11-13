/* Geometry for the three views of the instrument. Pure functions: data in, particle targets out.
 *
 * Every particle carries a target in each view, so switching view is a morph of the same matter.
 * Field and atlas particles keep the same month and signal in both views: when the field bends into
 * the ring, each month's matter travels to its own place on the ring. Nothing here adds observations:
 * particle counts and positions are functions of the monthly counts, plus a fixed pseudo-random seed
 * that only spreads points inside the shape the data defines. */

export const CH = [
  { key: "unrest", name: "Protests & riots", short: "UNREST", color: "#d9773d" },
  { key: "violence", name: "Political violence", short: "VIOLENCE", color: "#e6c46e" },
  { key: "fatalities", name: "Reported fatalities", short: "FATALITIES", color: "#b9afe2" },
];
export const STRIDE = 20; // aF(4) aA(4) aT(4) aX(4) aY(4)
const TAU = Math.PI * 2;

/** Deterministic generator: the same inputs always give the same cloud. */
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
export function smooth(arr, sigma) {
  const r = Math.ceil(sigma * 3), k = []; let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
  return arr.map((_, i) => { let acc = 0; for (let j = -r; j <= r; j++) acc += arr[Math.max(0, Math.min(arr.length - 1, i + j))] * k[j + r]; return acc / sum; });
}
/** Value of a per-month series at fractional month u (months are centred at m + .5). */
export function at(arr, u) {
  const M = arr.length, x = Math.max(0, Math.min(M - 1, u - 0.5)), i = Math.floor(x), k = x - i, s = k * k * (3 - 2 * k);
  return arr[i] * (1 - s) + arr[Math.min(M - 1, i + 1)] * s;
}

/* ------------------------------------------------------------------ signals */
export function signals(rows, layers) {
  const M = rows.length;
  const active = CH.map((c) => layers.includes(c.key));
  const nActive = Math.max(1, active.filter(Boolean).length);
  const max = CH.map((c) => Math.max(1, ...rows.map((r) => r[c.key])));
  const I = CH.map((c, k) => rows.map((r) => (active[k] ? Math.log1p(r[c.key]) / Math.log1p(max[k]) : 0)));
  const T = rows.map((r) => CH.reduce((n, c, k) => n + (active[k] ? r[c.key] : 0), 0));
  const total = T.reduce((a, b) => a + b, 0);
  const C = new Float64Array(M + 1);                       // cumulative share of all events, at month boundaries
  for (let m = 0; m < M; m++) C[m + 1] = C[m] + (total > 0 ? T[m] / total : 1 / M);
  const Is = I.map((a) => smooth(a, 2.2));                 // atlas shape: smoothed over ~2 months (documented)
  const L = rows.map((_, m) => (Is[0][m] + Is[1][m] + Is[2][m]) / nActive);
  const meanL = L.reduce((a, b) => a + b, 0) / M;
  const cumD = new Float64Array(M + 1);                    // cumulative month-to-month change -> twist
  for (let m = 0; m < M; m++) cumD[m + 1] = cumD[m] + (m ? Math.abs(L[m] - L[m - 1]) : 0);
  const Dmax = Math.max(1e-6, cumD[M]);
  const tilt = rows.map((_, m) => ((Is[1][m] + Is[2][m]) / 2 - Is[0][m]));  // violence vs protest balance
  const cum = new Float64Array(M + 1);
  for (let m = 0; m < M; m++) cum[m + 1] = cum[m] + T[m];
  return { M, active, max, I, Is, T, total, C, L, meanL, cumD, Dmax, tilt, cum };
}

/* ------------------------------------------------------------------ field: cumulative record */
export function fieldLayout(S, W, H) {
  const narrow = W < 620;
  const Wmax = Math.min(W, H) * (narrow ? 0.2 : 0.24);
  const x0 = narrow ? 34 : 70, yT = narrow ? 58 : 66;
  const x1 = W - Wmax * 1.15 - (narrow ? 14 : 30), yB = H - Wmax * 1.12 - (narrow ? 44 : 50);
  // normals from a lightly smoothed cumulative curve, so the band does not kink at month boundaries
  const Cs = smooth(Array.from(S.C), 1.6);
  const pt = (i) => [x0 + (i / S.M) * (x1 - x0), yB - Cs[i] * (yB - yT)];
  const nx = new Float64Array(S.M + 1), ny = new Float64Array(S.M + 1);
  for (let i = 0; i <= S.M; i++) {
    const a = pt(Math.max(0, i - 1)), b = pt(Math.min(S.M, i + 1));
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    nx[i] = -ty; ny[i] = tx;                               // outward: below on the flat part, right on the steep part
  }
  return { x0, x1, yT, yB, Wmax, narrow, nx, ny };
}
export function spine(S, F, u) {
  const m = Math.max(0, Math.min(S.M - 1e-9, u)), i = Math.floor(m), f = m - i;
  const c = S.C[i] + (S.C[i + 1] - S.C[i]) * f;
  return [F.x0 + (u / S.M) * (F.x1 - F.x0), F.yB - c * (F.yB - F.yT)];
}
function normal(S, F, u) {
  const m = Math.max(0, Math.min(S.M, u)), i = Math.min(S.M - 1, Math.floor(m)), f = m - i;
  let x = F.nx[i] * (1 - f) + F.nx[i + 1] * f, y = F.ny[i] * (1 - f) + F.ny[i + 1] * f; const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}
/** Widths of the three layers at u: monthly log intensity, each up to a third of the band. */
function widths(S, F, u) {
  const min = 1.1;
  return CH.map((_, k) => (S.active[k] ? min + (F.Wmax / 3) * at(S.I[k], u) : 0));
}

/* ------------------------------------------------------------------ atlas: geometric signature */
export const RING = { fibers: 13, rot0: 0.62, tilt: 0.78, dist: 3.6 };
export function ringCentre(S, u) {
  const th = (u / S.M) * TAU - Math.PI / 2;
  const R = 1 + 0.17 * (at(S.L, u) - S.meanL);
  return [R * Math.cos(th), 0.24 * at(S.tilt, u), R * Math.sin(th), th];
}
function ringPoint(S, u, k, j) {
  const [cx, cy, cz, th] = ringCentre(S, u);
  const m = Math.max(0, Math.min(S.M, u)), i = Math.min(S.M - 1, Math.floor(m)), f = m - i;
  const twist = TAU * (0.5 * (u / S.M) + 1.25 * ((S.cumD[i] + (S.cumD[i + 1] - S.cumD[i]) * f) / S.Dmax));
  const phi = (k * TAU) / 3 + (TAU * j) / RING.fibers + twist;
  const rho = 0.06 + 0.2 * at(S.Is[k], u);
  const c = Math.cos(phi) * rho;
  return [cx + c * Math.cos(th), cy + Math.sin(phi) * rho, cz + c * Math.sin(th)];
}
/** Same projection as the vertex shader; used for annotations and hit testing. */
export function project(q, cam, W, H) {
  const cr = Math.cos(cam.rot), sr = Math.sin(cam.rot), ct = Math.cos(RING.tilt), st = Math.sin(RING.tilt);
  const ax = q[0] * cr + q[2] * sr, ay = q[1], az = -q[0] * sr + q[2] * cr;
  const by = ay * ct - az * st, bz = ay * st + az * ct, k = RING.dist / (RING.dist + bz);
  return [cam.cx + ax * cam.scale * k, cam.cy - by * cam.scale * k, k];
}
export function camera(W, H, rot) {
  const narrow = W < 620;
  return { rot, cx: W * 0.5, cy: H * (narrow ? 0.49 : 0.48), scale: Math.min(W * (narrow ? 0.3 : 0.32), H * 0.44) };
}

/* ------------------------------------------------------------------ trace: evidence graph */
const SRC_OF = { storia: ["coups"], contagio: ["coups"], acled: ["acled"], piazza: ["vdem"], regime: ["vdem"], leader: ["vdem"], economia: ["wb", "vdem"], tempo: [] };
export function traceLayout(model, country, W, H) {
  const narrow = W < 620, pad = narrow ? 12 : 40;
  const Y = { src: H * 0.075, feat: H * 0.3, grp: H * 0.53, cmp: H * 0.69, ens: H * 0.78, cal: H * 0.85, out: H * 0.915 };
  const feats = model.features.map((f) => ({ ...f }));
  const groups = model.groups.map((g) => ({ ...g }));
  let u = 0; const units = feats.length + (groups.length - 1) * 1.8;
  feats.forEach((f, i) => { if (i && f.group !== feats[i - 1].group) u += 1.8; f.x = pad + ((u + 0.5) / units) * (W - 2 * pad); f.y = Y.feat; u += 1; });
  const byLabel = new Map(feats.map((f) => [f.label, f]));
  groups.forEach((g) => { const fs = feats.filter((f) => f.group === g.key); g.x = fs.reduce((n, f) => n + f.x, 0) / Math.max(1, fs.length); g.y = Y.grp; });
  const gByKey = new Map(groups.map((g) => [g.key, g]));
  const srcDefs = [["coups", ["storia", "contagio"]], ["acled", ["acled"]], ["vdem", ["piazza", "regime", "leader"]], ["wb", ["economia"]]];
  const sources = srcDefs.map(([key, gs]) => { const fs = feats.filter((f) => gs.includes(f.group));
    return { key, x: fs.reduce((n, f) => n + f.x, 0) / Math.max(1, fs.length), y: Y.src }; });
  const sByKey = new Map(sources.map((s) => [s.key, s]));
  const spread = Math.min(78, W * 0.075);
  const comps = [["logit", -1], ["gbm", 0], ["rf", 1]].map(([key, o]) => ({ key, x: W / 2 + o * spread, y: Y.cmp }));
  const ens = { key: "ensemble", x: W / 2, y: Y.ens }, cal = { key: "calibration", x: W / 2, y: Y.cal }, out = { key: "forecast", x: W / 2, y: Y.out };

  const edges = [];   // {a, b, la, lb, fibers, path, code, w}
  const add = (a, b, la, lb, fibers) => { const e = { a, b, la, lb, fibers, path: false, code: -0.55, w: 0 }; edges.push(e); return e; };
  const freqMax = Math.max(1, ...feats.map((f) => f.freq));
  for (const f of feats) {
    for (const s of SRC_OF[f.group] || []) add(sByKey.get(s), f, 0, 1, 1 + Math.round((2 * f.freq) / freqMax));
    add(f, gByKey.get(f.group), 1, 2, 1 + Math.round((9 * f.freq) / freqMax));
  }
  for (const g of groups) for (const c of comps) add(g, c, 2, 3, c.key === "logit" ? 4 : 3);
  for (const c of comps) add(c, ens, 3, 4, 6);
  add(ens, cal, 4, 5, 8); add(cal, out, 5, 6, 8);

  // the selected country's evidence: top contributions of the linear component
  const drivers = (country?.drivers || []).map((d) => ({ ...d, f: byLabel.get(d.label) })).filter((d) => d.f);
  const dmax = Math.max(1e-6, ...drivers.map((d) => Math.abs(d.contrib)));
  const gContrib = new Map((country?.groups || []).map((g) => [g.key, g.contrib]));
  const gmax = Math.max(1e-6, ...[...gContrib.values()].map(Math.abs));
  const lit = new Set();
  const light = (a, b, w, code) => { const e = edges.find((x) => x.a === a && x.b === b); if (e) { e.path = true; e.w = Math.max(e.w, w); e.code = code; lit.add(a); lit.add(b); } };
  const usedGroups = new Set();
  for (const d of drivers) {
    const code = d.contrib >= 0 ? 0.8 : 1.62, w = Math.abs(d.contrib) / dmax;
    for (const s of SRC_OF[d.f.group] || []) light(sByKey.get(s), d.f, w * 0.7, code);
    light(d.f, gByKey.get(d.f.group), w, code); usedGroups.add(d.f.group);
  }
  for (const key of usedGroups) { const c = gContrib.get(key) ?? 0; light(gByKey.get(key), comps[0], Math.abs(c) / gmax, c >= 0 ? 0.8 : 1.62); }
  if (drivers.length) { for (const c of comps) light(c, ens, c.key === "logit" ? 1 : 0.45, 0.97); light(ens, cal, 1, 0.97); light(cal, out, 1, 0.97); }

  // every edge becomes one or more hair-like fibres (cubic curves with jittered handles)
  const rand = rng(97 + feats.length * 13 + Math.round(W) * 7 + Math.round(H));
  const fibres = [];
  for (const e of edges) {
    const n = e.path ? Math.max(e.fibers, 3) : e.fibers;
    for (let i = 0; i < n; i++) {
      const j = () => (rand() - 0.5) * 2;
      const dy = e.b.y - e.a.y, sx = (e.path ? 0.35 : 1) * spread * 0.22;
      const c1 = [e.a.x + j() * sx, e.a.y + dy * (0.42 + j() * 0.12)], c2 = [e.b.x + j() * sx, e.b.y - dy * (0.42 + j() * 0.12)];
      const len = Math.hypot(e.b.x - e.a.x, dy) * 1.15;
      fibres.push({ e, p0: [e.a.x, e.a.y], c1, c2, p1: [e.b.x, e.b.y], len });
    }
  }
  return { feats, groups, sources, comps, ens, cal, out, edges, fibres, drivers, lit, Y, gContrib };
}
export function bezier(f, s) {
  const u = 1 - s, a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
  return [a * f.p0[0] + b * f.c1[0] + c * f.c2[0] + d * f.p1[0], a * f.p0[1] + b * f.c1[1] + c * f.c2[1] + d * f.p1[1]];
}

/* ------------------------------------------------------------------ particles */
export function buildParticles({ S, rows, events, W, H, budget, seed, trace }) {
  const rand = rng(seed);
  const F = fieldLayout(S, W, H);
  const evMonths = [];
  const index = new Map(rows.map((r, i) => [r.date, i]));
  for (const e of events) { const i = index.get(e.date.slice(0, 7)); if (i != null) evMonths.push(i); }
  const perEvent = 70, nEvt = evMonths.length * perEvent;
  let sumW = 0;
  for (let m = 0; m < S.M; m++) for (let k = 0; k < 3; k++) if (S.active[k]) sumW += 0.2 + S.I[k][m];
  const nMain = Math.max(0, budget - nEvt);
  const data = new Float32Array((nMain + nEvt + S.M * 3 + 64) * STRIDE);
  let n = 0;
  const put = (fx, fy, fcode, fdisp, a, acode, falpha, aalpha, t, evt) => {
    if (n + STRIDE > data.length) return;
    data[n] = fx; data[n + 1] = fy; data[n + 2] = fcode; data[n + 3] = fdisp;
    data[n + 4] = a[0]; data[n + 5] = a[1]; data[n + 6] = a[2]; data[n + 7] = acode;
    data[n + 12] = rand(); data[n + 13] = t; data[n + 14] = falpha; data[n + 15] = aalpha;
    data[n + 18] = evt; n += STRIDE;
  };
  const outer = [2, 1, 0].find((k) => S.active[k]);
  for (let m = 0; m < S.M; m++) for (let k = 0; k < 3; k++) {
    if (!S.active[k] || sumW <= 0) continue;
    const count = Math.round((nMain * (0.2 + S.I[k][m])) / sumW);
    for (let i = 0; i < count; i++) {
      const u = m + rand(), p = spine(S, F, u), nrm = normal(S, F, u), wd = widths(S, F, u);
      let start = 0; for (let j = 0; j < k; j++) start += wd[j];
      const r = Math.pow(rand(), 0.92); let d = start + r * wd[k], code, disp = 0;
      const span = [[0.05, 0.31], [0.38, 0.3], [1.02, 0.5]][k];
      code = span[0] + span[1] * r;
      if (k === outer && rand() < 0.06 + 0.26 * at(S.I[k], u)) {                 // evaporation: scales with the outer signal
        const e = -Math.log(1 - rand() * 0.985);
        d = start + wd[k] + e * F.Wmax * (0.05 + 0.3 * at(S.I[k], u));
        disp = Math.min(1, e / 3); code = k === 2 ? 1.5 + 0.48 * rand() : 0.85 + 0.12 * rand();
      }
      const tj = (rand() - 0.5) * 1.6;
      const fx = p[0] + nrm[0] * d - nrm[1] * tj, fy = p[1] + nrm[1] * d + nrm[0] * tj;
      const q = ringPoint(S, u, k, Math.floor(rand() * RING.fibers));
      const jit = () => (rand() - 0.5) * 0.006;
      put(fx, fy, code, disp, [q[0] + jit(), q[1] + jit(), q[2] + jit()], [0.26, 0.6, 1.42][k], 1, 1, u / S.M, 0);
    }
  }
  for (const m of evMonths) for (let i = 0; i < perEvent; i++) {                // recorded coups: bright knots on the spine
    const u = m + 0.5 + (rand() - 0.5) * 0.4, p = spine(S, F, u), a = rand() * Math.PI * 2, r = Math.pow(rand(), 1.4) * 4;
    const c = ringCentre(S, u), rr = Math.pow(rand(), 1.6) * 0.035, b = rand() * Math.PI * 2;
    put(p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, 0.99, 0, [c[0] + Math.cos(a) * rr, c[1] + Math.sin(b) * rr, c[2] + Math.sin(a) * rr], 0.99, 1, 1, u / S.M, 1);
  }
  const count = n / STRIDE;
  // trace targets: a quarter of the matter lights the country's path, the rest draws the whole graph
  if (trace) {
    const pick = (list, weight) => { const cdf = []; let s = 0; for (const x of list) { s += weight(x); cdf.push(s); }
      return () => { const x = rand() * s; let lo = 0, hi = cdf.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < x) lo = mid + 1; else hi = mid; } return list[lo]; }; };
    const bg = trace.fibres, path = trace.fibres.filter((f) => f.e.path);
    const pickBg = pick(bg, (f) => f.len), pickPath = path.length ? pick(path, (f) => f.len * (0.25 + f.e.w)) : null;
    for (let i = 0; i < count; i++) {
      const o = i * STRIDE, onPath = pickPath && rand() < 0.27, f = onPath ? pickPath() : pickBg();
      const s = rand(), pt = bezier(f, s), jx = (rand() - 0.5) * (onPath ? 1.4 : 0.9), jy = (rand() - 0.5) * 0.9;
      data[o + 8] = pt[0] + jx; data[o + 9] = pt[1] + jy;
      data[o + 10] = onPath ? f.e.code : -0.5 - 0.2 * rand();
      data[o + 11] = onPath ? 0.5 + 0.35 * f.e.w : 0.13;
      data[o + 16] = (f.e.la + s * (f.e.lb - f.e.la)) / 6; data[o + 17] = onPath ? 1 : 0;
    }
  }
  return { data: data.subarray(0, n), count, F };
}
