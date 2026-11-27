export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const pct = (v, d) => {
  if (v == null || !Number.isFinite(v)) return "–";
  const digits = d ?? (v > 0 && v < 0.001 ? 2 : 1);
  const rounded = (v * 100).toFixed(digits);
  // A small positive probability must never be presented as an exact zero.
  return v > 0 && Number(rounded) === 0 ? `<${(10 ** -digits).toFixed(digits)}%` : `${rounded}%`;
};
export const num = (v) => (v == null ? "–" : v.toLocaleString("en-GB"));
export const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
/** A country's change in three months (a probability), and the same in percentage points with its sign. */
export const change = (c) => (c.risk_3m_ago == null ? 0 : c.risk - c.risk_3m_ago);
export const points = (d) => (Math.abs(d) < 0.0005 ? "0.0" : `${d > 0 ? "+" : "−"}${Math.abs(d * 100).toFixed(1)}`);
/** A country's chance against the reference base rate, as "6.6×". */
export const times = (ratio) => `${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)}×`;
export const dec = (v, d = 2) => (v == null ? "–" : v.toFixed(d));

/** "YYYY-MM" o "YYYY-MM-DD" -> Date UTC */
export function parseDate(s) {
  const [y, m = 1, d = 1] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export const addMonths = (d, k) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));
export const fmtMonth = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** Data di un evento rispettando la precisione nota (giorno, mese o solo anno). */
export function fmtEventDate(e) {
  const [y, m, d] = e.date.split("-").map(Number);
  if (e.prec === "year") return String(y);
  if (e.prec === "month") return `${MONTHS[m - 1]} ${y}`;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export const TYPE_LABEL = { riuscito: "Successful", fallito: "Failed", complotto: "Plot / alleged" };

export const money = (v) => (v == null ? "–" : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : `$${Math.round(v)}`);
// read in UTC with our own month names, so the server and every browser write the same words
export const fmtClose = (iso) => (iso ? fmtMonth(new Date(iso)) : "open-ended");
/** How the crowd's number sits against ours at the same horizon. The two are never blended: a gap is a prompt to look closer. */
export function marketVerdict(p, model) {
  if (p == null || model == null || !(model > 0)) return null;
  const r = p / model;
  if (r >= 3) return { kind: "above", text: `The market prices this ${r >= 10 ? Math.round(r) : r.toFixed(1)}× higher than our model.` };
  if (r <= 1 / 3) return { kind: "below", text: `Our model puts this ${1 / r >= 10 ? Math.round(1 / r) : (1 / r).toFixed(1)}× higher than the market.` };
  return { kind: "near", text: "Market and model are within a factor of three of each other." };
}
export const CONF_LABEL = {
  A: "High: Powell & Thyne, two academic sources, or called a coup by Wikipedia or Wikidata",
  B: "Good: one academic source with annual confirmation, or listed by Wikipedia without being called a coup",
  C: "Medium: one academic source alone",
  D: "Low: plot, alleged, not found by Colpus, or a local event",
};

/** One sentence about prediction-market sources that could not be read live, or null when all were. `status` is the API's per-source report. */
export function marketNotice(status) {
  const down = Object.entries(status || {}).filter(([, s]) => !s.ok);
  if (!down.length) return null;
  const names = down.map(([k]) => k).join(" and "), snap = down.find(([, s]) => s.fallback)?.[1], blocked = down.some(([, s]) => s.blocked);
  const when = snap ? new Date(snap.asOf).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
  return `Live prices from ${names} could not be read${blocked ? ": this network blocks betting sites" : ""}.${when ? ` Showing the last reading, from ${when}.` : " Some countries may be missing."}`;
}
