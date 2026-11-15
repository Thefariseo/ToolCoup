// Pure, shared calculations for the country page, console and dossier evidence.
// Missing observations remain missing; a recorded zero is a valid observation.
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const median = (a) => {
  if (!a.length) return null;
  const b = [...a].sort((x, y) => x - y), m = Math.floor(b.length / 2);
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
};
const monthAt = (start, i) => {
  const [y, m] = start.split("-").map(Number), t = y * 12 + m - 1 + i;
  return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, "0")}`;
};

export const SIGNALS = [
  ["unrest", "Protests & riots"], ["violence", "Political violence"],
  ["fatalities", "Reported fatalities"], ["infighting", "State-force infighting"],
];

export function analyzeCountry(country, countries = []) {
  const peers = countries.filter((c) => !c.historical && c.region === country.region && finite(c.risk))
    .sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name));
  const peerValues = peers.filter((c) => c.slug !== country.slug).map((c) => c.risk);
  const history = country.risk_hist;
  const entries = (history?.values || []).map((v, i) => ({ v, i })).filter(({ v }) => finite(v));
  const past = entries.filter(({ i }) => i < (history?.values.length ?? 0) - 1);
  const peak = entries.reduce((best, entry) => !best || entry.v > best.v ? entry : best, null);
  const series = country.series;
  const signals = SIGNALS.map(([key, label]) => {
    const a = series?.[key] || [], last = a.slice(-3), baseline = a.slice(-27, -3);
    const recentValid = last.length === 3 && last.every(finite);
    const base = baseline.filter(finite), baseMean = base.length >= 6 ? mean(base) : null;
    const recentMean = recentValid ? mean(last) : null;
    return { key, label, recentMean, baselineMean: baseMean, baselineMonths: base.length,
      recentTotal: recentValid ? last.reduce((s, v) => s + v, 0) : null,
      ratio: recentMean != null && baseMean > 0 ? recentMean / baseMean : null,
      newActivity: recentMean > 0 && baseMean === 0,
      through: a.length && series?.start ? monthAt(series.start, a.length - 1) : null,
    };
  });
  const allAttempts = (country.coups || []).filter((e) => ["riuscito", "fallito"].includes(e.type) && !e.dup);
  const events = allAttempts.filter((e) => e.conf !== "D");
  const target = allAttempts.filter((e) => !["not exist", "combined"].includes(e.colpus) && e.prec !== "year" &&
    (e.conf === "A" || e.sources?.includes("Powell & Thyne")));
  return {
    delta: finite(country.risk) && finite(country.risk_3m_ago) ? country.risk - country.risk_3m_ago : null,
    region: { count: peers.length, rank: finite(country.risk) ? 1 + peers.filter((c) => c.risk > country.risk).length : null,
      median: median(peerValues), mean: mean(peerValues),
      peers: peers.filter((c) => c.slug !== country.slug).slice(0, 6).map(({ slug, name, risk }) => ({ slug, name, risk })) },
    history: { months: entries.length, median: median(past.map(({ v }) => v)),
      percentile: past.length && finite(country.risk) ? past.filter(({ v }) => v <= country.risk).length / past.length : null,
      peak: peak?.v ?? null, peakMonth: peak && history?.start ? monthAt(history.start, peak.i) : null },
    signals,
    archive: { attempts: events.length, successes: events.filter((e) => e.type === "riuscito").length,
      modelEvents: target.length, disputed: events.filter((e) => e.disputed).length,
      plots: (country.coups || []).filter((e) => e.type === "complotto" && !e.dup).length,
      since2000: events.filter((e) => e.year >= 2000).length },
  };
}
