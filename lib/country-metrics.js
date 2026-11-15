// Key figures for a country, derived only from the published data (no new modelling).
const ok = (e) => !e.dup && e.conf !== "D" && (e.type === "riuscito" || e.type === "fallito");
const sum = (a) => a.reduce((s, v) => s + (typeof v === "number" ? v : 0), 0);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (e) => { const [y, m, d] = e.date.split("-").map(Number); return e.prec === "year" ? `${y}` : e.prec === "month" ? `${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]} ${y}`; };

export function keyMetrics(country, meta) {
  const endYear = Number(meta.data_end.slice(0, 4)), endFrac = endYear + (Number(meta.data_end.slice(5, 7)) - 0.5) / 12;
  const ev = (country.coups || []).filter(ok).sort((a, b) => a.date.localeCompare(b.date));
  const yearsOf = (e) => endFrac - (Number(e.date.slice(0, 4)) + (Number(e.date.slice(5, 7) || 6) - 0.5) / 12);
  const last = ev.at(-1), lastWin = [...ev].reverse().find((e) => e.type === "riuscito");
  const since = (y) => ev.filter((e) => e.year >= y);
  // longest stretch without an attempt since 1950 (years between consecutive attempts, and from the last one to now)
  const marks = [1950, ...ev.filter((e) => e.year >= 1950).map((e) => Number(e.date.slice(0, 4)) + (Number(e.date.slice(5, 7) || 6) - 0.5) / 12), endFrac];
  let longest = 0; for (let i = 1; i < marks.length; i++) longest = Math.max(longest, marks[i] - marks[i - 1]);
  const s = country.series, tail = (k) => (s?.[k] || []);
  const yoy = (k) => { const a = tail(k); if (a.length < 24) return null; const now = sum(a.slice(-12)), prev = sum(a.slice(-24, -12)); return { now, prev, ratio: prev > 0 ? now / prev : null }; };
  const out = [];
  const delta = country.risk != null && country.risk_3m_ago != null ? country.risk - country.risk_3m_ago : null;
  if (!country.historical) {
    out.push({ k: "risk", label: `Probability · ${meta.horizon} months`, value: `${(country.risk * 100).toFixed(1)}%`, sub: `base rate ${(meta.base_rate * 100).toFixed(1)}%`, tone: country.risk / meta.base_rate >= 2 ? "hot" : "" });
    out.push({ k: "mult", label: "Versus the base rate", value: `${(country.risk / meta.base_rate).toFixed(1)}×`, sub: `rank ${country.rank} of ${country.rankOf ?? ""}`.trim() });
    if (delta != null) out.push({ k: "delta", label: "Change over 3 months", value: `${delta >= 0 ? "+" : "−"}${Math.abs(delta * 100).toFixed(2)} pp`, sub: `from ${(country.risk_3m_ago * 100).toFixed(1)}%`, tone: delta > 0.002 ? "up" : delta < -0.002 ? "down" : "" });
  }
  out.push({ k: "att", label: "Attempts since 1900", value: String(country.attempts), sub: `${country.successes} successful · A–C records` });
  out.push({ k: "att00", label: "Attempts since 2000", value: String(since(2000).length), sub: `${since(2000).filter((e) => e.type === "riuscito").length} successful` });
  const span = (e) => { const y = yearsOf(e); return y < 1 ? `${Math.max(1, Math.round(y * 12))} mo` : `${Math.floor(y)} yr${Math.floor(y) === 1 ? "" : "s"}`; };
  out.push({ k: "lastatt", label: "Since the last attempt", value: last ? span(last) : "none", sub: last ? fmtDate(last) : "no recorded attempt" });
  out.push({ k: "lastwin", label: "Since the last success", value: lastWin ? span(lastWin) : "none", sub: lastWin ? fmtDate(lastWin) : "none recorded" });
  if (ev.length) out.push({ k: "streak", label: "Longest calm since 1950", value: `${longest.toFixed(0)} yrs`, sub: "years between attempts" });
  const rate = ev.length ? Math.round((country.successes / Math.max(1, country.attempts)) * 100) : null;
  if (rate != null) out.push({ k: "rate", label: "Attempts that succeeded", value: `${rate}%`, sub: `${country.successes} of ${country.attempts}` });
  for (const [key, label] of [["unrest", "Protests & riots"], ["violence", "Political violence"], ["fatalities", "Reported fatalities"]]) {
    const y = yoy(key);
    if (y) out.push({ k: key, label: `${label} · 12 months`, value: y.now.toLocaleString("en-GB"), sub: y.ratio != null ? `${y.ratio >= 1 ? "+" : "−"}${Math.abs((y.ratio - 1) * 100).toFixed(0)}% vs prior 12` : `prior 12: ${y.prev}`, tone: y.ratio != null && y.ratio >= 1.5 ? "up" : "" });
  }
  const h = country.risk_hist?.values?.filter((v) => v != null) || [];
  if (h.length > 12 && !country.historical) { const pk = Math.max(...h); out.push({ k: "peak", label: "Model peak since 1975", value: `${(pk * 100).toFixed(1)}%`, sub: "retrospective estimate" }); }
  return out;
}
