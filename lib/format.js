export const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export const pct = (v, d = 1) => (v == null ? "–" : (v * 100).toFixed(d).replace(".", ",") + "%");
export const num = (v) => (v == null ? "–" : v.toLocaleString("it-IT"));
export const dec = (v, d = 2) => (v == null ? "–" : v.toFixed(d).replace(".", ","));

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

export const TYPE_LABEL = { riuscito: "Riuscito", fallito: "Fallito", complotto: "Complotto o presunto" };
export const CONF_LABEL = {
  A: "Alta: almeno due fonti accademiche",
  B: "Buona: una fonte accademica più una enciclopedica",
  C: "Media: una fonte accademica sola, o due enciclopediche",
  D: "Bassa: una sola fonte enciclopedica o solo complotto",
};
