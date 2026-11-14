// Lays the dossier out as an A4 PDF with pdf-lib (no fonts to ship: the built-in Helvetica and Courier
// are used, so text is reduced to what WinAnsi can draw). Figures come from `facts`, never from the narrative.
import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PRESS_SOURCES } from "@/lib/dossier";

const W = 595.28, H = 841.89, M = 42, CW = W - 2 * M;
const INK = rgb(0.08, 0.1, 0.1), MUTED = rgb(0.4, 0.45, 0.45), TEAL = rgb(0.04, 0.5, 0.46), AMBER = rgb(0.82, 0.5, 0.02),
  CYAN = rgb(0.06, 0.55, 0.7), RED = rgb(0.85, 0.2, 0.1), RULE = rgb(0.84, 0.87, 0.87), BAND = rgb(0.02, 0.03, 0.03), WHITE = rgb(1, 1, 1);

const MAP = { "→": "->", "←": "<-", "–": "-", "—": "-", "…": "...", "≥": ">=", "≤": "<=", "▲": "^", "▼": "v", "’": "'", "‘": "'", "“": '"', "”": '"', " ": " ", "·": "-", "×": "x", "−": "-" };
const clean = (s) => String(s ?? "").replace(/[→←–—…≥≤▲▼’‘“” ·×−]/g, (c) => MAP[c] ?? c).replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF•€]/g, "?").replace(/\s+/g, " ").trim();
const pct = (v, d = 2) => (v == null ? "-" : `${(v * 100).toFixed(d)}%`);
const sign = (v, d = 2) => (v == null ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(d)}`);

export async function buildPdf({ facts, chart, narrative, press, model, generated }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`ToolCoup country dossier - ${facts.country.name}`); pdf.setAuthor("ToolCoup"); pdf.setSubject(`Issue ${facts.forecast.issue}`);
  const F = { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold), m: await pdf.embedFont(StandardFonts.Courier) };
  let page, y;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const ensure = (h) => { if (y - h < M + 22) newPage(); };
  const width = (t, f, s) => F[f].widthOfTextAtSize(t, s);
  const wrap = (text, f, s, w) => {
    const out = []; let line = "";
    for (const word of clean(text).split(" ")) {
      const t = line ? `${line} ${word}` : word;
      if (width(t, f, s) <= w || !line) line = t; else { out.push(line); line = word; }
    }
    if (line) out.push(line);
    return out;
  };
  const txt = (t, x, yy, { f = "r", s = 9.5, c = INK } = {}) => page.drawText(clean(t), { x, y: yy, font: F[f], size: s, color: c });
  const para = (t, { f = "r", s = 9.5, c = INK, x = M, w = CW - (x - M), lh = 1.42, gap = 5 } = {}) => {
    for (const ln of wrap(t, f, s, w)) { ensure(s * lh); txt(ln, x, y - s, { f, s, c }); y -= s * lh; }
    y -= gap;
  };
  const h2 = (t) => {
    ensure(40); y -= 10;
    txt(t.toUpperCase(), M, y - 8, { f: "b", s: 8.5, c: TEAL });
    page.drawLine({ start: { x: M, y: y - 13 }, end: { x: W - M, y: y - 13 }, thickness: 0.6, color: RULE });
    y -= 22;
  };

  // ---------------- first page: band, headline number, key figures
  newPage();
  const fc = facts.forecast;
  page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: BAND });
  txt("TOOLCOUP  /  COUNTRY DOSSIER", M, H - 28, { f: "b", s: 8.5, c: rgb(0.18, 0.83, 0.74) });
  txt(facts.country.name, M, H - 62, { f: "b", s: 26, c: WHITE });
  txt(`${facts.country.region}   |   Issue ${fc.issue}   |   Window ${fc.window[0]} to ${fc.window[1]}   |   Data through ${fc.data_through}`, M, H - 80, { s: 8.5, c: rgb(0.65, 0.72, 0.72) });
  y = H - 92 - 18;
  txt(pct(fc.probability_of_at_least_one_coup_attempt, 1), M, y - 36, { f: "b", s: 42, c: INK });
  wrap("probability of at least one coup attempt in the window (model estimate)", "r", 8, 205).forEach((ln, i) => txt(ln, M, y - 52 - i * 10, { s: 8, c: MUTED }));
  txt(`80% interval ${pct(fc.interval_80[0], 1)} to ${pct(fc.interval_80[1], 1)}`, M, y - 74, { s: 8, c: MUTED });
  const kx = 270, rows = [
    ["Rank", `${fc.rank} of ${fc.of_countries}`], ["Base rate multiple", `${fc.multiple_of_base_rate}x  (base ${pct(fc.base_rate, 2)})`],
    ["Change vs 3 months ago", fc.probability_3_months_ago == null ? "-" : `${sign((fc.probability_of_at_least_one_coup_attempt - fc.probability_3_months_ago) * 100)} pp`],
    ["Coup attempts since 1900", `${facts.coup_record.attempts_since_1900_confidence_A_to_C} (${facts.coup_record.successful} successful)`],
    ["Last recorded attempt", facts.coup_record.last ? `${facts.coup_record.last.date} (${facts.coup_record.last.type === "riuscito" ? "successful" : "failed"})` : "none"],
    ["Share of own history at or below today", facts.own_forecast_history ? pct(facts.own_forecast_history.current_percentile_in_own_history, 0) : "-"],
  ];
  rows.forEach(([k, v], i) => {
    const yy = y - 12 - i * 11.5;
    txt(k, kx, yy, { s: 8, c: MUTED }); txt(v, kx + 150, yy, { f: "b", s: 8.5 });
  });
  y -= 92;

  // ---------------- assessment
  h2("Assessment");
  para(narrative.headline, { f: "b", s: 11, lh: 1.35, gap: 6 });
  para(narrative.situation);

  // ---------------- risk chart: published monthly forecast, recorded coups
  const hist = facts.own_forecast_history;
  if (hist) {
    h2("Forecast history");
    ensure(120);
    const h0 = y - 4, ch = 74, x0 = M + 30, cw = CW - 36;
    const vals = chart.values;
    if (vals?.length) {
      const mx = Math.max(...vals, 0.01), n = vals.length, px = (i) => x0 + (i / (n - 1)) * cw, py = (v) => h0 - ch + (v / mx) * ch;
      page.drawLine({ start: { x: x0, y: h0 - ch }, end: { x: x0 + cw, y: h0 - ch }, thickness: 0.5, color: RULE });
      txt(pct(mx, 0), M, h0 - 6, { s: 7, c: MUTED }); txt("0", M + 20, h0 - ch - 2, { s: 7, c: MUTED });
      const y0 = +hist.series_from.slice(0, 4);
      for (let yr = Math.ceil(y0 / 10) * 10; yr <= +hist.series_to.slice(0, 4); yr += 10) {
        const i = (yr - y0) * 12; if (i >= n) break;
        page.drawLine({ start: { x: px(i), y: h0 - ch }, end: { x: px(i), y: h0 }, thickness: 0.3, color: RULE });
        txt(String(yr), px(i) + 2, h0 - ch - 10, { s: 7, c: MUTED });
      }
      for (const e of chart.events) {
        const i = (+e.date.slice(0, 4) - y0) * 12 + (+e.date.slice(5, 7) - 1);
        if (i < 0 || i >= n) continue;
        page.drawLine({ start: { x: px(i), y: h0 - ch }, end: { x: px(i), y: h0 + 4 }, thickness: 0.6, color: RED, dashArray: [2, 2] });
        page.drawCircle({ x: px(i), y: h0 + 5, size: 2, color: e.outcome === "successful" ? RED : WHITE, borderColor: RED, borderWidth: 0.8 });
      }
      for (let i = 1; i < n; i++) page.drawLine({ start: { x: px(i - 1), y: py(vals[i - 1]) }, end: { x: px(i), y: py(vals[i]) }, thickness: 0.8, color: INK });
    }
    y = h0 - ch - 20;
    para(`Monthly out-of-sample forecast since ${hist.series_from}. Peak ${pct(hist.peak, 1)} in ${hist.peak_month}; median ${pct(hist.median, 2)}. Circles mark recorded coup attempts (filled = successful).`, { s: 8, c: MUTED });
  }

  // ---------------- indicators
  h2("Risk indicators");
  const DIR = { raises: ["RAISES", AMBER], lowers: ["LOWERS", CYAN], mixed: ["MIXED", MUTED] };
  for (const it of narrative.indicators) {
    const [d, col] = DIR[it.direction] || DIR.mixed, head = wrap(it.name, "b", 9.5, CW - 70);
    const lines = wrap(it.reading, "r", 9, CW - 70).length + wrap(it.evidence, "r", 8.5, CW - 70).length;
    ensure(14 + lines * 12 + 8);
    txt(d, M, y - 9, { f: "b", s: 7.5, c: col });
    for (const ln of head) { txt(ln, M + 62, y - 9.5, { f: "b", s: 9.5 }); y -= 12; }
    y += 0;
    para(it.reading, { s: 9, x: M + 62, w: CW - 62, gap: 1 });
    para(`${it.evidence}  [${it.basis}${it.refs.length ? `: ${it.refs.join(", ")}` : ""}]`, { s: 8.5, c: MUTED, x: M + 62, w: CW - 62, gap: 7 });
  }

  // ---------------- model drivers
  h2("Model drivers (logistic component, log-odds)");
  const dr = facts.drivers_linear_component_log_odds, top = Math.max(0.1, ...dr.map((d) => Math.abs(d.contribution)));
  for (const d of dr) {
    ensure(15);
    const cx = M + 300, len = (Math.abs(d.contribution) / top) * 120, col = d.contribution > 0 ? AMBER : CYAN;
    txt(d.driver, M, y - 9, { s: 8.5 });
    page.drawRectangle({ x: d.contribution > 0 ? cx : cx - len, y: y - 10, width: Math.max(1, len), height: 8, color: col });
    txt(sign(d.contribution), d.contribution > 0 ? cx + len + 5 : cx - len - 32, y - 9, { f: "b", s: 8, c: col });
    y -= 15;
  }
  para("Six largest terms of the interpretable component; amber raises the score, cyan lowers it. Associations in the training data, not causes. Tree-based components are not decomposed.", { s: 8, c: MUTED });

  // ---------------- ACLED
  const ac = facts.acled_recent;
  if (ac) {
    h2(`ACLED activity, last 12 months (through ${ac.data_through})`);
    const cols = [M, M + 200, M + 285, M + 375, M + 460];
    ["INDICATOR", "LAST 12 MO", "PRIOR 36 MO / MO", "LAST 12 MO / MO", "RATIO"].forEach((t, i) => txt(t, cols[i], y - 8, { f: "b", s: 7.5, c: MUTED }));
    y -= 14;
    for (const [k, v] of Object.entries(ac.baseline_36_months_before)) {
      ensure(14);
      const tot = ac.monthly_counts_last_12[k].reduce((s, a) => s + a, 0);
      [k.replace(/_/g, " "), String(tot), String(v.mean_per_month), String(v.last_12_mean_per_month), v.ratio == null ? "-" : `${v.ratio}x`].forEach((t, i) => txt(t, cols[i], y - 8, { s: 8.5, f: i === 4 ? "b" : "r" }));
      y -= 13;
    }
    y -= 4;
  }

  // ---------------- region
  h2("Regional context");
  const rg = facts.region;
  para(`${rg.name}: ${rg.countries} countries, mean probability ${pct(rg.mean_probability, 2)}. Highest in the region: ${rg.highest.map((c) => `${c.country} ${pct(c.probability, 1)} (#${c.rank})`).join("; ")}.`);

  // ---------------- press
  h2("Press briefing (headlines, last 60 days)");
  if (!press.items.length) para(`No headlines from the listed outlets were retrieved for this window${press.note ? ` (${press.note})` : ""}.`, { c: MUTED });
  const digest = new Map((narrative.press_digest || []).map((d) => [d.ref, d.takeaway]));
  for (const p of press.items) {
    const head = `${p.id}  ${p.date}  ${p.outlet}`;
    ensure(34);
    txt(head, M, y - 8, { f: "b", s: 8, c: TEAL }); y -= 11;
    para(p.title, { s: 8.5, gap: digest.has(p.id) ? 1 : 5 });
    if (digest.has(p.id)) para(`Reading: ${digest.get(p.id)}`, { s: 8.5, c: MUTED, x: M + 10, w: CW - 10, gap: 5 });
  }
  para(`Outlets searched: ${[...new Set(Object.values(PRESS_SOURCES))].join(", ")}. Only headlines are retrieved, not article text, and the allow-list is a source filter, not a fact-check.`, { s: 7.5, c: MUTED });

  // ---------------- watch list, caveats, method
  h2("What to watch in the window");
  narrative.watch_next.forEach((w) => { para(`${w.item}`, { f: "b", s: 9, gap: 0 }); para(w.why, { s: 9, x: M + 10, w: CW - 10, gap: 5 }); });
  h2("Caveats and method");
  narrative.caveats.forEach((c) => para(`- ${c}`, { s: 8.5, gap: 3 }));
  const mo = facts.model;
  para(`Model: ${mo.description} Out-of-sample since 1975: AUC ${mo.out_of_sample_auc_since_1975}, Brier skill ${mo.brier_skill_since_1975}, ${pct(mo.share_of_attempts_in_top_10_percent_beforehand, 0)} of attempts fell in the top decile beforehand. ${mo.variables} variables from V-Dem, World Bank, ACLED and a cross-checked coup database (Powell & Thyne and others).`, { s: 8, c: MUTED });
  para(`Figures, records and charts are taken from the ToolCoup database. The narrative was written by ${model} from those figures and the headlines listed above, and is not independent reporting. Forecast registry: /registry.`, { s: 8, c: MUTED });

  // ---------------- footer on every page
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: M - 6 }, end: { x: W - M, y: M - 6 }, thickness: 0.4, color: RULE });
    pg.drawText(clean(`ToolCoup | ${facts.country.name} | issue ${fc.issue} | generated ${generated}`), { x: M, y: M - 18, font: F.r, size: 7, color: MUTED });
    pg.drawText(`${i + 1} / ${pages.length}`, { x: W - M - 28, y: M - 18, font: F.r, size: 7, color: MUTED });
  });
  return pdf.save();
}
