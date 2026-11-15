// What the Model Trace needs besides the selected country: the reference the group terms are measured from, and where every country
// stands on each group. Read straight from the published export; nothing is recomputed.
//   ref    probability of the reference country: the logistic component's intercept (its output minus the sum of the group terms)
//   peers  per group, the terms of all countries with structural records, as [value, count] pairs in steps of 0.05 log-odds
import countries from "@/webdata/countries.json";
import details from "@/webdata/details.json";

const KEYS = ["storia", "contagio", "regime", "leader", "economia", "piazza", "acled"];
const logit = (p) => { const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6); return Math.log(q / (1 - q)); };
const expit = (z) => 1 / (1 + Math.exp(-z));
let memo = null;

export function tracePeers() {
  if (memo) return memo;
  const peers = Object.fromEntries(KEYS.map((k) => [k, new Map()])), refs = [];
  let n = 0;
  for (const c of countries) {
    if (c.historical || c.risk == null || !c.groups?.length) continue;
    const comp = details[c.slug]?.diagnostics?.components?.find((x) => x.key === "logit");
    if (comp) refs.push(logit(comp.probability) - c.groups.reduce((s, g) => s + g.contrib, 0));
    if (!c.structural) continue;                         // territories without structural records carry imputed terms: they would distort the strips
    n++;
    for (const g of c.groups) {
      const m = peers[g.key]; if (!m) continue;
      const v = Math.round(g.contrib * 20) / 20 + 0;     // + 0 turns -0 into 0
      m.set(v, (m.get(v) || 0) + 1);
    }
  }
  refs.sort((a, b) => a - b);
  memo = { ref: refs.length ? expit(refs[Math.floor(refs.length / 2)]) : null, n, peers: Object.fromEntries(KEYS.map((k) => [k, [...peers[k]].sort((a, b) => a[0] - b[0])])) };
  return memo;
}
