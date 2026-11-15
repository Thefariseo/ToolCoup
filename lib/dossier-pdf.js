// Four-page country brief in the style of an asset-manager policy note: a cover (lib/dossier-cover.js), then a scorecard of five figures each with its own small chart,
// where the country sits among all others, the forecast since 1975 with every recorded attempt on a rail, the Model Trace as a ledger (reference
// country to published forecast, with where the country sits on each group), prediction market against model, ACLED activity and the violence
// forecast with its band, signposts as gauges against their alert levels, scenarios and a section for the reader. The frame, the signposts and the
// closest cases come from fixed rules over our data.
// Layout is fixed (A4, cover plus three pages): every text box is measured and the type scale is reduced until each page fits.
// Numbers come from `facts` and `chart`, never from the narrative; model internals (coefficients, log-odds) are not printed.
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { PRESS_SOURCES } from "@/lib/dossier";
import { LENSES } from "@/lib/dossier-profile";
import { drawCover } from "@/lib/dossier-cover";

const W = 595.28, H = 841.89, M = 34, CW = W - 2 * M, FOOT = 34;
const NAVY = rgb(0.06, 0.13, 0.21), INK = rgb(0.1, 0.12, 0.14), MUTED = rgb(0.38, 0.43, 0.46), RULE = rgb(0.8, 0.83, 0.85), SOFT = rgb(0.94, 0.953, 0.96),
  ACC = rgb(0.03, 0.42, 0.4), AMBER = rgb(0.8, 0.47, 0.02), CYAN = rgb(0.04, 0.48, 0.64), RED = rgb(0.76, 0.2, 0.14), GREEN = rgb(0.1, 0.48, 0.3), WHITE = rgb(1, 1, 1), GREY = rgb(0.72, 0.76, 0.78), GREYD = rgb(0.56, 0.61, 0.64);

