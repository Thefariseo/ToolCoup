// Three-page country brief in the style of an asset-manager policy note: masthead, key-figure strip, numbered
// takeaways, a model-versus-media cross-check table, charts with one-line readings, context, scenarios, signposts with alert levels
// and a section for the reader (investor, diplomat, journalist, aid worker). The frame, the signposts and the closest cases come from fixed rules over our data.
// Layout is fixed (A4, three pages): every text box is measured and the type scale is reduced until each page fits.
// Numbers come from `facts` and `chart`, never from the narrative; model internals (coefficients, log-odds) are not printed.
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { PRESS_SOURCES } from "@/lib/dossier";
import { LENSES } from "@/lib/dossier-profile";

const W = 595.28, H = 841.89, M = 34, CW = W - 2 * M, FOOT = 34;
const NAVY = rgb(0.06, 0.13, 0.21), INK = rgb(0.1, 0.12, 0.14), MUTED = rgb(0.38, 0.43, 0.46), RULE = rgb(0.8, 0.83, 0.85), SOFT = rgb(0.94, 0.953, 0.96),
  ACC = rgb(0.03, 0.42, 0.4), AMBER = rgb(0.8, 0.47, 0.02), CYAN = rgb(0.04, 0.48, 0.64), RED = rgb(0.76, 0.2, 0.14), GREEN = rgb(0.1, 0.48, 0.3), WHITE = rgb(1, 1, 1);

