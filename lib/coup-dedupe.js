// The rule behind lib/coup-fix.js, as a pure function so it can be tested on the published files. One entry per country-day: the best attested
// stays (higher confidence, then more academic sources, then more sources of any kind), the others are flagged `dup` and taken out of the counts.
const RANK = { A: 3, B: 2, C: 1 };
const score = (e) => (RANK[e.conf] || 0) * 1e4 + (e.nsch || 0) * 100 + String(e.sources || "").split(";").length;
const counted = (e) => (e.type === "riuscito" || e.type === "fallito") && e.conf !== "D" && !e.dup;

/** Mutates `coups`, `countries` (attempts, successes, last) and `summary.timeline` in place; returns the flagged entries. Safe to run twice. */
export function dedupeSameDay({ coups, countries, summary }) {
  const days = new Map(), flagged = [];
  for (const e of coups) if (counted(e) && e.prec === "day") { const k = `${e.slug}|${e.date}`; (days.get(k) || days.set(k, []).get(k)).push(e); }
  for (const group of days.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => score(b) - score(a));
    const keep = group[0], country = countries.find((c) => c.slug === keep.slug), y = summary.timeline.find((t) => t.year === keep.year);
    for (const e of group.slice(1)) {
      e.dup = keep.id; flagged.push(e);
      if (country) { country.attempts -= 1; if (e.type === "riuscito") country.successes -= 1; }
      if (y?.[e.conf]) y[e.conf][e.type === "riuscito" ? 0 : 1] -= 1;
    }
    if (country?.last?.date === keep.date) country.last = { ...country.last, type: keep.type };
  }
  return flagged;
}
