// Accesso ai dati lato server. Oggi legge i file prodotti dalla pipeline (webdata/);
// le funzioni sono l'unico punto da cambiare se in futuro i dati passano a un database.
import summary from "@/webdata/summary.json";
import countries from "@/webdata/countries.json";
import details from "@/webdata/details.json";
import coups from "@/webdata/coups.json";

export const CONFIDENCE = ["A", "B", "C", "D"];
const bySlug = new Map(countries.map((c) => [c.slug, c]));

export function getSummary() {
  return summary;
}

/** Elenco paesi senza i campi pesanti (per mappa, classifica e ricerca). */
export function listCountries({ q } = {}) {
  const needle = (q || "").trim().toLowerCase();
  return countries
    .filter((c) => !needle || c.name.toLowerCase().includes(needle) || (c.region || "").toLowerCase().includes(needle))
    .map(({ drivers, groups, ...light }) => light);
}

export function allSlugs() {
  return countries.map((c) => c.slug);
}

/**
 * Eventi del database dei golpe.
 * conf: livello minimo di affidabilita' (A = solo A, C = A-C, D = tutti)
 * types: tipi ammessi; dup: includere i possibili doppioni
 */
export function queryCoups({ from, to, slug, conf = "C", types, dup = false } = {}) {
  const allowed = new Set(CONFIDENCE.slice(0, CONFIDENCE.indexOf(conf) + 1));
  const kinds = types && types.length ? new Set(types) : null;
  return coups.filter(
    (e) =>
      allowed.has(e.conf) &&
      (!kinds || kinds.has(e.type)) &&
      (dup || !e.dup) &&
      (!slug || e.slug === slug) &&
      (!from || e.year >= from) &&
      (!to || e.year <= to)
  );
}

export function getCountry(slug) {
  const country = bySlug.get(slug);
  if (!country) return null;
  return { ...country, ...(details[slug] || {}), coups: queryCoups({ slug, conf: "D", dup: true }) };
}

/** Tentativi per anno (riusciti, falliti) al livello di affidabilita' richiesto. */
export function getTimeline(conf = "C") {
  const levels = CONFIDENCE.slice(0, CONFIDENCE.indexOf(conf) + 1);
  return summary.timeline.map((y) => ({
    year: y.year,
    success: levels.reduce((n, l) => n + y[l][0], 0),
    failed: levels.reduce((n, l) => n + y[l][1], 0),
  }));
}

/**
 * Structure of the forecasting model for the evidence graph: feature groups in display order, every
 * variable with its group, its odds ratio in the linear component, and in how many countries it is
 * one of the six largest contributions. Read from the pipeline export; nothing is recomputed.
 */
const GROUP_ORDER = ["storia", "contagio", "acled", "piazza", "regime", "leader", "economia", "tempo"];
const TREND = { key: "tempo", label: "Tendenza storica" };
const SPLINE = "Tempo dall'ultimo tentativo (curva)";
export function traceModel() {
  const groups = [...summary.meta.groups.map(({ key, label }) => ({ key, label })), TREND]
    .sort((a, b) => GROUP_ORDER.indexOf(a.key) - GROUP_ORDER.indexOf(b.key));
  const keyOf = new Map(groups.map((g) => [g.label, g.key]));
  const freq = new Map();
  for (const c of countries) for (const d of c.drivers || []) freq.set(d.label, (freq.get(d.label) || 0) + 1);
  const features = summary.factors.map((f) => ({ label: f.label, group: keyOf.get(f.group) || "tempo", odds: f.odds_ratio }));
  features.push({ label: SPLINE, group: "storia", odds: null });
  return {
    groups,
    features: features
      .map((f) => ({ ...f, freq: freq.get(f.label) || 0 }))
      .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || b.freq - a.freq),
  };
}