const FONT_FILES = { sans: "IBMPlexSans-Regular", sansB: "IBMPlexSans-SemiBold", serif: "IBMPlexSerif-Regular", serifB: "IBMPlexSerif-SemiBold", mono: "IBMPlexMono-Regular", monoB: "IBMPlexMono-Medium" };
const MAP = { "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "▲": "up", "▼": "down", "×": "x", " ": " ", "‑": "-", "‐": "-" };

const pct = (v, d = 1) => (v == null ? "-" : `${(v * 100).toFixed(d)}%`);
const pp = (v) => (v >= 0.1 ? `${(v * 100).toFixed(0)}%` : v >= 0.01 ? `${(v * 100).toFixed(1)}%` : `${(v * 100).toFixed(2)}%`);   // a probability with the digits its size needs
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sign = (v, d = 2) => (v == null ? "-" : `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(d)}`);
const GROUPS = [["storia", "Coup history"], ["contagio", "Regional contagion"], ["regime", "Regime type"], ["leader", "Leader & elections"], ["economia", "Economy"], ["piazza", "Mobilization"], ["acled", "Recent ACLED signals"]];
const VERDICT = { converge: ["CONVERGE", GREEN], diverge: ["DIVERGE", RED], gap: ["BLIND SPOT", AMBER] };

export async function buildPdf({ facts, chart, narrative, press, model, generated, flag }) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Praevex country brief - ${facts.country.name}`); pdf.setAuthor("Praevex"); pdf.setCreator("Praevex"); pdf.setSubject(`Issue ${facts.forecast.issue}`);
  const F = {};
  for (const [k, file] of Object.entries(FONT_FILES)) F[k] = await pdf.embedFont(await fs.readFile(path.join(process.cwd(), "assets", "fonts", `${file}.ttf`)), { subset: true });
  const known = new Set(F.sans.getCharacterSet());
  const clean = (s) => {
    let out = "";
    for (const ch of String(s ?? "").normalize("NFC")) {
      const c = MAP[ch] ?? ch;
      for (const x of c) {
        if (/\s/.test(x)) { out += " "; continue; }
        if (known.has(x.codePointAt(0))) { out += x; continue; }
        const base = x.normalize("NFD").replace(/[̀-ͯ]/g, "");
        out += known.has(base.codePointAt(0)) ? base : "";
      }
    }
    return out.replace(/ +/g, " ").trim();
  };
  const flagImg = flag ? await pdf.embedPng(flag).catch(() => null) : null;
  // the logo, black ink on paper: the lockup in the running head, the statue alone in the foot (scripts/build-brand.py)
  const brandFile = (n) => fs.readFile(path.join(process.cwd(), "public", "brand", n)).then((b) => pdf.embedPng(b)).catch(() => null);
  const [logoLockup, logoMark] = await Promise.all([brandFile("praevex-lockup-light.png"), brandFile("praevex-mark-light-sm.png")]);
  const coverPage = pdf.addPage([W, H]);
  const pages = [pdf.addPage([W, H]), pdf.addPage([W, H]), pdf.addPage([W, H])];       // the three inside pages, numbered 2 to 4
  const fc = facts.forecast, name = facts.country.name;

  // ---------------------------------------------------------------- drawing kit (top-based coordinates)
  function kit(page, dry, s) {
    const Y = (top) => H - top;
    const w = (t, f, size) => F[f].widthOfTextAtSize(t, size);
    const wrap = (text, f, size, width) => {
      const out = []; let ln = "";
      for (const word of clean(text).split(" ")) {
        const t = ln ? `${ln} ${word}` : word;
        if (w(t, f, size) <= width || !ln) ln = t; else { out.push(ln); ln = word; }
      }
      if (ln) out.push(ln);
      return out;
    };
    const ell = (t, f, size, width) => { let x = t; while (x.length > 1 && w(`${x}...`, f, size) > width) x = x.slice(0, -1).trimEnd(); return `${x}...`; };
    const text = (t, x, top, { f = "sans", size = 8.5, color = INK, right = false, max } = {}) => {
      let c = clean(t); if (max && w(c, f, size) > max) c = ell(c, f, size, max);
      if (!dry && c) page.drawText(c, { x: right ? x - w(c, f, size) : x, y: Y(top + size * 0.82), font: F[f], size, color });
      return w(c, f, size);
    };
    const line = (x1, t1, x2, t2, { color = RULE, t = 0.5, dash, opacity } = {}) => { if (!dry) page.drawLine({ start: { x: x1, y: Y(t1) }, end: { x: x2, y: Y(t2) }, thickness: t, color, dashArray: dash, opacity }); };
    // filled polygon from [x, top] points (an area, a band, a diamond)
    const poly = (pts, opt = {}) => { if (dry || pts.length < 3) return; page.drawSvgPath(`M ${pts.map(([x, t]) => `${x.toFixed(2)} ${t.toFixed(2)}`).join(" L ")} Z`, { x: 0, y: H, ...opt }); };
    const rect = (x, top, width, height, opt = {}) => { if (!dry) page.drawRectangle({ x, y: Y(top + height), width, height, ...opt }); };
    const dot = (x, top, size, opt) => { if (!dry) page.drawCircle({ x, y: Y(top), size, ...opt }); };
    // wrapped paragraph; returns its height. Lines beyond maxLines are cut with an ellipsis.
    const para = (t, { x = M, top, width = CW, f = "sans", size = 8.6, color = INK, lh = 1.4, maxLines = 99 } = {}) => {
      const sz = size * s, step = sz * lh; let lines = wrap(t, f, sz, width);
      if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = ell(lines[maxLines - 1], f, sz, width); }
      lines.forEach((ln, i) => text(ln, x, top + i * step, { f, size: sz, color }));
      return lines.length * step;
    };
    const lines = (t, f, size, width) => wrap(t, f, size * s, width).length;
    const heading = (t, top, { note, x = M, width = CW } = {}) => {
      const tw = text(t.toUpperCase(), x, top, { f: "monoB", size: 7.2, color: ACC });
      if (note) text(note, x + width, top + 0.2, { size: 6.8, color: MUTED, right: true, max: width - tw - 12 });
      line(x, top + 11.5, x + width, top + 11.5, { color: NAVY, t: 0.8 });
      return 17;
    };
    return { Y, w, wrap, text, line, rect, dot, poly, para, lines, heading, ell, s };
  }

  // ---------------------------------------------------------------- figures
  // Every figure draws through the kit (so the measuring pass stays silent), takes its position and width, and returns the height it used.
  const NOW = (() => { const [y, m] = facts.forecast.data_through.split("-").map(Number); return y + ((m || 12) - 0.5) / 12; })();
  const R = chart.risk, baseRate = chart.baseRate;
  const logAxis = (p0, p1, x0, x1) => (p) => x0 + ((Math.log(Math.max(p, p0)) - Math.log(p0)) / (Math.log(p1) - Math.log(p0))) * (x1 - x0);

  // --- scorecard: five figures, each with the small chart that explains it
  const miniGauge = (k, x, top, w) => {                                     // probability on a log scale, 80% range, base rate
    const px = logAxis(0.001, 0.3, x, x + w), y = top + 7;
    k.line(x, y, x + w, y, { color: RULE, t: 0.8 });
    for (const t of [0.01, 0.1]) { k.line(px(t), y - 2, px(t), y + 2, { color: GREYD, t: 0.5 }); k.text(pp(t), px(t) - 5, y + 3.5, { size: 5.2, color: MUTED }); }
    if (R.lo != null) k.rect(px(R.lo), y - 3, Math.max(1.5, px(R.hi) - px(R.lo)), 6, { color: ACC, opacity: 0.3 });
    k.line(px(baseRate), y - 5, px(baseRate), y + 5, { color: RED, t: 0.7, dash: [1.2, 1] });
    k.dot(px(R.p), y, 3, { color: ACC });
  };
  const miniRank = (k, x, top, w) => {                                      // where the rank falls on the full list, top tenth shaded
    const y = top + 7, n = fc.of_countries, f = (fc.rank - 1) / Math.max(1, n - 1);
    k.rect(x, y - 3, w * 0.1, 6, { color: ACC, opacity: 0.2 });
    k.line(x, y, x + w, y, { color: RULE, t: 0.8 });
    k.line(x + w * 0.1, y - 4, x + w * 0.1, y + 4, { color: GREYD, t: 0.5 });
    k.dot(x + clamp(f, 0.01, 1) * w, y, 3, { color: NAVY });
    k.text("top 10%", x, y + 3.5, { size: 5.2, color: MUTED });
  };
  const miniSpark = (k, x, top, w, up) => {                                 // the last 24 months of the forecast
    const v = chart.values.slice(-24); if (v.length < 6) return;
    const lo = Math.min(...v), hi = Math.max(...v), span = Math.max(hi - lo, 1e-6), h = 13, col = up ? AMBER : CYAN;
    const px = (i) => x + (i / (v.length - 1)) * (w - 4), py = (val) => top + h - ((val - lo) / span) * h;
    for (let i = 1; i < v.length; i++) k.line(px(i - 1), py(v[i - 1]), px(i), py(v[i]), { color: NAVY, t: 0.8 });
    k.dot(px(v.length - 1), py(v.at(-1)), 2.3, { color: col });
  };
  const miniMultiple = (k, x, top, w, m) => {                               // times the base rate, against 1x
    const y = top + 7, f = Math.min(m, 10) / 10;
    k.rect(x, y - 3, w, 6, { color: WHITE, borderColor: RULE, borderWidth: 0.5 });
    k.rect(x, y - 3, Math.max(1, w * f), 6, { color: ACC, opacity: 0.85 });
    k.line(x + w * 0.1, y - 5, x + w * 0.1, y + 5, { color: RED, t: 0.7, dash: [1.2, 1] });
    k.text("1x", x + w * 0.1 - 2.5, y + 5.2, { size: 5.2, color: RED });
  };
  const miniRail = (k, x, top, w) => {                                      // the last ten years, every attempt marked
    const y = top + 7, t0 = NOW - 10, tx = (t) => x + ((t - t0) / 10) * w;
    k.line(x, y, x + w, y, { color: RULE, t: 0.8 });
    for (const yr of [Math.ceil(t0 / 5) * 5, Math.ceil(t0 / 5) * 5 + 5]) if (yr < NOW) { k.line(tx(yr), y - 2, tx(yr), y + 2, { color: GREYD, t: 0.5 }); k.text(String(yr), tx(yr) - 6, y + 3.5, { size: 5.2, color: MUTED }); }
    const ev = chart.record.filter((e) => e.t >= t0);
    ev.forEach((e) => k.dot(tx(e.t), y, 2.6, e.outcome === "successful" ? { color: RED } : { color: WHITE, borderColor: AMBER, borderWidth: 1 }));
    if (!ev.length) k.text("none in ten years", x, y - 10, { size: 6, color: MUTED });
  };
  const scorecard = (k, top) => {
    const h = 78, cw = CW / 5, cr = facts.coup_record, kf = Object.fromEntries((facts.key_figures || []).map((m) => [m.metric, m]));
    const d3 = fc.probability_3_months_ago == null ? null : (fc.probability_of_at_least_one_coup_attempt - fc.probability_3_months_ago) * 100;
    const sinceLast = kf["Since the last attempt"];
    const cells = [
      ["PROBABILITY / 6 MO", pct(fc.probability_of_at_least_one_coup_attempt, 1), `80% range ${pct(fc.interval_80[0], 1)} to ${pct(fc.interval_80[1], 1)}`, (x, t, w) => miniGauge(k, x, t, w), ACC],
      ["RANK", `${fc.rank} / ${fc.of_countries}`, `${facts.region.name}: mean ${pct(facts.region.mean_probability, 1)}`, (x, t, w) => miniRank(k, x, t, w), NAVY],
      ["3-MONTH CHANGE", d3 == null ? "-" : `${sign(d3, 1)} pp`, d3 == null ? "" : `from ${pct(fc.probability_3_months_ago, 1)}, last 24 months`, (x, t, w) => d3 != null && miniSpark(k, x, t, w, d3 >= 0), d3 == null ? NAVY : d3 >= 0 ? AMBER : CYAN],
      ["TIMES THE BASE RATE", `${fc.multiple_of_base_rate}x`, `base rate ${pct(fc.base_rate, 1)}`, (x, t, w) => miniMultiple(k, x, t, w, fc.multiple_of_base_rate), NAVY],
      ["SINCE LAST ATTEMPT", sinceLast ? sinceLast.value.replace(" yrs", " y").replace(" yr", " y") : "none", cr.last ? `${cr.last.date.slice(0, 4)} (${cr.last.type === "riuscito" ? "successful" : "failed"}); ${cr.attempts_since_1900_confidence_A_to_C} since 1900` : "no recorded attempt", (x, t, w) => miniRail(k, x, t, w), NAVY],
    ];
    k.rect(M, top, CW, h, { color: SOFT });
    cells.forEach(([lab, val, sub, mini, col], i) => {
      const x = M + i * cw + 9, w = cw - 18;
      if (i) k.line(M + i * cw, top + 8, M + i * cw, top + h - 8, { color: RULE });
      k.text(lab, x, top + 8, { f: "mono", size: 5.8, color: MUTED });
      k.text(val, x, top + 18, { f: "monoB", size: i === 0 ? 18 : 15, color: col });
      mini(x, top + 40, w);
      k.para(sub, { x, top: top + 62, width: w, size: 6.3, color: MUTED, lh: 1.22, maxLines: 2 });
    });
    return h;
  };

  // --- where the country sits among every other country (log scale; each country a dot, stacked where they crowd)
  const positionStrip = (k, x, top, width) => {
    const all = chart.all, ps = all.map((c) => c.p).filter((p) => p > 0), pmin = Math.max(Math.min(...ps) * 0.9, 1e-4), pmax = Math.max(...ps, R.hi || 0) * 1.25;
    const px = logAxis(pmin, pmax, x + 4, x + width - 4), base = top + 54, step = 2.7, bins = new Map(), sorted = [...all].sort((a, b) => a.p - b.p);
    k.line(x, base, x + width, base, { color: GREYD, t: 0.6 });
    for (const t of [0.001, 0.01, 0.1]) if (t > pmin && t < pmax) { k.line(px(t), base, px(t), base + 3, { color: GREYD, t: 0.5 }); k.text(pp(t), px(t) - 6, base + 4, { size: 5.8, color: MUTED }); }
    k.line(px(baseRate), top + 6, px(baseRate), base, { color: RED, t: 0.6, dash: [1.6, 1.6] });
    k.text("base rate", px(baseRate) + 2, top + 5, { size: 5.8, color: RED });
    for (const c of sorted) {
      const col = Math.floor((px(c.p) - x) / 2.6), n = bins.get(col) || 0; bins.set(col, n + 1);
      if (c.self || n > 17) continue;
      k.dot(px(c.p), base - 2 - n * step, 1.25, c.region === chart.regionName ? { color: AMBER } : { color: GREYD, opacity: 0.85 });
    }
    const sx = px(R.p), n = bins.get(Math.floor((sx - x) / 2.6)) || 0, sy = base - 2 - Math.min(n, 17) * step - 5;
    k.dot(sx, Math.max(sy, top + 20), 3.4, { color: ACC, borderColor: WHITE, borderWidth: 0.8 });
    const lab = `${name} ${pp(R.p)}`, lw = k.w(clean(lab), "sansB", 7.2), lx = clamp(sx - lw / 2, x, x + width - lw);
    k.text(lab, lx, top - 6, { f: "sansB", size: 7.2, color: ACC });
    k.line(sx, top + 5, sx, Math.max(sy, top + 20) - 3.4, { color: ACC, t: 0.5 });
    const below = all.filter((c) => c.p < R.p).length / all.length;
    return 64 + k.para(`${fc.rank} of ${fc.of_countries}: above ${(below * 100).toFixed(below > 0.99 ? 1 : 0)}% of countries. Amber: ${chart.regionName}.`, { x, top: top + 66, width, size: 6.8, color: MUTED, lh: 1.3, maxLines: 2 });
  };

  // --- the forecast since 1975, with every recorded attempt on a rail under the line
  const chartHistory = (k, x, top, width, h) => {
    const vals = chart.values, n = vals.length; if (n < 24) return 0;
    const hs = facts.own_forecast_history, mx = Math.max(...vals, baseRate * 1.5, 0.01) * 1.04, y0 = +hs.series_from.slice(0, 4), left = 22, base = top + h;
    const px = (i) => x + left + (i / (n - 1)) * (width - left - 4), py = (v) => base - (v / mx) * (h - 6);
    for (const g of [0, mx / 2]) { k.line(x + left, py(g), x + width, py(g), { color: RULE, t: 0.35 }); k.text(g === 0 ? "0" : pp(g), x, py(g) - 3, { size: 5.8, color: MUTED }); }
    k.line(x + left, py(baseRate), x + width, py(baseRate), { color: RED, t: 0.5, dash: [2, 2] });
    k.poly([[px(0), base], ...vals.map((v, i) => [px(i), py(v)]), [px(n - 1), base]], { color: ACC, opacity: 0.1 });
    for (let i = 1; i < n; i++) k.line(px(i - 1), py(vals[i - 1]), px(i), py(vals[i]), { color: NAVY, t: 0.8 });
    const pk = vals.indexOf(Math.max(...vals)), pkx = px(pk);
    k.dot(pkx, py(vals[pk]), 1.8, { color: NAVY });
    const pl = `peak ${pp(vals[pk])}, ${hs.peak_month.slice(0, 4)}`, plw = k.w(clean(pl), "sans", 6);
    k.text(pl, clamp(pkx - plw / 2, x + left, x + width - plw), py(vals[pk]) - 8, { size: 6, color: MUTED });
    k.dot(px(n - 1), py(vals[n - 1]), 2.4, { color: AMBER });
    if (R.lo != null) k.line(px(n - 1) + 3, py(R.lo), px(n - 1) + 3, py(R.hi), { color: AMBER, t: 1.2 });
    const railY = base + 8;
    for (let yr = Math.ceil(y0 / 10) * 10; yr <= +hs.series_to.slice(0, 4); yr += 10) {
      const i = (yr - y0) * 12; if (i >= n) break;
      k.line(px(i), base, px(i), base + 2.5, { color: GREYD, t: 0.5 }); k.text(String(yr), px(i) - 7, base + 12.5, { size: 5.8, color: MUTED });
    }
    k.line(x + left, base, x + width, base, { color: GREYD, t: 0.6 });
    for (const e of chart.events) {
      const i = (+e.date.slice(0, 4) - y0) * 12 + (+e.date.slice(5, 7) - 1); if (i < 0 || i >= n) continue;
      k.dot(px(i), railY, 2, e.outcome === "successful" ? { color: RED } : { color: WHITE, borderColor: RED, borderWidth: 0.8 });
    }
    return h + 22;
  };

  // --- the region: every peer as a lollipop against the base rate and the regional mean
  const chartRegion = (k, x, top, width) => {
    const rows = chart.region, rh = 12.5, lx = 70, bw = width - lx - 26, mx = Math.max(...rows.map((r_) => r_.p), baseRate * 2) * 1.05;
    const pxv = (p) => x + lx + (p / mx) * bw;
    k.line(pxv(baseRate), top - 1, pxv(baseRate), top + rows.length * rh, { color: RED, t: 0.5, dash: [2, 2] });
    const mean = facts.region.mean_probability; if (mean) k.line(pxv(mean), top - 1, pxv(mean), top + rows.length * rh, { color: GREYD, t: 0.5, dash: [1, 2] });
    rows.forEach((r_, i) => {
      const t = top + i * rh;
      k.text(r_.name, x, t + 1.2, { f: r_.self ? "sansB" : "sans", size: 7.2, color: r_.self ? INK : MUTED, max: lx - 5 });
      k.line(x + lx, t + 5.5, pxv(r_.p), t + 5.5, { color: r_.self ? ACC : GREY, t: r_.self ? 1.4 : 0.9 });
      k.dot(pxv(r_.p), t + 5.5, r_.self ? 3 : 2.1, { color: r_.self ? ACC : GREYD });
      k.text(pp(r_.p), pxv(r_.p) + 5, t + 2, { f: "mono", size: 6.3, color: r_.self ? INK : MUTED });
    });
    k.text("base rate", pxv(baseRate) + 2, top + rows.length * rh, { size: 5.8, color: RED });
    if (mean) k.text("region mean", pxv(mean) + 2, top + rows.length * rh + 6, { size: 5.8, color: GREYD });
    return rows.length * rh + 13;
  };

  // --- every recorded attempt since 1900 on one rail: successful above the line, failed below
  const recordRail = (k, x, top, width) => {
    const t0 = 1900, t1 = NOW, px = (t) => x + 4 + ((t - t0) / (t1 - t0)) * (width - 8), y = top + 20, levels = { successful: [], failed: [] };
    k.line(x, y, x + width, y, { color: GREYD, t: 0.7 });
    for (let yr = 1900; yr <= 2025; yr += 25) { k.line(px(yr), y - 2, px(yr), y + 2, { color: GREYD, t: 0.5 }); k.text(String(yr), px(yr) - 7, y + 20, { size: 5.8, color: MUTED }); }
    for (const e of chart.record) {
      const up = e.outcome === "successful", row = levels[e.outcome], xx = px(e.t);
      let lvl = 0; while (row[lvl] != null && xx - row[lvl] < 4.4 && lvl < 3) lvl++;
      row[lvl] = xx;
      const yy = y + (up ? -4.5 - lvl * 4.4 : 4.5 + lvl * 4.4);
      k.dot(xx, yy, 1.9, up ? { color: RED } : { color: WHITE, borderColor: AMBER, borderWidth: 0.9 });
    }
    k.text("successful", x, top + 1, { size: 5.8, color: RED }); k.text("failed", x, y + 8, { size: 5.8, color: AMBER });
    return 44;
  };

  // --- the thirty most similar past country-months: a dot each, filled when an attempt followed within six months
  const waffle = (k, x, top, width) => {
    const a = chart.analogs; if (!a?.k) return 0;
    const n = a.k, hit = Math.round(a.rate * n), cols = 15, gap = (width - 6) / cols;
    for (let i = 0; i < n; i++) {                                            // a unit chart: one dot per case, filled for those followed by an attempt
      const cx = x + 3 + (i % cols) * gap + gap / 2, cy = top + 4 + Math.floor(i / cols) * 11;
      k.dot(cx, cy, 3.3, i < hit ? { color: RED } : { color: WHITE, borderColor: GREYD, borderWidth: 0.8 });
    }
    return 28 + k.para(`In ${hit} of the ${n} most similar past country-months (coup history, regime, leader, economy, region) an attempt followed within six months: ${pct(hit / n, 1)}, against ${pct(a.base, 1)} across the pool. Filled dot: an attempt followed.`, { x, top: top + 26, width, size: 6.6, color: MUTED, lh: 1.3, maxLines: 4 });
  };

  // --- the Model Trace as a ledger: reference country, each group's push, the logistic model, the published forecast
  const ledgerChart = (k, top) => {
    const L = chart.ledger; if (!L) return 0;
    const rows = [{ kind: "ref" }, ...L.steps.map((st) => ({ kind: "group", st })), { kind: "logit" }, ...(L.avg ? [{ kind: "avg" }] : []), { kind: "pub" }];
    const rh = 14.5, bx0 = M + 116, bx1 = M + 326, numX = bx1 + 8, sx0 = M + 416, sx1 = M + CW - 2, y0 = top + 12;
    const all = [L.ref, ...L.steps.flatMap((st) => [st.p0, st.p1]), L.logit, L.pub.lo, L.pub.hi, ...(L.avg ? [L.avg] : []), ...L.comps.map((c) => c.p)].filter((p) => p > 0);
    const pmin = Math.min(...all) * 0.8, pmax = Math.max(...all) * 1.25, px = logAxis(pmin, pmax, bx0, bx1);
    const vx = (v) => sx0 + ((clamp(v, -2.2, 2.4) + 2.2) / 4.6) * (sx1 - sx0), cy = (i) => y0 + i * rh + rh / 2, GL = { storia: "Coup history", contagio: "Contagion", regime: "Regime type", leader: "Leaders and elections", economia: "Economy", piazza: "Mobilization", acled: "ACLED signals" };
    [["GROUP OF VARIABLES", M], ["PROBABILITY, LOG SCALE", bx0], ["RESULT", numX], ["WHERE IT SITS AMONG ALL COUNTRIES", sx0 - 2]].forEach(([t, x]) => k.text(t, x, top, { f: "mono", size: 5.6, color: MUTED, max: x === sx0 - 2 ? sx1 - sx0 + 4 : 150 }));
    for (const t of [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2]) if (t > pmin * 1.05 && t < pmax * 0.95) {
      k.line(px(t), y0, px(t), y0 + rows.length * rh, { color: RULE, t: 0.3 }); k.text(pp(t), px(t) - 6, y0 + rows.length * rh + 2, { size: 5.8, color: MUTED });
    }
    k.line(vx(0), y0, vx(0), y0 + rows.length * rh, { color: RULE, t: 0.3 });
    rows.forEach((r_, i) => {
      const y = cy(i);
      if (i) k.line(M, y - rh / 2, M + CW, y - rh / 2, { color: RULE, t: 0.25 });
      if (r_.kind === "ref") {
        k.text("Reference country", M, y - 4, { size: 7.4, color: MUTED }); k.dot(px(L.ref), y, 2.2, { color: GREYD }); k.text(pp(L.ref), numX, y - 3.3, { f: "mono", size: 6.8, color: MUTED });
      } else if (r_.kind === "group") {
        const st = r_.st, up = st.d >= 0, col = up ? AMBER : CYAN, a = px(st.p0), b = px(st.p1);
        k.text(GL[st.key] || st.key, M, y - 4, { f: "sansB", size: 7.4 });
        k.rect(Math.min(a, b), y - 4, Math.max(1.8, Math.abs(b - a)), 8, { color: col });
        k.line(b, y + 4, b, y + rh - 4, { color: GREYD, t: 0.4, dash: [1.4, 1.4] });
        k.text(pp(st.p1), numX, y - 3.3, { f: "mono", size: 6.8 }); k.text(`${st.d >= 0 ? "+" : "-"}${Math.abs(st.d).toFixed(2)}`, numX + 33, y - 3.3, { f: "monoB", size: 6.6, color: col });
        const nmax = Math.max(1, ...st.list.map((q) => q[1]));
        for (const [v, n] of st.list) k.rect(vx(v) - 0.7, y + 5.5 - Math.max(1, 9 * Math.sqrt(n / nmax)), 1.4, Math.max(1, 9 * Math.sqrt(n / nmax)), { color: GREY });
        k.line(vx(st.d), y - 6, vx(st.d), y + 6, { color: col, t: 1.5 });
      } else if (r_.kind === "logit") {
        k.text("Logistic model", M, y - 4, { size: 7.4, color: MUTED }); k.poly([[px(L.logit), y - 4], [px(L.logit) + 3.6, y], [px(L.logit), y + 4], [px(L.logit) - 3.6, y]], { color: NAVY }); k.text(pp(L.logit), numX, y - 3.3, { f: "mono", size: 6.8 });
      } else if (r_.kind === "avg") {
        k.text(`Average of ${L.comps.length} models`, M, y - 4, { size: 7.4, color: MUTED });
        for (const c of L.comps) k.dot(px(c.p), y, 1.5, { color: GREYD });
        k.poly([[px(L.avg), y - 4], [px(L.avg) + 3.6, y], [px(L.avg), y + 4], [px(L.avg) - 3.6, y]], { color: NAVY }); k.text(pp(L.avg), numX, y - 3.3, { f: "mono", size: 6.8 });
      } else {
        k.text("Published, calibrated", M, y - 4, { f: "sansB", size: 7.6, color: NAVY });
        k.rect(px(L.pub.lo), y - 4, Math.max(2, px(L.pub.hi) - px(L.pub.lo)), 8, { color: ACC, opacity: 0.28 });
        k.dot(px(L.pub.p), y, 3.2, { color: ACC, borderColor: WHITE, borderWidth: 0.8 });
        k.text(pp(L.pub.p), numX, y - 3.6, { f: "monoB", size: 7.2, color: ACC });
        k.text(`80% range ${pp(L.pub.lo)} to ${pp(L.pub.hi)}`, sx0 - 2, y - 3, { size: 6.4, color: MUTED });
      }
    });
    const h = 12 + rows.length * rh + 12;
    return h + k.para(`Each bar is one group of variables moving the probability, from a reference country (the logistic model's intercept) to the published forecast: amber raises the odds, cyan lowers them. At right, the other countries on the same group; the tick marks this one. Associations in the data, not causes.`, { top: top + h, size: 6.3, color: MUTED, lh: 1.28, maxLines: 2 });
  };

  // --- prediction market against the model, when a market exists
  const marketStrip = (k, top) => {
    const m = (facts.prediction_markets || []).find((x) => x.crowd_probability != null && x.our_model_same_horizon != null); if (!m) return 0;
    const x0 = M + 250, x1 = M + CW - 8, px = logAxis(0.001, 0.9, x0, x1), y = top + 24, mod = m.our_model_same_horizon, crowd = m.crowd_probability, ratio = mod > 0 ? crowd / mod : null;
    let h = k.heading("Prediction market against the model", top, { note: `${m.source}, restated for the market's horizon` }) + 4;
    k.para(m.question, { top: top + h - 2, width: 230, size: 7.4, lh: 1.28, maxLines: 2 });
    k.line(x0, y + h - 4, x1, y + h - 4, { color: RULE, t: 0.8 });
    for (const t of [0.001, 0.01, 0.1, 0.5]) { k.line(px(t), y + h - 6.5, px(t), y + h - 1.5, { color: GREYD, t: 0.5 }); k.text(pp(t), px(t) - 6, y + h + 1, { size: 5.8, color: MUTED }); }
    k.line(px(Math.min(mod, crowd)), y + h - 4, px(Math.max(mod, crowd)), y + h - 4, { color: GREYD, t: 1.6 });
    k.dot(px(mod), y + h - 4, 3.3, { color: ACC }); k.dot(px(crowd), y + h - 4, 3.3, { color: crowd > mod ? AMBER : CYAN });
    k.text(`model ${pp(mod)}`, px(mod) - 12, y + h - 17, { f: "sansB", size: 6.6, color: ACC });
    k.text(`${m.source} ${pp(crowd)}`, clamp(px(crowd) - 10, x0, x1 - 54), y + h - 17 - (Math.abs(px(crowd) - px(mod)) < 56 ? 8 : 0), { f: "sansB", size: 6.6, color: crowd > mod ? AMBER : CYAN });
    if (ratio) k.text(`${ratio >= 1 ? ratio.toFixed(ratio >= 10 ? 0 : 1) : (1 / ratio).toFixed(1)}x ${ratio >= 1 ? "higher" : "lower"} than the model`, M, top + h + 20, { size: 6.8, color: MUTED });
    return h + 32;
  };

  // --- ACLED activity as monthly bars against the prior three years, and the violence forecast with its band
  const acledPanel = (k, top) => {
    const ac = chart.acled, V = chart.violence, keys = [["unrest", "Protests and riots", ACC], ["violence", "Political violence events", AMBER], ["fatalities", "Reported fatalities", CYAN]].filter(([key]) => ac?.[key]);
    const cols = keys.length + (V ? 1 : 0); if (!cols) return 0;
    const gap = 14, pw = (CW - gap * (cols - 1)) / cols, ph = 34;
    keys.forEach(([key, label, col], i) => {
      const a = ac[key], v = a.values, n = v.length, x = M + i * (pw + gap), mx = Math.max(...v, a.baseline * 1.3, 1), base = top + 12 + ph, bw = pw / n;
      k.text(label, x, top, { f: "sansB", size: 7.4 });
      k.rect(x + bw * (n - 12), top + 11, bw * 12, ph, { color: SOFT });
      v.forEach((val, j) => { if (val > 0) { const hh = (val / mx) * ph; k.rect(x + j * bw + 0.15, base - hh, Math.max(0.8, bw - 0.4), hh, { color: j >= n - 12 ? col : GREY }); } });
      k.line(x, base, x + pw, base, { color: GREYD, t: 0.5 });
      k.line(x, base - (a.baseline / mx) * ph, x + pw, base - (a.baseline / mx) * ph, { color: INK, t: 0.5, dash: [2, 2] });
      const ratio = a.baseline > 0 ? a.last12 / a.baseline : null;
      k.text(ratio == null ? "no earlier activity" : `${ratio.toFixed(1)}x the prior 3-year average`, x, base + 3, { size: 6.6, color: ratio != null && ratio > 1.3 ? AMBER : MUTED });
    });
    if (V) {
      const x = M + keys.length * (pw + gap), hist = V.hist.slice(-13), fcv = V.fc, n = hist.length + fcv.length, bw = pw / n, mx = Math.max(1, ...hist, ...fcv.map((f) => f[2])) * 1.1, base = top + 12 + ph, py = (val) => base - (val / mx) * ph;
      k.text("Violence forecast, 4-week periods", x, top, { f: "sansB", size: 7.4, max: pw });
      hist.forEach((val, j) => { if (val > 0) k.rect(x + j * bw + 0.3, py(val), Math.max(0.8, bw - 0.8), (val / mx) * ph, { color: GREY }); });
      const cx = (j) => x + (hist.length + j + 0.5) * bw;
      k.poly([...fcv.map((f, j) => [cx(j), py(f[2])]), ...fcv.map((f, j) => [cx(fcv.length - 1 - j), py(fcv[fcv.length - 1 - j][1])])], { color: AMBER, opacity: 0.25 });
      for (let j = 1; j < fcv.length; j++) k.line(cx(j - 1), py(fcv[j - 1][0]), cx(j), py(fcv[j][0]), { color: AMBER, t: 1.1 });
      fcv.forEach((f, j) => k.dot(cx(j), py(f[0]), 1.4, { color: AMBER }));
      k.line(x + hist.length * bw, top + 11, x + hist.length * bw, base, { color: INK, t: 0.4, dash: [1.5, 1.5] });
      k.line(x, base, x + pw, base, { color: GREYD, t: 0.5 });
      k.text(`next ${Math.round(fcv[0][0])} (${Math.round(fcv[0][1])}-${Math.round(fcv[0][2])}); last six ${V.ma6.toFixed(0)}`, x, base + 3, { size: 6.6, color: MUTED, max: pw });
    }
    return 12 + ph + 14;
  };

  // --- one signpost as a gauge: the axis, where it turns to watch and to alert, and where it stands
  const signpostGauge = (k, x, top, width, sp) => {
    const col = sp.status === "alert" ? RED : sp.status === "watch" ? AMBER : GREEN, g = sp.g;
    const lh = k.para(sp.label, { x, top, width: width - 54, size: 7.1, lh: 1.22, maxLines: 2 });
    k.text(sp.now, x + width, top - 0.3, { f: "monoB", size: 7.2, color: sp.status === "ok" ? NAVY : col, right: true, max: 52 });
    const y = top + Math.max(lh, 9) + 3;
    if (!g) { k.text(`alert: ${sp.alert}`, x, y, { size: 6.3, color: MUTED }); return Math.max(lh, 9) + 14; }
    const px = (v) => x + ((clamp(v, g.lo, g.hi) - g.lo) / (g.hi - g.lo)) * width, w = px(g.w), a = px(g.a);
    k.rect(x, y, width, 4, { color: SOFT });
    if (g.dir > 0) { k.rect(w, y, a - w, 4, { color: AMBER, opacity: 0.35 }); k.rect(a, y, x + width - a, 4, { color: RED, opacity: 0.32 }); }
    else { k.rect(a, y, w - a, 4, { color: AMBER, opacity: 0.35 }); k.rect(x, y, a - x, 4, { color: RED, opacity: 0.32 }); }
    k.rect(px(g.v) - 1.1, y - 2.6, 2.2, 9.2, { color: sp.status === "ok" ? NAVY : col });
    k.text(`alert ${sp.alert}`, x, y + 7, { size: 5.8, color: MUTED });
    return Math.max(lh, 9) + 17;
  };

  // ---------------------------------------------------------------- page furniture
  // Institutional layout, as in policy notes from EU bodies and asset managers: a cover, then pages that carry a slim head with the logo
  // centred and the issue line either side of it.
  function chrome(k, no) {
    const page = pages[no], cx = W / 2;
    if (logoLockup) { const lh = 22, lw = (logoLockup.width / logoLockup.height) * lh; page.drawImage(logoLockup, { x: cx - lw / 2, y: H - (7 + lh), width: lw, height: lh }); }
    k.text("COUNTRY BRIEF", M, 17, { f: "mono", size: 6.6, color: MUTED });
    k.text(`${name}  |  issue ${fc.issue}`, W - M, 17.2, { size: 6.8, color: MUTED, right: true });
    k.line(M, 36, W - M, 36, { color: NAVY, t: 1.2 });
    k.line(M, H - FOOT, W - M, H - FOOT, { color: RULE });
    if (logoMark) { const mh = 17, mw = (logoMark.width / logoMark.height) * mh; page.drawImage(logoMark, { x: cx - mw / 2, y: H - (H - FOOT + 6 + mh), width: mw, height: mh }); }
    k.text(`${name}  |  issue ${fc.issue}`, M, H - FOOT + 8, { size: 6.4, color: NAVY });
    k.text(`generated ${generated}`, M, H - FOOT + 17, { size: 6.4, color: MUTED });
    k.text(`${no + 2} / 4`, W - M, H - FOOT + 8, { f: "mono", size: 6.8, color: MUTED, right: true });
    k.text("praevex", W - M, H - FOOT + 17, { f: "serif", size: 6.4, color: MUTED, right: true });
  }
  const LIMIT = H - FOOT - 10;

  // ---------------------------------------------------------------- PAGE 2: the assessment
  function page1(s, dry) {
    const k = kit(pages[0], dry, s); if (!dry) chrome(k, 0);
    let top = 50;
    if (flagImg && !dry) pages[0].drawImage(flagImg, { x: M, y: H - (top + 27), width: 40, height: 27 });
    const tx = flagImg ? M + 52 : M;
    k.text(name, tx, top - 2, { f: "serifB", size: 27, color: NAVY });
    k.text(facts.country.region.toUpperCase(), tx, top + 31, { f: "mono", size: 7.4, color: MUTED });
    top += 48;
    top += k.para(narrative.headline, { top, f: "serif", size: 12.4, color: INK, lh: 1.3, maxLines: 3 }) + 8;
    const pf = facts.profile;                                  // the configuration this country is in, and the question the brief answers
    k.rect(M, top, 2.4, 22, { color: ACC });
    k.text("READING FRAME", M + 9, top + 1, { f: "mono", size: 6, color: MUTED });
    const aw = k.text(pf.archetype, M + 9, top + 10.5, { f: "sansB", size: 8.9, color: NAVY });
    k.text(pf.question, M + 9 + aw + 9, top + 11, { f: "serif", size: 8.4, color: MUTED, max: CW - aw - 26 });
    top += 31;
    top += scorecard(k, top) + 14;

    // left column: takeaways, bottom line, the long record
    const LW = 322, RX = M + LW + 20, RW = CW - LW - 20, cr = facts.coup_record;
    let ly = top;
    ly += k.heading("Key takeaways", ly, { width: LW });
    narrative.key_takeaways.slice(0, 4).forEach((t, i) => {
      k.text(String(i + 1).padStart(2, "0"), M, ly + 0.5, { f: "monoB", size: 9, color: ACC });
      const th = k.para(t.title, { x: M + 24, top: ly, width: LW - 24, f: "sansB", size: 9.2, lh: 1.25, maxLines: 1 });
      ly += th + 1.5 + k.para(t.text, { x: M + 24, top: ly + th + 1.5, width: LW - 24, size: 8.3, lh: 1.36, maxLines: 3 }) + 7;
    });
    ly += 3;
    ly += k.heading("Bottom line", ly, { width: LW });
    ly += k.para(narrative.bottom_line, { top: ly, width: LW, size: 8.5, lh: 1.4, maxLines: 7 }) + 9;
    ly += k.heading("Every recorded attempt since 1900", ly, { width: LW, note: `${cr.attempts_since_1900_confidence_A_to_C} attempts, ${cr.successful} successful` });
    ly += recordRail(k, M, ly + 2, LW) + 12;
    const recent = cr.recent_events.slice(0, 4);
    if (!recent.length) ly += k.para("No attempt on record.", { top: ly, width: LW, size: 8.3, color: MUTED });
    recent.forEach((e) => {
      k.text(e.date.slice(0, e.precision === "year" ? 4 : e.precision === "month" ? 7 : 10), M, ly, { f: "mono", size: 7.2 });
      k.text(e.outcome, M + 62, ly, { f: "sansB", size: 7.6, color: e.outcome === "successful" ? RED : AMBER });
      k.text(`confidence ${e.confidence}, ${e.scholarly_sources} academic source${e.scholarly_sources === 1 ? "" : "s"}`, M + 112, ly, { size: 7.4, color: MUTED });
      ly += 11.5;
    });

    // right column: the country among all others, its own history, its region, its closest past cases
    let ry = top;
    ry += k.heading("Among all countries", ry, { x: RX, width: RW, note: "log scale" });
    ry += positionStrip(k, RX, ry + 12, RW) + 18;
    ry += k.heading("Forecast since 1975", ry, { x: RX, width: RW });
    ry += chartHistory(k, RX, ry + 4, RW, 66) + 4;
    ry += k.para(narrative.history_note, { x: RX, top: ry, width: RW, size: 7.1, color: MUTED, lh: 1.32, maxLines: 3 });
    ry += k.para("Dashed red: base rate. Dots on the rail: attempts, filled when successful. Amber bar at right: 80% range today.", { x: RX, top: ry + 1, width: RW, size: 6.2, color: GREYD, lh: 1.25, maxLines: 2 }) + 11;
    ry += k.heading(chart.regionName || "Region", ry, { x: RX, width: RW });
    ry += chartRegion(k, RX, ry + 4, RW) + 4;
    ry += k.para(narrative.region_note, { x: RX, top: ry, width: RW, size: 7.1, color: MUTED, lh: 1.32, maxLines: 2 }) + 9;
    const cc = pf.closest_cases;
    ry += k.heading("Closest past cases", ry, { x: RX, width: RW, note: cc ? `${cc.followed_by_attempt} of ${cc.compared}` : "" });
    ry += cc ? waffle(k, RX, ry + 3, RW) : k.para("No comparison is available for this country.", { x: RX, top: ry + 3, width: RW, size: 7.6, color: MUTED });
    return Math.max(ly, ry);
  }

  // ---------------------------------------------------------------- PAGE 3: the evidence
  function page2(s, dry) {
    const k = kit(pages[1], dry, s); if (!dry) chrome(k, 1);
    let top = 50;
    top += k.heading("Model x media cross-check", top, { note: "where our evidence and the recent coverage agree, differ, or one sees what the other cannot" });
    [[M, "THEME"], [M + 72, "WHAT THE MODEL SAYS"], [M + 214, "WHAT THE MEDIA AND ACLED SAY"], [M + 356, "READING"]].forEach(([x, lab]) => k.text(lab, x, top, { f: "mono", size: 6, color: MUTED }));
    top += 11; k.line(M, top, W - M, top, { color: RULE });
    for (const r of narrative.cross_check.slice(0, 5)) {
      const [lab, col] = VERDICT[r.verdict] || VERDICT.gap, size = 7.8;
      const rows = Math.max(k.lines(r.theme, "sansB", size, 66), k.lines(r.model, "sans", size, 134), k.lines(r.media, "sans", size, 134), k.lines(r.so_what, "sans", size, CW - 356) + 1, 2);
      const rh = rows * size * s * 1.34 + 9;
      k.para(r.theme, { x: M, top: top + 6, width: 66, f: "sansB", size, lh: 1.34, maxLines: 4 });
      k.para(r.model, { x: M + 72, top: top + 6, width: 134, size, lh: 1.34, maxLines: 6 });
      k.para(r.media, { x: M + 214, top: top + 6, width: 134, size, lh: 1.34, maxLines: 6 });
      const tw = k.w(lab, "monoB", 6) + 8;
      k.rect(M + 356, top + 5, tw, 9.5, { color: col, opacity: 0.14 }); k.text(lab, M + 360, top + 6.6, { f: "monoB", size: 6, color: col });
      k.para(r.so_what, { x: M + 356, top: top + 18, width: CW - 356, size, lh: 1.34, maxLines: 6 });
      top += rh; k.line(M, top, W - M, top, { color: RULE, t: 0.4 });
    }
    top += 10;
    const bs = (narrative.blind_spots || []).slice(0, 3);
    if (bs.length) {
      const bh = bs.reduce((a, b) => a + k.lines(b, "sans", 7.9, CW - 34) * 7.9 * s * 1.36 + 3.5, 0) + 24;
      k.rect(M, top, CW, bh, { color: SOFT }); k.rect(M, top, 2.4, bh, { color: AMBER });
      k.text("WHAT THE MODEL CANNOT SEE RIGHT NOW", M + 12, top + 8, { f: "monoB", size: 6.6, color: AMBER });
      let by = top + 20;
      bs.forEach((b) => { k.text("-", M + 12, by, { f: "monoB", size: 7.9, color: AMBER }); by += k.para(b, { x: M + 22, top: by, width: CW - 34, size: 7.9, lh: 1.36, maxLines: 3 }) + 3.5; });
      top += bh + 12;
    }
    const mk = marketStrip(k, top); if (mk) top += mk + 6;
    // the Model Trace, in print: from the reference country to the published forecast, group by group
    top += k.heading("What drives the estimate", top, { note: "how each group of variables moves the probability" });
    if (chart.ledger) {
      top += ledgerChart(k, top + 2) + 4;
      const gmap = new Map((facts.groups || []).map((g) => [g.key, g])), reading = new Map(narrative.group_readings.map((g) => [g.group, g.reading]));
      const GLAB = Object.fromEntries(GROUPS);
      chart.ledger.steps.slice(0, 2).forEach((st) => {
        const t = reading.get(st.key); if (!t) return;
        k.text(GLAB[st.key] || st.key, M, top, { f: "sansB", size: 7.2, color: st.d >= 0 ? AMBER : CYAN });
        top += k.para(t, { x: M + 92, top, width: CW - 92, size: 7.3, lh: 1.3, maxLines: 2 }) + 3;
      });
      top += 4;
    } else {
      const gmap = new Map((facts.groups || []).map((g) => [g.key, g])), reading = new Map(narrative.group_readings.map((g) => [g.group, g.reading]));
      for (const [key, label] of GROUPS) {
        const g = gmap.get(key), d = g?.contribution_log_odds ?? 0, col = d > 0.02 ? AMBER : d < -0.02 ? CYAN : MUTED;
        k.text(label, M, top + 2, { f: "sansB", size: 7.8 * s }); k.text(g ? g.effect : "no signal", M + 110, top + 2, { f: "monoB", size: 6, color: col });
        top += Math.max(k.para(reading.get(key) || "", { x: M + 190, top: top + 1, width: CW - 190, size: 7.6, lh: 1.32, maxLines: 3 }), 14) + 4;
      }
    }
    // street and security activity, and the violence forecast
    const ap = acledPanel(k, top + 17);
    if (ap) {
      top += k.heading("Street and security activity", top, { note: "monthly, last four years; last 12 shaded; dashed = average of the 3 years before" });
      top += ap + 2;
      top += k.para(narrative.acled_note, { top, size: 7.4, color: MUTED, lh: 1.33, maxLines: 2 });
    }
    return top;
  }

  // ---------------------------------------------------------------- PAGE 4: the outlook
  function page3(s, dry) {
    const k = kit(pages[2], dry, s); if (!dry) chrome(k, 2);
    let top = 50;
    top += k.heading("Context", top, { note: "analyst background: general knowledge of the country, not drawn from our database" });
    const cw3 = (CW - 24) / 3; let ch = 0;
    [["History", narrative.background], ["Society and politics", narrative.society_politics], ["The security sector", narrative.security_sector]].forEach(([t, body], i) => {
      const x = M + i * (cw3 + 12);
      k.text(t, x, top, { f: "sansB", size: 8.6, color: NAVY });
      ch = Math.max(ch, 14 + k.para(body, { x, top: top + 14, width: cw3, size: 7.9, lh: 1.38, maxLines: 14 }));
    });
    top += ch + 12;

    // current situation (left) and signposts (right)
    const LW = 322, RX = M + LW + 20, RW = CW - LW - 20;
    let ly = top, ry = top;
    ly += k.heading("Current situation", ly, { width: LW, note: "vetted press headlines and our figures" });
    const refs = narrative.current_situation.refs.length ? `  [${narrative.current_situation.refs.join(", ")}]` : "";
    ly += k.para(narrative.current_situation.text + refs, { top: ly, width: LW, size: 8.2, lh: 1.38, maxLines: 9 }) + 7;
    const digest = new Map((narrative.press_digest || []).map((d) => [d.ref, d.takeaway]));
    const items = press.items.filter((x) => digest.has(x.id)).concat(press.items.filter((x) => !digest.has(x.id))).slice(0, 5);
    if (!items.length) ly += k.para(`No headlines from the vetted outlets were retrieved for this window${press.note ? ` (${press.note})` : ""}.`, { top: ly, width: LW, size: 7.8, color: MUTED });
    for (const p of items) {
      k.text(`${p.id}  ${p.date}  ${p.outlet}`.toUpperCase(), M, ly, { f: "mono", size: 5.9, color: ACC, max: LW });
      ly += 9 * s;
      ly += k.para(p.title, { top: ly, width: LW, size: 7.6, f: "sansB", lh: 1.27, maxLines: 2 });
      if (digest.has(p.id)) ly += k.para(digest.get(p.id), { top: ly, width: LW, size: 7.3, color: MUTED, lh: 1.3, maxLines: 2 });
      ly += 4.5;
    }
    ry += k.heading("Signposts", ry, { x: RX, width: RW, note: "now, against where it becomes an alert" });
    for (const sp of (facts.profile.signposts || []).slice(0, 6)) ry += signpostGauge(k, RX, ry, RW, sp) + 2;
    ry += 6;
    ry += k.heading(LENSES[facts.reader?.lens]?.heading || "Watch list", ry, { x: RX, width: RW });
    ry += k.para(narrative.lens_note, { x: RX, top: ry, width: RW, f: "serif", size: 7.7, color: INK, lh: 1.33, maxLines: 4 }) + 4;
    narrative.lens_actions.slice(0, 3).forEach((wn, i) => {
      k.text(String(i + 1), RX, ry + 0.5, { f: "monoB", size: 8, color: ACC });
      const ih = k.para(wn.action, { x: RX + 14, top: ry, width: RW - 14, f: "sansB", size: 7.9, lh: 1.25, maxLines: 2 });
      ry += ih + 1 + k.para(wn.why, { x: RX + 14, top: ry + ih + 1, width: RW - 14, size: 7.3, color: MUTED, lh: 1.3, maxLines: 4 }) + 5;
    });
    top = Math.max(ly, ry) + 8;

    // scenarios
    top += k.heading("Scenarios for the window", top, { note: "qualitative; no probabilities beyond the model's" });
    const TAG = [ACC, RED, CYAN]; let sh = 0;
    narrative.scenarios.slice(0, 3).forEach((sc, i) => {
      const x = M + i * (cw3 + 12);
      k.rect(x, top, cw3, 2.4, { color: TAG[i % 3] });
      k.text(sc.name, x, top + 8, { f: "sansB", size: 8.8, color: NAVY, max: cw3 });
      let yy = top + 22;
      yy += k.para(sc.description, { x, top: yy, width: cw3, size: 7.8, lh: 1.36, maxLines: 8 }) + 4;
      for (const sp of sc.signposts.slice(0, 2)) { k.text(">", x, yy, { f: "monoB", size: 7, color: TAG[i % 3] }); yy += k.para(sp, { x: x + 9, top: yy, width: cw3 - 9, size: 7.3, color: MUTED, lh: 1.3, maxLines: 2 }) + 2; }
      sh = Math.max(sh, yy - top);
    });
    top += sh + 10;

    // method and caveats
    const mo = facts.model;
    k.line(M, top, W - M, top, { color: NAVY, t: 0.8 }); top += 6;
    const notes = [
      ...narrative.caveats.slice(0, 3),
      `Model: calibrated ensemble of ${mo.components || "logistic regression, gradient boosting and random forest"}; target is at least one coup attempt (successful or failed) in the next 6 months. Out of sample since 1975: AUC ${mo.out_of_sample_auc_since_1975}; ${pct(mo.share_of_attempts_in_top_10_percent_beforehand, 0)} of attempts fell among the 10% highest-ranked country-months beforehand. Interval: ${fc.interval_method}.`,
      `Press: headline search restricted to ${[...new Set(Object.values(PRESS_SOURCES))].length} vetted outlets, last 75 days; it filters sources, it does not verify facts. The narrative is written from our database and those headlines; the context sections draw on general knowledge and may contain errors. Not investment advice. Forecast registry: /registry.`,
    ];
    notes.forEach((n) => { top += k.para(n, { top, size: 6.4, color: MUTED, lh: 1.32, maxLines: 4 }) + 2; });
    return top;
  }

  await drawCover({ page: coverPage, F, clean, img: brandFile, flagImg, facts });

  // choose the largest type scale at which each page fits, then draw for real
  const fit = [];
  [page1, page2, page3].forEach((fn, i) => {
    let s = 1.25; while (s > 0.8 && fn(s, true) > LIMIT) s -= 0.02;
    fit.push(+s.toFixed(2)); fn(s, false);
  });
  if (process.env.DOSSIER_DEBUG) console.log("dossier type scale per page", fit);
  const bytes = await pdf.save(); bytes.fit = fit;                   // the route reports it in development, to see how far the type had to shrink
  return bytes;
}
