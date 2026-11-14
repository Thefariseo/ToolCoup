// Lays the dossier out as an A4 PDF with pdf-lib: charts first, then analysis in words. The built-in Helvetica
// is used (nothing to ship), so text is reduced to what WinAnsi can draw. Numbers come from `facts` and
// `chart`, never from the narrative; model internals (coefficients, log-odds) are not printed.
import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PRESS_SOURCES } from "@/lib/dossier";

const W = 595.28, H = 841.89, M = 42, CW = W - 2 * M;
const INK = rgb(0.08, 0.1, 0.1), MUTED = rgb(0.4, 0.45, 0.45), TEAL = rgb(0.04, 0.5, 0.46), AMBER = rgb(0.86, 0.52, 0.02),
  CYAN = rgb(0.06, 0.58, 0.74), RED = rgb(0.85, 0.2, 0.1), RULE = rgb(0.84, 0.87, 0.87), BAND = rgb(0.02, 0.03, 0.03), WHITE = rgb(1, 1, 1), SOFT = rgb(0.93, 0.96, 0.96);

const MAP = { "→": "->", "←": "<-", "–": "-", "—": "-", "…": "...", "≥": ">=", "≤": "<=", "▲": "^", "▼": "v", "’": "'", "‘": "'", "“": '"', "”": '"', " ": " ", "·": "-", "×": "x", "−": "-" };
const clean = (s) => String(s ?? "").replace(/[→←–—…≥≤▲▼’‘“” ·×−]/g, (c) => MAP[c] ?? c).replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF•€]/g, "?").replace(/\s+/g, " ").trim();
const pct = (v, d = 2) => (v == null ? "-" : `${(v * 100).toFixed(d)}%`);
const sign = (v, d = 2) => (v == null ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(d)}`);
const GROUPS = [["storia", "Coup history"], ["contagio", "Regional contagion"], ["regime", "Regime type and strength"], ["leader", "Leader and elections"],
  ["economia", "Economy and development"], ["piazza", "Mobilization and violence"], ["acled", "Recent ACLED signals"]];

export async function buildPdf({ facts, chart, narrative, press, model, generated }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`ToolCoup country dossier - ${facts.country.name}`); pdf.setAuthor("ToolCoup"); pdf.setSubject(`Issue ${facts.forecast.issue}`);
  const F = { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold), i: await pdf.embedFont(StandardFonts.HelveticaOblique) };
  let page, y;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const ensure = (h) => { if (y - h < M + 22) newPage(); };
  const width = (t, f, s) => F[f].widthOfTextAtSize(t, s);
  const wrap = (text, f, s, w) => {
    const out = []; let ln = "";
    for (const word of clean(text).split(" ")) {
      const t = ln ? `${ln} ${word}` : word;
      if (width(t, f, s) <= w || !ln) ln = t; else { out.push(ln); ln = word; }
    }
    if (ln) out.push(ln);
    return out;
  };
  const fit = (t, f, s, w) => { let x = clean(t); while (x.length > 3 && width(x, f, s) > w) x = x.slice(0, -2).trimEnd() + "."; return x; };
  const txt = (t, x, yy, { f = "r", s = 9.5, c = INK } = {}) => page.drawText(clean(t), { x, y: yy, font: F[f], size: s, color: c });
  const line = (x1, y1, x2, y2, { c = RULE, t = 0.5, dash } = {}) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color: c, dashArray: dash });
  const para = (t, { f = "r", s = 9.5, c = INK, x = M, w = CW - (x - M), lh = 1.45, gap = 5 } = {}) => {
    for (const ln of wrap(t, f, s, w)) { ensure(s * lh); txt(ln, x, y - s, { f, s, c }); y -= s * lh; }
    y -= gap;
  };
  const h2 = (t, note) => {
    ensure(46); y -= 10;
    txt(t.toUpperCase(), M, y - 8, { f: "b", s: 8.5, c: TEAL });
    if (note) txt(note, W - M - width(clean(note), "i", 7.5), y - 8, { f: "i", s: 7.5, c: MUTED });
    line(M, y - 13, W - M, y - 13, { t: 0.6 });
    y -= 22;
  };
  const h3 = (t) => { ensure(30); txt(t, M, y - 9, { f: "b", s: 10 }); y -= 15; };

  // ---------------------------------------------------------------- page 1: answer first
  newPage();
  const fc = facts.forecast;
  page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: BAND });
  txt("TOOLCOUP  /  COUNTRY DOSSIER", M, H - 28, { f: "b", s: 8.5, c: rgb(0.18, 0.83, 0.74) });
  txt(facts.country.name, M, H - 62, { f: "b", s: 26, c: WHITE });
  txt(`${facts.country.region}   |   Issue ${fc.issue}   |   Window ${fc.window[0]} to ${fc.window[1]}   |   Data through ${fc.data_through}`, M, H - 80, { s: 8.5, c: rgb(0.65, 0.72, 0.72) });
  y = H - 92 - 18;
  txt(pct(fc.probability_of_at_least_one_coup_attempt, 1), M, y - 36, { f: "b", s: 42 });
  wrap("probability of at least one coup attempt in the window (model estimate)", "r", 8, 205).forEach((ln, i) => txt(ln, M, y - 52 - i * 10, { s: 8, c: MUTED }));
  txt(`80% interval ${pct(fc.interval_80[0], 1)} to ${pct(fc.interval_80[1], 1)}`, M, y - 74, { s: 8, c: MUTED });
  const kx = 270, d3 = fc.probability_3_months_ago == null ? null : (fc.probability_of_at_least_one_coup_attempt - fc.probability_3_months_ago) * 100;
  [["Rank", `${fc.rank} of ${fc.of_countries}`], ["Versus the base rate", `${fc.multiple_of_base_rate}x  (base ${pct(fc.base_rate, 2)})`],
    ["Change in 3 months", d3 == null ? "-" : `${sign(d3)} pp`], ["Coup attempts since 1900", `${facts.coup_record.attempts_since_1900_confidence_A_to_C} (${facts.coup_record.successful} successful)`],
    ["Last recorded attempt", facts.coup_record.last ? `${facts.coup_record.last.date} (${facts.coup_record.last.type === "riuscito" ? "successful" : "failed"})` : "none"],
    ["Region", `${facts.region.name}: mean ${pct(facts.region.mean_probability, 2)}`]].forEach(([k, v], i) => {
    txt(k, kx, y - 12 - i * 11.5, { s: 8, c: MUTED }); txt(v, kx + 130, y - 12 - i * 11.5, { f: "b", s: 8.5 });
  });
  y -= 92;

  h2("Bottom line");
  para(narrative.headline, { f: "b", s: 11.5, lh: 1.35, gap: 6 });
  para(narrative.bottom_line);

  // ---------------------------------------------------------------- forecast history chart
  const hist = facts.own_forecast_history;
  h2("Forecast history", hist ? `peak ${pct(hist.peak, 1)} in ${hist.peak_month}  |  median ${pct(hist.median, 2)}` : null);
  if (hist && chart.values.length) {
    ensure(112);
    const top = y - 6, ch = 78, x0 = M + 30, cw = CW - 36, vals = chart.values, mx = Math.max(...vals, 0.01), n = vals.length;
    const px = (i) => x0 + (i / (n - 1)) * cw, py = (v) => top - ch + (v / mx) * ch, y0 = +hist.series_from.slice(0, 4);
    line(x0, top - ch, x0 + cw, top - ch);
    txt(pct(mx, 0), M, top - 6, { s: 7, c: MUTED }); txt("0", M + 20, top - ch - 2, { s: 7, c: MUTED });
    for (let yr = Math.ceil(y0 / 10) * 10; yr <= +hist.series_to.slice(0, 4); yr += 10) {
      const i = (yr - y0) * 12; if (i >= n) break;
      line(px(i), top - ch, px(i), top, { t: 0.3 }); txt(String(yr), px(i) + 2, top - ch - 10, { s: 7, c: MUTED });
    }
    for (const e of chart.events) {
      const i = (+e.date.slice(0, 4) - y0) * 12 + (+e.date.slice(5, 7) - 1);
      if (i < 0 || i >= n) continue;
      line(px(i), top - ch, px(i), top + 4, { c: RED, t: 0.6, dash: [2, 2] });
      page.drawCircle({ x: px(i), y: top + 5, size: 2, color: e.outcome === "successful" ? RED : WHITE, borderColor: RED, borderWidth: 0.8 });
    }
    for (let i = 1; i < n; i++) line(px(i - 1), py(vals[i - 1]), px(i), py(vals[i]), { c: INK, t: 0.8 });
    page.drawCircle({ x: px(n - 1), y: py(vals[n - 1]), size: 2.4, color: AMBER });
    y = top - ch - 20;
    para(`${narrative.history_note}  Circles mark recorded coup attempts (filled: successful).`, { s: 8.5, c: MUTED });
  }

  // ---------------------------------------------------------------- why the model sees it this way
  h2("Why the model sees it this way", "bars show push on the odds relative to a typical country");
  const gmap = new Map((facts.groups || []).map((g) => [g.key, g])), reading = new Map(narrative.group_readings.map((g) => [g.group, g.reading]));
  const bx = M + 150, bw = 120, mid = bx + bw / 2, scale = 2.0;
  for (const [key, name] of GROUPS) {
    const g = gmap.get(key), d = g?.contribution_log_odds ?? 0, len = Math.min(1, Math.abs(d) / scale) * (bw / 2), col = d > 0.02 ? AMBER : d < -0.02 ? CYAN : MUTED;
    const lines = wrap(reading.get(key) || "", "r", 8.7, CW - 10);
    ensure(14 + lines.length * 12.5 + 8);
    txt(name, M, y - 9, { f: "b", s: 9 });
    page.drawRectangle({ x: bx, y: y - 11, width: bw, height: 8, color: SOFT });
    line(mid, y - 12, mid, y - 2, { c: MUTED, t: 0.5 });
    if (Math.abs(d) > 0.02) page.drawRectangle({ x: d > 0 ? mid : mid - len, y: y - 11, width: Math.max(1.5, len), height: 8, color: col });
    txt(g ? g.effect : "no signal", bx + bw + 10, y - 9, { f: "b", s: 8, c: col });
    y -= 17;
    for (const ln of lines) { txt(ln, M + 10, y - 8, { s: 8.7 }); y -= 12.5; }
    y -= 6;
  }
  para(`Drivers named by the model: ${facts.top_drivers.map((d) => `${d.driver} (${d.effect})`).join("; ")}. These are statistical associations in the training data, not causes; the published figure also draws on a long-run trend and tree-based methods.`, { s: 8, c: MUTED });

  // ---------------------------------------------------------------- recent activity
  const ac = chart.acled;
  if (ac && Object.keys(ac).length) {
    h2("Recent activity (ACLED)", "last 4 years by month, last 12 shaded; dashed = average of the 3 years before");
    ensure(92);
    const gap = 14, bw3 = (CW - 2 * gap) / 3, top = y - 4, hh = 56;
    [["unrest", "Protests and riots", TEAL], ["violence", "Political violence events", AMBER], ["fatalities", "Reported fatalities", CYAN]].forEach(([k, name, col], i) => {
      const a = ac[k]; if (!a) return;
      const x0 = M + i * (bw3 + gap), vals = a.values, mx = Math.max(...vals, a.baseline * 1.3, 1), n = vals.length;
      const px = (j) => x0 + (j / (n - 1)) * bw3, py = (v) => top - hh + (v / mx) * hh;
      txt(name, x0, top + 2, { f: "b", s: 8.5 });
      page.drawRectangle({ x: px(n - 12), y: top - hh, width: x0 + bw3 - px(n - 12), height: hh, color: SOFT });
      line(x0, top - hh, x0 + bw3, top - hh);
      line(x0, py(a.baseline), x0 + bw3, py(a.baseline), { c: MUTED, t: 0.6, dash: [2, 2] });
      for (let j = 1; j < n; j++) line(px(j - 1), py(vals[j - 1]), px(j), py(vals[j]), { c: col, t: 1 });
      const ratio = a.baseline > 0 ? a.last12 / a.baseline : null;
      txt(ratio == null ? "no earlier activity" : `${ratio.toFixed(1)}x the prior average`, x0, top - hh - 11, { s: 8, c: ratio != null && ratio > 1.3 ? AMBER : MUTED });
    });
    y = top - hh - 22;
    para(narrative.acled_note, { s: 8.5, c: MUTED });
  }

  // ---------------------------------------------------------------- context: region and coup record by decade
  h2("Context", "region today and coup attempts by decade");
  ensure(130);
  {
    const top = y - 4, colW = (CW - 24) / 2, rowsN = chart.region.length, rh = 13;
    txt(`${chart.regionName || "Region"}: probability by country`, M, top + 2, { f: "b", s: 8.5 });
    const mx = Math.max(...chart.region.map((r) => r.p), chart.baseRate * 2), lx = 100, bwid = colW - lx - 34;
    chart.region.forEach((r, i) => {
      const yy = top - 12 - i * rh;
      txt(fit(r.name, r.self ? "b" : "r", 8, lx - 6), M, yy - 7, { f: r.self ? "b" : "r", s: 8, c: r.self ? INK : MUTED });
      page.drawRectangle({ x: M + lx, y: yy - 9, width: Math.max(1.5, (r.p / mx) * bwid), height: 8, color: r.self ? TEAL : rgb(0.72, 0.78, 0.78) });
      txt(pct(r.p, 1), M + lx + (r.p / mx) * bwid + 4, yy - 7, { s: 7.5, c: MUTED });
    });
    const bxl = M + lx + (chart.baseRate / mx) * bwid;
    line(bxl, top - 8, bxl, top - 12 - rowsN * rh + 2, { c: RED, t: 0.7, dash: [2, 2] });
    txt("base rate", bxl + 2, top - 12 - rowsN * rh - 5, { s: 7, c: RED });

    const x0 = M + colW + 24, dec = chart.decades, bh = 70;
    txt("Recorded coup attempts by decade", x0, top + 2, { f: "b", s: 8.5 });
    if (dec.length) {
      const first = dec[0].decade, count = Math.floor((2020 - first) / 10) + 1, byD = new Map(dec.map((d) => [d.decade, d]));
      const mxc = Math.max(1, ...dec.map((d) => d.ok + d.ko)), bwd = (colW - 8) / count, base = top - 14 - bh;
      line(x0, base, x0 + colW, base);
      for (let k = 0; k < count; k++) {
        const d = byD.get(first + k * 10) || { ok: 0, ko: 0 }, hx = x0 + k * bwd + bwd * 0.15, w = bwd * 0.7, okH = (d.ok / mxc) * bh, koH = (d.ko / mxc) * bh;
        if (d.ok) page.drawRectangle({ x: hx, y: base, width: w, height: okH, color: RED });
        if (d.ko) page.drawRectangle({ x: hx, y: base + okH, width: w, height: koH, color: AMBER });
        if (count <= 12 || k % 2 === 0) txt(`${String(first + k * 10).slice(2)}s`, hx, base - 9, { s: 6.5, c: MUTED });
      }
      txt("red: successful   amber: failed", x0, base - 20, { s: 7, c: MUTED });
    }
    y = top - 14 - Math.max(rowsN * rh + 6, bh + 30);
  }
  para(narrative.region_note, { s: 8.5, c: MUTED });

  // ---------------------------------------------------------------- analyst background
  h2("Analyst background", "general knowledge of the country, not drawn from our database");
  h3("Historical background"); para(narrative.background);
  h3("Society and politics"); para(narrative.society_politics);
  h3("The security sector"); para(narrative.security_sector);

  // ---------------------------------------------------------------- present: press and ACLED
  h2("Current situation", "from the headlines below and our figures");
  para(`${narrative.current_situation.text}${narrative.current_situation.refs.length ? `  [${narrative.current_situation.refs.join(", ")}]` : ""}`);
  const digest = new Map((narrative.press_digest || []).map((d) => [d.ref, d.takeaway]));
  if (!press.items.length) para(`No headlines from the listed outlets were retrieved for this window${press.note ? ` (${press.note})` : ""}.`, { s: 8.5, c: MUTED });
  for (const p of press.items.filter((x) => digest.has(x.id)).concat(press.items.filter((x) => !digest.has(x.id)).slice(0, 3))) {
    ensure(34);
    txt(`${p.id}  ${p.date}  ${p.outlet}`, M, y - 8, { f: "b", s: 7.5, c: TEAL }); y -= 11;
    para(p.title, { s: 8.5, gap: digest.has(p.id) ? 1 : 4 });
    if (digest.has(p.id)) para(digest.get(p.id), { s: 8.3, c: MUTED, x: M + 10, w: CW - 10, gap: 4 });
  }
  para(`Outlets searched: ${[...new Set(Object.values(PRESS_SOURCES))].join(", ")}. Headlines only (last 60 days); the list filters sources, it does not verify facts.`, { s: 7.3, c: MUTED });

  // ---------------------------------------------------------------- scenarios, watch list
  h2("Scenarios for the window", "qualitative; no probabilities beyond the model's");
  const TAG = [TEAL, RED, CYAN];
  narrative.scenarios.forEach((sc, i) => {
    ensure(60); page.drawRectangle({ x: M, y: y - 11, width: 3, height: 11, color: TAG[i % 3] });
    txt(sc.name, M + 9, y - 9, { f: "b", s: 9.5 }); y -= 15;
    para(sc.description, { s: 9, x: M + 9, w: CW - 9, gap: 2 });
    para(`Signposts: ${sc.signposts.join("; ")}.`, { s: 8.3, c: MUTED, x: M + 9, w: CW - 9, gap: 8 });
  });
  h2("What to watch");
  narrative.watch_next.forEach((w) => { para(w.item, { f: "b", s: 9, gap: 0 }); para(w.why, { s: 9, x: M + 10, w: CW - 10, gap: 5 }); });

  h2("Caveats and method");
  narrative.caveats.forEach((c) => para(`- ${c}`, { s: 8.3, gap: 3 }));
  const mo = facts.model;
  para(`Model: calibrated ensemble of logistic regression, gradient boosting and random forest; target is at least one coup attempt (successful or failed) in the next 6 months. Out-of-sample since 1975: AUC ${mo.out_of_sample_auc_since_1975}; ${pct(mo.share_of_attempts_in_top_10_percent_beforehand, 0)} of attempts fell in the top decile beforehand. ${mo.variables} variables from V-Dem, World Bank, ACLED and a cross-checked coup database.`, { s: 7.8, c: MUTED });
  para(`Figures, records and charts come from the ToolCoup database. The narrative was written by ${model}; the three background sections draw on its general knowledge and may contain errors, so verify before relying on them. Forecast registry: /registry.`, { s: 7.8, c: MUTED });

  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: M - 6 }, end: { x: W - M, y: M - 6 }, thickness: 0.4, color: RULE });
    pg.drawText(clean(`ToolCoup | ${facts.country.name} | issue ${fc.issue} | generated ${generated}`), { x: M, y: M - 18, font: F.r, size: 7, color: MUTED });
    pg.drawText(`${i + 1} / ${pages.length}`, { x: W - M - 28, y: M - 18, font: F.r, size: 7, color: MUTED });
  });
  return pdf.save();
}
