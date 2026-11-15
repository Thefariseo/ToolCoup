// Which lines of reporting to look for, decided from our own data. Pure: no network and no imports, so it can be tested on its own.
// Each angle is a question the data raise (protests above their baseline, a regional body that suspended the country, an election, a ruler of
// eighty); `pressPlan` returns the strongest ones for a country with the plain reason each was chosen.

export const ANGLES = {
  coup: { label: "Coup talk", terms: 'coup OR putsch OR junta OR mutiny OR "military takeover" OR "coup attempt" OR "coup plot"' },
  transition: { label: "Transition after a coup", terms: 'transition OR transitional OR "counter-coup" OR junta OR timetable OR dissolved OR "national dialogue" OR "referendum"' },
  military: { label: "The armed forces", terms: 'army OR "armed forces" OR military OR generals OR "defence minister" OR "chief of staff" OR soldiers OR officers OR "security forces"' },
  politics: { label: "Politics and succession", terms: 'election OR vote OR parliament OR constitution OR "term limit" OR succession OR opposition OR impeachment OR "no-confidence" OR "supreme court"' },
  leader: { label: "The ruler", terms: 'president OR "prime minister" OR "head of state" OR health OR successor OR "third term" OR "term extension"' },
  unrest: { label: "Street protest", terms: 'protest OR protesters OR demonstrators OR strike OR riot OR unrest OR crackdown' },
  violence: { label: "Organised violence", terms: 'attack OR clashes OR militants OR insurgents OR rebels OR militia OR killed OR massacre OR "armed groups"' },
  economy: { label: "Economic stress", terms: 'inflation OR currency OR devaluation OR debt OR IMF OR "fuel prices" OR budget OR default OR "cost of living" OR austerity OR fiscal' },
  region: { label: "Regional pressure", terms: 'ECOWAS OR "African Union" OR sanctions OR mediation OR OAS OR ASEAN OR "Arab League" OR neighbours' },
};
const ARMY_HEAVY = ["post_coup", "repeat_player", "conflict_state", "fragile_autocracy", "entrenched_autocracy", "aging_ruler"];
const DEMOCRACY = ["tested_democracy", "settled_democracy", "consolidated"];
const num = (v, d = 1) => (v == null ? null : Number(v).toFixed(d));
const esc = (re) => re.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The search engine matches the whole article, so a football match can come back for "politics". A headline has to carry one of the angle's own
// words (as a word start: "protest" takes "protesters") and no sports or entertainment word.
const reOf = (terms) => new RegExp(`\\b(${terms.split(" OR ").map((t) => esc(t.replace(/"/g, "").trim())).join("|")})`, "i");
export const OFF_TOPIC = /\b(football|soccer|friendly|tournament|league|grand prix|formula|olympic|world cup|goal|brace|red card|striker|midfielder|transfer window|coach|f1|nba|nfl|cricket|rugby|tennis|golf|oscar|album|concert|film|movie|recipe|fashion)\b/i;

/** The angles worth searching for this country, strongest first, each with the plain reason it was chosen. Pure: no network. */
export function pressPlan(facts) {
  const g = Object.fromEntries((facts.groups || []).map((x) => [x.key, x.contribution_log_odds || 0]));
  const base = facts.acled_recent?.baseline_36_months_before || {};
  const un = base.protests_and_riots?.ratio, vi = base.political_violence_events?.ratio, vo = facts.violence_outlook?.change_vs_last_6;
  const pf = facts.profile, key = pf.key, ev = pf.evidence || {};
  const hot = (re) => (pf.signposts || []).filter((s) => re.test(s.label) && s.status !== "ok");
  const cand = [];
  const add = (angle, score, why) => { if (score > 0) cand.push({ angle, score, why }); };

  add("coup", 1, `the question the brief answers: ${pf.archetype.toLowerCase()}`);
  if (ev.last_successful_coup && ev.years_since_last_success <= 6) add("transition", 1.2, `the last successful coup was on ${ev.last_successful_coup}`);
  if (ARMY_HEAVY.includes(key)) add("military", 0.9 + Math.max(0, g.regime || 0) * 0.3, `${pf.archetype.toLowerCase()}: the army is the actor that decides`);
  else if ((g.regime || 0) > 0.3) add("military", 0.6, "regime evidence pushes the estimate up");
  if (DEMOCRACY.includes(key) || key === "aging_ruler") add("politics", 0.9, `${ev.regime || "the regime"}: risk runs through elections, courts and succession`);
  else if ((g.leader || 0) > 0.2) add("politics", 0.8, "leader and election evidence pushes the estimate up");
  if (!DEMOCRACY.includes(key) && (ev.head_of_state_age >= 75 || key === "aging_ruler")) add("leader", 0.9, `the head of state is ${ev.head_of_state_age ?? "elderly"}`);
  if (un != null && (un >= 1.1 || hot(/Protests/).length)) add("unrest", 0.6 + Math.max(0, un - 1) * 0.8 + (g.piazza || 0) * 0.3, `protests and riots at ${num(un)}x the prior three-year average`);
  if ((vi != null && vi >= 1.1) || (vo != null && vo >= 0.15) || key === "conflict_state") add("violence", 0.6 + Math.max(0, (vi || 1) - 1) * 0.8 + (key === "conflict_state" ? 0.5 : 0), `political-violence events ${vi != null ? `${num(vi)}x the prior three-year average` : "elevated"}${vo != null ? `, our outlook ${vo >= 0 ? "+" : ""}${Math.round(vo * 100)}% against the last six periods` : ""}`);
  const eco = hot(/prices|currency|Reserves/);
  if ((g.economia || 0) > 0.2 || eco.length) add("economy", 0.7 + (g.economia || 0) * 0.4 + eco.length * 0.3, eco.length ? eco.map((s) => `${s.label.toLowerCase()} ${s.now}`).join("; ") : "economic evidence pushes the estimate up");
  const reg = hot(/Regional-body|region/);
  if ((g.contagio || 0) > 0.2 || reg.length || ev.attempts_in_region_last_24_months >= 1) add("region", 0.6 + (g.contagio || 0) * 0.4 + reg.length * 0.4, reg.length ? reg.map((s) => s.label.toLowerCase()).join("; ") : `${ev.attempts_in_region_last_24_months} attempt${ev.attempts_in_region_last_24_months === 1 ? "" : "s"} in the region in the last 24 months`);

  const seen = new Set(), plan = [];
  for (const c of cand.sort((a, b) => b.score - a.score)) if (!seen.has(c.angle)) { seen.add(c.angle); plan.push(c); }
  for (const fill of ["politics", "military"]) if (plan.length < 4 && !seen.has(fill)) { seen.add(fill); plan.push({ angle: fill, score: 0.3, why: "the baseline questions for any country" }); }
  return plan.slice(0, 5).map(({ angle, why }) => ({ angle, label: ANGLES[angle].label, terms: ANGLES[angle].terms, re: reOf(ANGLES[angle].terms), why }));
}
