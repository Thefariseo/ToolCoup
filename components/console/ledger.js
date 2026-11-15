// The Model Trace as a ledger: the data model, then the layout in pixels. Pure functions (no React, no WebGL) so they can be tested alone.
//
// Rows, top to bottom: the reference country, the seven groups (largest push first), the logistic model they add up to, the average of
// the models, and the published forecast with its 80% range. Left: a bar per group on a log-probability axis (A). Right: where this
// country sits among all the others on that group (C). The group terms are measured from the reference country, which is the logistic
// model's intercept (about a quarter of a percent), not from the base rate: starting anywhere else needs an unexplained step at the end.

export const GROUP_ORDER = ["storia", "contagio", "regime", "leader", "economia", "piazza", "acled"];
export const GROUP_LABEL = { storia: "Coup history", contagio: "Contagion", regime: "Regime type", leader: "Leaders and elections", economia: "Economy", piazza: "Mobilization", acled: "ACLED signals" };
export const GROUP_SHORT = { storia: "History", contagio: "Contagion", regime: "Regime", leader: "Leaders", economia: "Economy", piazza: "Unrest", acled: "ACLED" };
const logit = (p) => { const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6); return Math.log(q / (1 - q)); };
const expit = (z) => 1 / (1 + Math.exp(-z));

/** groups: [{key, contrib}], components: [{key, probability}], peers: {key: [[value, count], ...]} */
export function ledgerModel({ groups, components, risk, lo, hi, ref, peers, imputed }) {
  if (!groups?.length || ref == null || risk == null) return null;
  const sorted = [...groups].filter((g) => GROUP_ORDER.includes(g.key)).sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));
  let z = logit(ref);
  const steps = sorted.map((g) => {
    const p0 = expit(z); z += g.contrib; const p1 = expit(z);
    const list = peers?.[g.key] || [], total = list.reduce((s, x) => s + x[1], 0);
    const side = g.contrib >= 0 ? "top" : "bottom";
    const beyond = list.filter(([v]) => (side === "top" ? v >= g.contrib - 0.025 : v <= g.contrib + 0.025)).reduce((s, x) => s + x[1], 0);
    return { key: g.key, d: g.contrib, p0, p1, side, share: total ? Math.min(1, beyond / total) : null, list };
  });
  const comps = (components || []).filter((c) => c.probability > 0).map((c) => ({ key: c.key, p: c.probability }));
  return {
    ref, steps, logit: expit(z), comps, imputed: !!imputed,
    avg: comps.length ? expit(comps.reduce((s, c) => s + logit(c.p), 0) / comps.length) : null,
    pub: { p: risk, lo: lo ?? risk, hi: hi ?? risk },
  };
}

const TICKS = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.4];
export const STRIP = { lo: -2.2, hi: 2.4, ticks: [-2, -1, 0, 1, 2] };

