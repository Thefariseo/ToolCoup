export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const pct = (v, d = 1) => (v == null ? "–" : (v * 100).toFixed(d) + "%");
export const num = (v) => (v == null ? "–" : v.toLocaleString("en-GB"));
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
export const CONF_LABEL = {
  A: "High: at least two academic sources",
  B: "Good: one academic and one encyclopedic source",
  C: "Medium: one academic or two encyclopedic sources",
  D: "Low: one encyclopedic source or plot only",
};