const FONT_FILES = { sans: "IBMPlexSans-Regular", sansB: "IBMPlexSans-SemiBold", serif: "IBMPlexSerif-Regular", serifB: "IBMPlexSerif-SemiBold", mono: "IBMPlexMono-Regular", monoB: "IBMPlexMono-Medium" };
const MAP = { "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "▲": "up", "▼": "down", "×": "x", " ": " ", "‑": "-", "‐": "-" };

const pct = (v, d = 1) => (v == null ? "-" : `${(v * 100).toFixed(d)}%`);
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
  const pages = [pdf.addPage([W, H]), pdf.addPage([W, H]), pdf.addPage([W, H])];
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
    const line = (x1, t1, x2, t2, { color = RULE, t = 0.5, dash } = {}) => { if (!dry) page.drawLine({ start: { x: x1, y: Y(t1) }, end: { x: x2, y: Y(t2) }, thickness: t, color, dashArray: dash }); };
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
    return { Y, w, wrap, text, line, rect, dot, para, lines, heading, ell, s };
  }

  // ---------------------------------------------------------------- charts
  const chartHistory = (k, x, top, width, h) => {
    const vals = chart.values, n = vals.length; if (n < 24) return;
    const hs = facts.own_forecast_history, mx = Math.max(...vals, chart.baseRate * 1.5, 0.01), y0 = +hs.series_from.slice(0, 4), base = top + h;
    const px = (i) => x + 16 + (i / (n - 1)) * (width - 16), py = (v) => base - (v / mx) * (h - 8);
    k.line(x + 16, base, x + width, base);
    k.text(pct(mx, 0), x, top - 1, { size: 6.5, color: MUTED }); k.text("0", x + 10, base - 6, { size: 6.5, color: MUTED });
    for (let yr = Math.ceil(y0 / 10) * 10; yr <= +hs.series_to.slice(0, 4); yr += 10) {
      const i = (yr - y0) * 12; if (i >= n) break;
      k.line(px(i), base, px(i), base + 3); k.text(String(yr), px(i) - 7, base + 4, { size: 6.2, color: MUTED });
    }
    k.line(x + 16, py(chart.baseRate), x + width, py(chart.baseRate), { color: RED, t: 0.5, dash: [2, 2] });
    for (const e of chart.events) {
      const i = (+e.date.slice(0, 4) - y0) * 12 + (+e.date.slice(5, 7) - 1); if (i < 0 || i >= n) continue;
      k.line(px(i), base, px(i), top + 2, { color: RED, t: 0.4, dash: [1.5, 1.5] });
      k.dot(px(i), top + 2, 1.9, { color: e.outcome === "successful" ? RED : WHITE, borderColor: RED, borderWidth: 0.7 });
    }
    for (let i = 1; i < n; i++) k.line(px(i - 1), py(vals[i - 1]), px(i), py(vals[i]), { color: NAVY, t: 0.8 });
    k.dot(px(n - 1), py(vals[n - 1]), 2.2, { color: AMBER });
  };
  const chartRegion = (k, x, top, width) => {
    const rows = chart.region, rh = 12.5, lx = 66, bw = width - lx - 28, mx = Math.max(...rows.map((r) => r.p), chart.baseRate * 2);
    rows.forEach((r, i) => {
      const t = top + i * rh;
      k.text(r.name, x, t + 1, { f: r.self ? "sansB" : "sans", size: 7.3, color: r.self ? INK : MUTED, max: lx - 5 });
      k.rect(x + lx, t + 1.5, Math.max(1.5, (r.p / mx) * bw), 7, { color: r.self ? ACC : rgb(0.74, 0.79, 0.8) });
      k.text(pct(r.p, 1), x + lx + (r.p / mx) * bw + 3, t + 1.5, { f: "mono", size: 6.5, color: MUTED });
    });
    const bx = x + lx + (chart.baseRate / mx) * bw;
    k.line(bx, top - 1, bx, top + rows.length * rh, { color: RED, t: 0.5, dash: [2, 2] });
    k.text("base rate", bx + 2, top + rows.length * rh, { size: 6.2, color: RED });
    return rows.length * rh + 9;
  };
  const chartDecades = (k, x, top, width, h) => {
    const dec = chart.decades; if (!dec.length) return;
    const first = Math.min(dec[0].decade, 1950), count = Math.floor((2020 - first) / 10) + 1, by = new Map(dec.map((d) => [d.decade, d]));
    const mxc = Math.max(1, ...dec.map((d) => d.ok + d.ko)), bw = width / count, base = top + h;
    k.line(x, base, x + width, base);
    for (let i = 0; i < count; i++) {
      const d = by.get(first + i * 10) || { ok: 0, ko: 0 }, hx = x + i * bw + bw * 0.14, ww = bw * 0.72, okH = (d.ok / mxc) * (h - 6), koH = (d.ko / mxc) * (h - 6);
      if (d.ok) k.rect(hx, base - okH, ww, okH, { color: RED });
      if (d.ko) k.rect(hx, base - okH - koH, ww, koH, { color: AMBER });
      k.text(`${String(first + i * 10).slice(2)}s`, hx - 1, base + 2, { size: 6, color: MUTED });
    }
  };
  const spark = (k, x, top, width, h, a, col, label) => {
    const vals = a.values, n = vals.length, mx = Math.max(...vals, a.baseline * 1.3, 1), base = top + 10 + h;
    const px = (j) => x + (j / (n - 1)) * width, py = (v) => base - (v / mx) * h;
    k.text(label, x, top, { f: "sansB", size: 7.4 });
    k.rect(px(n - 12), base - h, x + width - px(n - 12), h, { color: SOFT });
    k.line(x, base, x + width, base);
    k.line(x, py(a.baseline), x + width, py(a.baseline), { color: MUTED, t: 0.5, dash: [2, 2] });
    for (let j = 1; j < n; j++) k.line(px(j - 1), py(vals[j - 1]), px(j), py(vals[j]), { color: col, t: 0.9 });
    const ratio = a.baseline > 0 ? a.last12 / a.baseline : null;
    k.text(ratio == null ? "no earlier activity" : `${ratio.toFixed(1)}x prior 3-year average`, x, base + 3, { size: 6.8, color: ratio != null && ratio > 1.3 ? AMBER : MUTED });
  };

  // ---------------------------------------------------------------- page furniture
  // Institutional layout, as in policy notes from EU bodies and asset managers: page 1 opens with a centred masthead (logo between
  // hairlines, the tagline letterspaced under it, a rule, then the issue line); pages 2 and 3 carry a slim head with the logo centred.
  const tracked = (page, text, cx, top, { f = "serif", size = 5.8, color = MUTED, track = 1.4 } = {}) => {
    const t = clean(text).toUpperCase(), chars = [...t], widths = chars.map((c) => F[f].widthOfTextAtSize(c, size));
    const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
    let x = cx - total / 2;
    chars.forEach((c, i) => { page.drawText(c, { x, y: H - (top + size * 0.82), font: F[f], size, color }); x += widths[i] + track; });
  };
  const MAST = 66;                                                          // page 1: the rule under the masthead
  function chrome(k, no) {
    const page = pages[no], cx = W / 2;
    if (no === 0) {
      const lh = 36, lw = logoLockup ? (logoLockup.width / logoLockup.height) * lh : 0, ly = 13;
      if (logoLockup) {
        page.drawImage(logoLockup, { x: cx - lw / 2, y: H - (ly + lh), width: lw, height: lh });
        const mid = ly + lh * 0.55, gap = 16;
        k.line(M, mid, cx - lw / 2 - gap, mid, { color: RULE, t: 0.5 });
        k.line(cx + lw / 2 + gap, mid, W - M, mid, { color: RULE, t: 0.5 });
      } else k.text("PRAEVEX", cx - 24, 18, { f: "serifB", size: 14, color: NAVY });
      tracked(page, "Political instability intelligence", cx, ly + lh + 5);
      k.line(M, MAST, W - M, MAST, { color: NAVY, t: 1.2 });
      k.text("COUNTRY BRIEF", M, MAST + 6, { f: "mono", size: 6.6, color: MUTED });
      const iss = `ISSUE ${fc.issue}`; k.text(iss, cx - k.w(iss, "mono", 6.6) / 2, MAST + 6, { f: "mono", size: 6.6, color: NAVY });
      k.text(`Window ${fc.window[0]} to ${fc.window[1]}  |  data through ${fc.data_through}`, W - M, MAST + 6.2, { size: 6.8, color: MUTED, right: true });
    } else {
      if (logoLockup) { const lh = 22, lw = (logoLockup.width / logoLockup.height) * lh; page.drawImage(logoLockup, { x: cx - lw / 2, y: H - (7 + lh), width: lw, height: lh }); }
      k.text("COUNTRY BRIEF", M, 17, { f: "mono", size: 6.6, color: MUTED });
      k.text(`${name}  |  issue ${fc.issue}`, W - M, 17.2, { size: 6.8, color: MUTED, right: true });
      k.line(M, 36, W - M, 36, { color: NAVY, t: 1.2 });
    }
    k.line(M, H - FOOT, W - M, H - FOOT, { color: RULE });
    if (logoMark) { const mh = 17, mw = (logoMark.width / logoMark.height) * mh; page.drawImage(logoMark, { x: cx - mw / 2, y: H - (H - FOOT + 6 + mh), width: mw, height: mh }); }
    k.text(`${name}  |  issue ${fc.issue}`, M, H - FOOT + 8, { size: 6.4, color: NAVY });
    k.text(`generated ${generated}`, M, H - FOOT + 17, { size: 6.4, color: MUTED });
    k.text(`${no + 1} / 3`, W - M, H - FOOT + 8, { f: "mono", size: 6.8, color: MUTED, right: true });
    k.text("praevex", W - M, H - FOOT + 17, { f: "serif", size: 6.4, color: MUTED, right: true });
  }
  const LIMIT = H - FOOT - 10;

  // ---------------------------------------------------------------- PAGE 1
  function page1(s, dry) {
    const k = kit(pages[0], dry, s); if (!dry) chrome(k, 0);
    let top = MAST + 27;
    if (flagImg && !dry) pages[0].drawImage(flagImg, { x: M, y: H - (top + 27), width: 40, height: 27 });
    const tx = flagImg ? M + 52 : M;
    k.text(name, tx, top - 2, { f: "serifB", size: 27, color: NAVY });
    k.text(facts.country.region.toUpperCase(), tx, top + 31, { f: "mono", size: 7.4, color: MUTED });
    top += 50;
    top += k.para(narrative.headline, { top, f: "serif", size: 12.6, color: INK, lh: 1.32, maxLines: 3 }) + 10;
    const pf = facts.profile;                                  // the configuration this country is in, and the question the brief answers
    k.rect(M, top, 2.4, 22, { color: ACC });
    k.text("READING FRAME", M + 9, top + 1, { f: "mono", size: 6, color: MUTED });
    const aw = k.text(pf.archetype, M + 9, top + 10.5, { f: "sansB", size: 8.9, color: NAVY });
    k.text(pf.question, M + 9 + aw + 9, top + 11, { f: "serif", size: 8.4, color: MUTED, max: CW - aw - 26 });
    top += 33;

    // key figures strip
    const d3 = fc.probability_3_months_ago == null ? null : (fc.probability_of_at_least_one_coup_attempt - fc.probability_3_months_ago) * 100;
    const cr = facts.coup_record, kf = Object.fromEntries((facts.key_figures || []).map((m) => [m.metric, m]));
    const sinceLast = kf["Since the last attempt"];
    const cells = [
      ["PROBABILITY / 6 MO", pct(fc.probability_of_at_least_one_coup_attempt, 1), `80% range ${pct(fc.interval_80[0], 1)} - ${pct(fc.interval_80[1], 1)}`],
      ["VS BASE RATE", `${fc.multiple_of_base_rate}x`, `base rate ${pct(fc.base_rate, 1)}`],
      ["RANK", `${fc.rank} / ${fc.of_countries}`, `${facts.region.name}: mean ${pct(facts.region.mean_probability, 1)}`],
      ["3-MONTH CHANGE", d3 == null ? "-" : `${sign(d3, 1)} pp`, d3 == null ? "" : `from ${pct(fc.probability_3_months_ago, 1)}`],
      ["SINCE LAST ATTEMPT", sinceLast ? sinceLast.value.replace(" yrs", " y").replace(" yr", " y").replace(" mo", " mo") : "none", cr.last ? `${cr.last.date.slice(0, 4)} (${cr.last.type === "riuscito" ? "successful" : "failed"}); ${cr.attempts_since_1900_confidence_A_to_C} since 1900` : "no recorded attempt"],
    ];
    const cw = CW / cells.length, sh = 56;
    k.rect(M, top, CW, sh, { color: SOFT });
    cells.forEach(([lab, val, sub], i) => {
      const x = M + i * cw + 9;
      if (i) k.line(M + i * cw, top + 8, M + i * cw, top + sh - 8, { color: RULE });
      k.text(lab, x, top + 8, { f: "mono", size: 6, color: MUTED });
      k.text(val, x, top + 19, { f: "monoB", size: i === 0 ? 19 : 16, color: i === 0 ? ACC : NAVY });
      k.para(sub, { x, top: top + 42, width: cw - 14, size: 6.5, color: MUTED, lh: 1.25, maxLines: 2 });
    });
    top += sh + 16;

    // left column: takeaways, bottom line, recorded attempts
    const LW = 322, RX = M + LW + 20, RW = CW - LW - 20;
    let ly = top;
    ly += k.heading("Key takeaways", ly, { width: LW });
    narrative.key_takeaways.slice(0, 4).forEach((t, i) => {
      k.text(String(i + 1).padStart(2, "0"), M, ly + 0.5, { f: "monoB", size: 9, color: ACC });
      const th = k.para(t.title, { x: M + 24, top: ly, width: LW - 24, f: "sansB", size: 9.4, lh: 1.25, maxLines: 1 });
      ly += th + 1.5 + k.para(t.text, { x: M + 24, top: ly + th + 1.5, width: LW - 24, size: 8.5, lh: 1.38, maxLines: 4 }) + 9;
    });
    ly += 4;
    ly += k.heading("Bottom line", ly, { width: LW });
    ly += k.para(narrative.bottom_line, { top: ly, width: LW, size: 8.7, lh: 1.42, maxLines: 9 }) + 12;
    ly += k.heading("Recorded attempts", ly, { width: LW, note: "A-C confidence" });
    const recent = cr.recent_events.slice(0, 5);
    if (!recent.length) ly += k.para("No attempt on record.", { top: ly, width: LW, size: 8.3, color: MUTED });
    recent.forEach((e) => {
      k.text(e.date.slice(0, e.precision === "year" ? 4 : e.precision === "month" ? 7 : 10), M, ly, { f: "mono", size: 7.4 });
      k.text(e.outcome, M + 62, ly, { f: "sansB", size: 7.8, color: e.outcome === "successful" ? RED : AMBER });
      k.text(`confidence ${e.confidence}, ${e.scholarly_sources} academic source${e.scholarly_sources === 1 ? "" : "s"}`, M + 112, ly, { size: 7.6, color: MUTED });
      ly += 12;
    });

    // right column: charts
    let ry = top;
    ry += k.heading("Forecast since 1975", ry, { x: RX, width: RW });
    chartHistory(k, RX, ry + 4, RW, 100); ry += 100 + 20;
    ry += k.para(narrative.history_note, { x: RX, top: ry, width: RW, size: 7.5, color: MUTED, lh: 1.35, maxLines: 4 });
    ry += k.para("Dashed red: base rate. Circles: recorded attempts (filled = successful).", { x: RX, top: ry + 2, width: RW, size: 6.6, color: MUTED, lh: 1.3, maxLines: 2 }) + 16;
    ry += k.heading(chart.regionName || "Region", ry, { x: RX, width: RW });
    ry += chartRegion(k, RX, ry + 4, RW) + 4;
    ry += k.para(narrative.region_note, { x: RX, top: ry, width: RW, size: 7.5, color: MUTED, lh: 1.35, maxLines: 4 }) + 14;
    const cc = pf.closest_cases;
    ry += k.heading("Closest historical cases", ry, { x: RX, width: RW, note: cc ? `${cc.followed_by_attempt} of ${cc.compared} saw an attempt` : "" });
    if (!cc) ry += k.para("No comparison is available for this country.", { x: RX, top: ry, width: RW, size: 7.6, color: MUTED });
    else {
      cc.cases.slice(0, 5).forEach((c) => {
        k.dot(RX + 3, ry + 4, 2.5, c.attempt ? { color: RED } : { color: WHITE, borderColor: MUTED, borderWidth: 0.7 });
        k.text(c.country, RX + 12, ry, { f: "sansB", size: 7.8, max: RW - 70 });
        k.text(c.month, RX + RW, ry + 0.4, { f: "mono", size: 6.8, color: MUTED, right: true });
        ry += 12.5;
      });
      ry += 3 + k.para(`The ${cc.compared} past country-months most like this one (coup history, regime, leader, economy, region): ${cc.followed_by_attempt} were followed by an attempt within six months, against ${pct(cc.pool_base_rate, 1)} in the whole sample. Filled dot: an attempt followed.`, { x: RX, top: ry + 3, width: RW, size: 6.8, color: MUTED, lh: 1.32, maxLines: 5 });
    }
    return Math.max(ly, ry);
  }

  // ---------------------------------------------------------------- PAGE 2
  function page2(s, dry) {
    const k = kit(pages[1], dry, s); if (!dry) chrome(k, 1);
    let top = 50;
    top += k.heading("Model x media cross-check", top, { note: "where our evidence and the recent coverage agree, differ, or one sees what the other cannot" });
    [[M, "THEME"], [M + 72, "WHAT THE MODEL SAYS"], [M + 214, "WHAT THE MEDIA AND ACLED SAY"], [M + 356, "READING"]].forEach(([x, lab]) => k.text(lab, x, top, { f: "mono", size: 6, color: MUTED }));
    top += 11; k.line(M, top, W - M, top, { color: RULE });
    for (const r of narrative.cross_check.slice(0, 5)) {
      const [lab, col] = VERDICT[r.verdict] || VERDICT.gap, size = 7.9;
      const rows = Math.max(k.lines(r.theme, "sansB", size, 66), k.lines(r.model, "sans", size, 134), k.lines(r.media, "sans", size, 134), k.lines(r.so_what, "sans", size, CW - 356) + 1, 3);
      const rh = rows * size * s * 1.36 + 10;
      k.para(r.theme, { x: M, top: top + 6, width: 66, f: "sansB", size, lh: 1.36, maxLines: 4 });
      k.para(r.model, { x: M + 72, top: top + 6, width: 134, size, lh: 1.36, maxLines: 6 });
      k.para(r.media, { x: M + 214, top: top + 6, width: 134, size, lh: 1.36, maxLines: 6 });
      k.text(lab, M + 356, top + 6, { f: "monoB", size: 6.2, color: col });
      k.para(r.so_what, { x: M + 356, top: top + 6 + 9 * s, width: CW - 356, size, lh: 1.36, maxLines: 6 });
      top += rh; k.line(M, top, W - M, top, { color: RULE, t: 0.4 });
    }
    top += 12;
    // blind spots
    const bs = (narrative.blind_spots || []).slice(0, 3);
    if (bs.length) {
      const bh = bs.reduce((a, b) => a + k.lines(b, "sans", 8.1, CW - 34) * 8.1 * s * 1.38 + 4, 0) + 26;
      k.rect(M, top, CW, bh, { color: SOFT }); k.rect(M, top, 2.4, bh, { color: AMBER });
      k.text("WHAT THE MODEL CANNOT SEE RIGHT NOW", M + 12, top + 8, { f: "monoB", size: 6.8, color: AMBER });
      let by = top + 21;
      bs.forEach((b) => { k.text("-", M + 12, by, { f: "monoB", size: 8.1, color: AMBER }); by += k.para(b, { x: M + 22, top: by, width: CW - 34, size: 8.1, lh: 1.38, maxLines: 3 }) + 4; });
      top += bh + 16;
    }
    // drivers
    top += k.heading("What drives the estimate", top, { note: "push on the odds relative to a typical country; associations, not causes" });
    const gmap = new Map((facts.groups || []).map((g) => [g.key, g])), reading = new Map(narrative.group_readings.map((g) => [g.group, g.reading]));
    const bx = M + 102, bw = 84, mid = bx + bw / 2, scale = 2.0, tx = bx + bw + 8;
    for (const [key, label] of GROUPS) {
      const g = gmap.get(key), d = g?.contribution_log_odds ?? 0, len = Math.min(1, Math.abs(d) / scale) * (bw / 2), col = d > 0.02 ? AMBER : d < -0.02 ? CYAN : MUTED;
      const th = k.para(reading.get(key) || "", { x: tx + 48, top: top + 1, width: W - M - tx - 48, size: 7.6, lh: 1.32, maxLines: 3 });
      const rh = Math.max(th, 15 * s) + 6;
      k.text(label, M, top + 2, { f: "sansB", size: 7.8 * s, max: 100 });
      k.rect(bx, top + 1.6, bw, 7, { color: SOFT });
      k.line(mid, top, mid, top + 10.4, { color: MUTED });
      if (Math.abs(d) > 0.02) k.rect(d > 0 ? mid : mid - len, top + 1.6, Math.max(1.4, len), 7, { color: col });
      k.text(g ? g.effect.replace(" push ", " ").replace("very strong", "v.strong") : "no signal", tx, top + 2, { f: "monoB", size: 5.6, color: col, max: 46 });
      top += rh; k.line(M, top - 2, W - M, top - 2, { color: RULE, t: 0.3 });
    }
    top += 12;
    // acled
    const ac = chart.acled;
    if (ac && Object.keys(ac).length) {
      top += k.heading("Street and security activity (ACLED)", top, { note: "last 4 years by month; last 12 shaded; dashed = average of the 3 years before" });
      const gap = 16, bw3 = (CW - 2 * gap) / 3;
      [["unrest", "Protests and riots", ACC], ["violence", "Political violence events", AMBER], ["fatalities", "Reported fatalities", CYAN]].forEach(([key, label, col], i) => ac[key] && spark(k, M + i * (bw3 + gap), top, bw3, 38, ac[key], col, label));
      top += 62;
      top += k.para(narrative.acled_note, { top, size: 7.6, color: MUTED, lh: 1.35, maxLines: 2 });
    }
    return top;
  }

  // ---------------------------------------------------------------- PAGE 3
  function page3(s, dry) {
    const k = kit(pages[2], dry, s); if (!dry) chrome(k, 2);
    let top = 50;
    top += k.heading("Context", top, { note: "analyst background: general knowledge of the country, not drawn from our database" });
    const cw3 = (CW - 24) / 3; let ch = 0;
    [["History", narrative.background], ["Society and politics", narrative.society_politics], ["The security sector", narrative.security_sector]].forEach(([t, body], i) => {
      const x = M + i * (cw3 + 12);
      k.text(t, x, top, { f: "sansB", size: 8.6, color: NAVY });
      ch = Math.max(ch, 14 + k.para(body, { x, top: top + 14, width: cw3, size: 8, lh: 1.4, maxLines: 14 }));
    });
    top += ch + 14;

    // current situation (left) and watch list (right)
    const LW = 322, RX = M + LW + 20, RW = CW - LW - 20;
    let ly = top, ry = top;
    ly += k.heading("Current situation", ly, { width: LW, note: "vetted press headlines and our figures" });
    const refs = narrative.current_situation.refs.length ? `  [${narrative.current_situation.refs.join(", ")}]` : "";
    ly += k.para(narrative.current_situation.text + refs, { top: ly, width: LW, size: 8.4, lh: 1.4, maxLines: 9 }) + 8;
    const digest = new Map((narrative.press_digest || []).map((d) => [d.ref, d.takeaway]));
    const items = press.items.filter((x) => digest.has(x.id)).concat(press.items.filter((x) => !digest.has(x.id))).slice(0, 5);
    if (!items.length) ly += k.para(`No headlines from the vetted outlets were retrieved for this window${press.note ? ` (${press.note})` : ""}.`, { top: ly, width: LW, size: 7.8, color: MUTED });
    for (const p of items) {
      k.text(`${p.id}  ${p.date}  ${p.outlet}`.toUpperCase(), M, ly, { f: "mono", size: 5.9, color: ACC, max: LW });
      ly += 9 * s;
      ly += k.para(p.title, { top: ly, width: LW, size: 7.7, f: "sansB", lh: 1.28, maxLines: 2 });
      if (digest.has(p.id)) ly += k.para(digest.get(p.id), { top: ly, width: LW, size: 7.4, color: MUTED, lh: 1.3, maxLines: 2 });
      ly += 5;
    }
    ry += k.heading("Signposts", ry, { x: RX, width: RW, note: "now, and where it becomes an alert" });
    for (const sp of (facts.profile.signposts || []).slice(0, 6)) {
      const col = sp.status === "alert" ? RED : sp.status === "watch" ? AMBER : GREEN;
      k.dot(RX + 3, ry + 4.4, 2.6, { color: col });
      const lh = k.para(sp.label, { x: RX + 12, top: ry, width: RW - 12 - 66, size: 7.3, lh: 1.24, maxLines: 2 });
      k.text(sp.now, RX + RW, ry, { f: "monoB", size: 7.2, color: sp.status === "ok" ? NAVY : col, right: true, max: 64 });
      k.text(`alert ${sp.alert}`, RX + RW, ry + 9, { size: 5.9, color: MUTED, right: true, max: 66 });
      ry += Math.max(lh, 17) + 3.5;
    }
    ry += 8;
    ry += k.heading(LENSES[facts.reader?.lens]?.heading || "Watch list", ry, { x: RX, width: RW });
    ry += k.para(narrative.lens_note, { x: RX, top: ry, width: RW, f: "serif", size: 7.8, color: INK, lh: 1.34, maxLines: 4 }) + 5;
    narrative.lens_actions.slice(0, 3).forEach((wn, i) => {
      k.text(String(i + 1), RX, ry + 0.5, { f: "monoB", size: 8, color: ACC });
      const ih = k.para(wn.action, { x: RX + 14, top: ry, width: RW - 14, f: "sansB", size: 8, lh: 1.26, maxLines: 2 });
      ry += ih + 1 + k.para(wn.why, { x: RX + 14, top: ry + ih + 1, width: RW - 14, size: 7.4, color: MUTED, lh: 1.32, maxLines: 4 }) + 6;
    });
    top = Math.max(ly, ry) + 10;

    // scenarios
    top += k.heading("Scenarios for the window", top, { note: "qualitative; no probabilities beyond the model's" });
    const TAG = [ACC, RED, CYAN]; let sh = 0;
    narrative.scenarios.slice(0, 3).forEach((sc, i) => {
      const x = M + i * (cw3 + 12);
      k.rect(x, top, cw3, 2.4, { color: TAG[i % 3] });
      k.text(sc.name, x, top + 8, { f: "sansB", size: 8.8, color: NAVY, max: cw3 });
      let yy = top + 22;
      yy += k.para(sc.description, { x, top: yy, width: cw3, size: 7.9, lh: 1.38, maxLines: 8 }) + 4;
      for (const sp of sc.signposts.slice(0, 2)) { k.text(">", x, yy, { f: "monoB", size: 7, color: TAG[i % 3] }); yy += k.para(sp, { x: x + 9, top: yy, width: cw3 - 9, size: 7.4, color: MUTED, lh: 1.3, maxLines: 2 }) + 2; }
      sh = Math.max(sh, yy - top);
    });
    top += sh + 12;

    // method and caveats
    const mo = facts.model;
    k.line(M, top, W - M, top, { color: NAVY, t: 0.8 }); top += 7;
    const notes = [
      ...narrative.caveats.slice(0, 3),
      `Model: calibrated ensemble of ${mo.components || "logistic regression, gradient boosting and random forest"}; target is at least one coup attempt (successful or failed) in the next 6 months. Out of sample since 1975: AUC ${mo.out_of_sample_auc_since_1975}; ${pct(mo.share_of_attempts_in_top_10_percent_beforehand, 0)} of attempts fell among the 10% highest-ranked country-months beforehand. Interval: ${fc.interval_method}.`,
      `Press: headline search restricted to ${[...new Set(Object.values(PRESS_SOURCES))].length} vetted outlets, last 75 days; it filters sources, it does not verify facts. Narrative drafted by ${model} from our database and those headlines; context sections draw on its general knowledge and may contain errors. Not investment advice. Forecast registry: /registry.`,
    ];
    notes.forEach((n) => { top += k.para(n, { top, size: 6.6, color: MUTED, lh: 1.34, maxLines: 4 }) + 2.5; });
    return top;
  }

  // choose the largest type scale at which each page fits, then draw for real
  const fit = [];
  [page1, page2, page3].forEach((fn, i) => {
    let s = 1.25; while (s > 0.8 && fn(s, true) > LIMIT) s -= 0.02;
    fit.push(+s.toFixed(2)); fn(s, false);
  });
  if (process.env.DOSSIER_DEBUG) console.log("dossier type scale per page", fit);
  return pdf.save();
}