/** Positions in pixels for a stage of W by H, plus the boxes (in clip units) that hold the swarm under each bar. */
export function layoutLedger(m, W, H) {
  const compact = W < 720, strips = !compact, pad = 16, labelW = compact ? 100 : 168, numW = compact ? 82 : 100;
  const stripW = strips ? Math.round(Math.min(200, Math.max(140, W * 0.21))) : 0, shareW = strips ? 74 : 0;
  const bx0 = pad + labelW, bx1 = W - pad - numW - (strips ? stripW + shareW + 18 : 0);
  const sx0 = bx1 + numW + 18, sx1 = sx0 + stripW;
  const all = [m.ref, ...m.steps.flatMap((s) => [s.p0, s.p1]), m.logit, m.pub.lo, m.pub.hi, ...(m.avg ? [m.avg] : []), ...m.comps.map((c) => c.p)].filter((p) => p > 0);
  const pmin = Math.min(...all) * 0.8, pmax = Math.max(...all) * 1.25, l0 = Math.log(pmin), l1 = Math.log(pmax);
  const px = (p) => bx0 + ((Math.log(Math.max(p, pmin)) - l0) / (l1 - l0)) * (bx1 - bx0);
  const vx = (v) => sx0 + ((Math.max(STRIP.lo, Math.min(STRIP.hi, v)) - STRIP.lo) / (STRIP.hi - STRIP.lo)) * stripW;

  const nRows = 1 + m.steps.length + 2 + (m.avg ? 1 : 0), top = 112, bottom = 52, rh = Math.max(24, Math.min(42, (H - top - bottom) / nRows));
  const cy = (i) => top + i * rh + rh / 2;
  const rows = []; let i = 0;
  rows.push({ kind: "ref", label: compact ? "Reference" : "Reference country", y: cy(i++), x: px(m.ref), p: m.ref });
  for (const s of m.steps) {
    const y = cy(i++), a = px(s.p0), b = px(s.p1);
    // the others, as a skyline on the row's baseline: bar height grows with the square root of the number of countries in that bucket
    const nmax = Math.max(1, ...s.list.map((q) => q[1])), maxH = Math.min(22, rh * 0.62), base = y + rh * 0.28;
    rows.push({ kind: "group", key: s.key, label: (compact ? GROUP_SHORT : GROUP_LABEL)[s.key], y, xa: a, xb: b, s, base,
      bars: s.list.map(([v, n]) => ({ x: vx(v), h: Math.max(1.5, maxH * Math.sqrt(n / nmax)), n })), mark: vx(s.d), p: s.p1 });
  }
  rows.push({ kind: "logit", label: compact ? "Logistic" : "Logistic model", y: cy(i++), x: px(m.logit), p: m.logit });
  if (m.avg) rows.push({ kind: "avg", label: compact ? "Average" : `Average of ${m.comps.length} models`, y: cy(i++), x: px(m.avg), p: m.avg });
  rows.push({ kind: "pub", label: compact ? "Published" : "Published, calibrated", y: cy(i++), x: px(m.pub.p), xl: px(m.pub.lo), xh: px(m.pub.hi), p: m.pub.p, lo: m.pub.lo, hi: m.pub.hi });
  const avgY = rows.find((r) => r.kind === "avg")?.y ?? rows.at(-1).y;
  const comps = m.comps.map((c) => ({ ...c, x: px(c.p), y: avgY }));

  // swarm boxes in clip units; class k+1 belongs to GROUP_ORDER[k]. The weight is the share of particles: area times density.
  const half = Math.min(11, rh * 0.34);
  const cx = (x) => (x / W) * 2 - 1, cyc = (y) => 1 - (y / H) * 2, hh = (px_) => (px_ * 2) / H;   // a distance in pixels, in clip units
  const weight = (lo, hi, dens) => Math.max(0.02, ((hi - lo) * half * 2 * dens) / 1000);
  const boxes = Array.from({ length: 9 }, () => ({ x0: 0, x1: 0, y: 0, h: hh(half), dir: 0, w: 0.02 }));
  const ref = rows[0];
  boxes[0] = { x0: cx(ref.x - 8), x1: cx(ref.x + 8), y: cyc(ref.y), h: hh(half), dir: 0, w: weight(0, 16, 0.6) };
  for (const r of rows.filter((q) => q.kind === "group")) {
    const k = GROUP_ORDER.indexOf(r.key) + 1, lo = Math.min(r.xa, r.xb), hi = Math.max(r.xa, r.xb, lo + 6);
    boxes[k] = { x0: cx(lo), x1: cx(hi), y: cyc(r.y), h: hh(half), dir: Math.abs(r.s.d) < 0.02 ? 0 : Math.sign(r.s.d), w: weight(lo, hi, 0.5 + Math.min(1.5, Math.abs(r.s.d))) };
  }
  const pub = rows.at(-1), plo = Math.min(pub.xl, pub.xh), phi = Math.max(pub.xl, pub.xh, plo + 6);
  boxes[8] = { x0: cx(plo), x1: cx(phi), y: cyc(pub.y), h: hh(half), dir: 0, w: weight(plo, phi, 0.6) };

  // axis ticks: as many as fit with 44 px between labels
  const axis = []; let lastX = -1e9;
  for (const p of TICKS) { if (p <= pmin * 1.05 || p >= pmax * 0.97) continue; const x = px(p); if (x - lastX >= 44) { axis.push({ x, p }); lastX = x; } }
  const foot = compact
    ? [m.imputed ? "No structural record: these terms are imputed." : "Terms run from a reference country, not the base rate.", "Associations, not causes. Tap a row for its drivers."]
    : [m.imputed ? "No structural record for this territory: the group terms are imputed, so read them with caution."
        : "Group terms are measured from a reference country (the logistic model’s intercept), not from the base rate.",
       "Associations in the training data, not causes. Click a row to list its drivers on the right."];
  return {
    W, H, rows, comps, strips, compact, legend: !compact && sx0 - (bx0 + 186 + 136) > 12, bx0, bx1, sx0, sx1, numX: bx1 + 14, shareX: sx1 + 8, top, rh, boxes, axis, foot, imputed: m.imputed,
    core: { x: cx(pub.x), y: cyc(pub.y), r: (rh * 0.26) / (H / 2), w: 0.08 },
    stripAxis: strips ? STRIP.ticks.map((v) => ({ x: vx(v), v })) : [],
  };
}
