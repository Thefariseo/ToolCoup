// What kind of situation is this country in, and what should a reader watch? Computed from our own data, with fixed rules, so that the
// brief is built around the country's actual configuration instead of one template. Nothing here comes from a language model: the
// archetype, the signposts and their alert levels are rules over the database, and the narrative is asked to work with them.
import { getStanding, getViolence } from "@/lib/outlook";

const YEAR = 365.25 * 864e5;
const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const pp = (v) => `${v >= 0 ? "+" : "-"}${Math.abs(v * 100).toFixed(1)} pp`;
const ratioTxt = (v) => (v == null ? null : `${v.toFixed(1)}x`);

/** The configurations a country can be in, in the order they are tried. `question` is what the brief has to answer for it. */
export const ARCHETYPES = {
  post_coup: { label: "Post-coup regime", question: "Is the new ruling circle consolidating, or splitting?",
    frame: "A regime that came to power by force has the highest odds of a counter-coup in its first years: the factions that made the coup have not yet agreed who holds what, the promised transition clock creates deadlines, and outside bodies (regional organisations, creditors, patrons) press from several sides." },
  repeat_player: { label: "Repeat player", question: "What keeps the coup option alive here, and what would close it?",
    frame: "Coups here are a repeated game: each attempt leaves behind officers who took part, grievances that were never settled and a precedent that makes the next one thinkable. The probability reflects that memory more than any single current trigger." },
  aging_ruler: { label: "Aging ruler, succession risk", question: "Who decides the succession, and does the army back that choice?",
    frame: "When one ruler has held power for decades, the danger is the moment the ruler dies, falls ill or loses control of the security services: the succession is settled inside a small circle, and a coup is one way to settle it." },
  conflict_state: { label: "State at war", question: "Is the army winning, stretched, or turning on its own command?",
    frame: "A state fighting an armed conflict puts its army under strain: battlefield defeats, unpaid or humiliated units and blame for losses are classic triggers, while the same conflict gives the leadership reasons and tools to keep officers loyal." },
  fragile_autocracy: { label: "Fragile autocracy", question: "Can the regime still buy the loyalty of the security services and keep the street quiet?",
    frame: "An autocracy without a settled succession or a broad base relies on the loyalty of a few units and on money to pay them. Economic stress or a surge in protest tests both at once." },
  contagion_exposed: { label: "Exposed to regional contagion", question: "Do neighbouring coups change the calculus of officers here?",
    frame: "Coups cluster in space and time: a successful one next door signals to officers that it can be done, that regional bodies may not act, and that new partners will deal with whoever holds the capital." },
  entrenched_autocracy: { label: "Entrenched autocracy", question: "What would loosen the ruler's grip on the security services?",
    frame: "Where the ruler or the party has long subordinated the army, coups are rare and the probability is low, but the evidence is poor: little is reported, and the events that change the picture (a purge, a succession, a sudden loss of legitimacy) come from inside the circle." },
  consolidated: { label: "Consolidated, low base rate", question: "What would have to change for the risk to rise?",
    frame: "The probability here is close to the floor and says little by itself. The useful questions are which norms and institutions keep it low, and what kind of shock (a contested election, a constitutional crisis, a break between government and army) could change that." },
  mixed: { label: "Mixed profile", question: "Which single factor is carrying the estimate?",
    frame: "No one configuration dominates: the estimate is the sum of several moderate pushes, so the useful question is which of them can move within the window." },
};

const years = (s) => (s ? (Date.now() - Date.parse(s)) / YEAR : null);
const monthIdx = (m) => +m.slice(0, 4) * 12 + +m.slice(5, 7);
// the same country in neighbouring months is one case, not two
const distinct = (list) => list.filter((c, i) => !list.slice(0, i).some((o) => o.country === c.country && Math.abs(monthIdx(o.month) - monthIdx(c.month)) <= 24));

/** Signposts: an indicator, its current reading, where it would become an alert, and where it stands today. Only indicators with data are returned. */
function signposts(p) {
  const f = p.facts, st = p.standing || {}, v = f.violence_outlook, ac = f.acled_recent, out = {};
  const d3 = f.forecast.probability_3_months_ago == null ? null : f.forecast.probability_of_at_least_one_coup_attempt - f.forecast.probability_3_months_ago;
  if (d3 != null) out.risk_change = { label: "Coup probability, 3-month change", now: pp(d3), alert: "+2.0 pp", status: d3 >= 0.02 ? "alert" : d3 >= 0.01 ? "watch" : "ok" };
  if (v?.change_vs_last_6 != null) out.violence = { label: "Organised-violence outlook vs 6-period average", now: `${v.change_vs_last_6 >= 0 ? "+" : ""}${Math.round(v.change_vs_last_6 * 100)}%`, alert: "+50%", status: v.change_vs_last_6 >= 0.5 ? "alert" : v.change_vs_last_6 >= 0.25 ? "watch" : "ok" };
  const un = ac?.baseline_36_months_before?.protests_and_riots?.ratio;
  if (un != null) out.unrest = { label: "Protests and riots, last 12 months vs prior 3 years", now: ratioTxt(un), alert: "1.6x", status: un >= 1.6 ? "alert" : un >= 1.3 ? "watch" : "ok" };
  const fat = ac?.baseline_36_months_before?.reported_fatalities?.ratio;
  if (fat != null) out.fatalities = { label: "Reported fatalities, last 12 months vs prior 3 years", now: ratioTxt(fat), alert: "1.6x", status: fat >= 1.6 ? "alert" : fat >= 1.3 ? "watch" : "ok" };
  if (st.currency?.change_12m_pct != null) out.currency = { label: "Local currency per US dollar, 12 months", now: `${st.currency.change_12m_pct >= 0 ? "+" : ""}${st.currency.change_12m_pct.toFixed(0)}%`, alert: "+20% (weaker)", status: st.currency.change_12m_pct >= 20 ? "alert" : st.currency.change_12m_pct >= 10 ? "watch" : "ok" };
  if (st.prices?.cpi_yoy != null) out.prices = { label: "Consumer prices, year on year", now: `${st.prices.cpi_yoy >= 0 ? "+" : ""}${st.prices.cpi_yoy.toFixed(0)}%`, alert: "+20%", status: st.prices.cpi_yoy >= 20 ? "alert" : st.prices.cpi_yoy >= 10 ? "watch" : "ok" };
  if (st.reserves_months?.value != null) out.reserves = { label: "Reserves, months of imports", now: st.reserves_months.value.toFixed(1), alert: "below 3", status: st.reserves_months.value < 3 ? "alert" : st.reserves_months.value < 4 ? "watch" : "ok" };
  if (st.news?.tone_z != null) out.news = { label: "News tone against its own usual", now: `${st.news.tone_z >= 0 ? "+" : "-"}${Math.abs(st.news.tone_z).toFixed(1)} sd`, alert: "-2 sd", status: st.news.tone_z <= -2 ? "alert" : st.news.tone_z <= -1 ? "watch" : "ok" };
  if (p.regionRecent != null) out.contagion = { label: "Attempts in the region, last 24 months", now: String(p.regionRecent), alert: "2 or more", status: p.regionRecent >= 2 ? "alert" : p.regionRecent >= 1 ? "watch" : "ok" };
  const susp = (st.suspensions || []).find((x) => !x.end);
  if (susp) out.standing = { label: `Regional-body standing (${susp.body} suspended since ${susp.start})`, now: "suspended", alert: "lifted or tightened", status: "watch" };
  const age = st.leaders?.head_of_state_age;
  if (age != null) out.leader_age = { label: `Head of state, age (${st.leaders.head_of_state})`, now: String(age), alert: "80", status: age >= 80 ? "alert" : age >= 75 ? "watch" : "ok" };
  const evade = st.term_limit_evasion?.years?.filter((y) => y >= new Date().getFullYear() - 10);
  if (evade?.length) out.term_limit = { label: "Term-limit evasion, last 10 years", now: evade.join(", "), alert: "a new attempt", status: "watch" };
  return out;
}

const PICK = {
  post_coup: ["standing", "risk_change", "violence", "prices", "currency", "unrest", "contagion", "news"],
  repeat_player: ["risk_change", "unrest", "currency", "prices", "violence", "contagion", "news"],
  aging_ruler: ["leader_age", "term_limit", "risk_change", "unrest", "currency", "news"],
  conflict_state: ["violence", "fatalities", "risk_change", "reserves", "news", "contagion", "currency"],
  fragile_autocracy: ["unrest", "prices", "currency", "reserves", "risk_change", "news", "violence"],
  contagion_exposed: ["contagion", "risk_change", "unrest", "news", "currency", "violence"],
  entrenched_autocracy: ["risk_change", "leader_age", "unrest", "violence", "currency", "news"],
  consolidated: ["risk_change", "unrest", "news", "violence", "contagion"],
  mixed: ["risk_change", "unrest", "violence", "currency", "prices", "news", "contagion"],
};

/** `ctx`: { slug, me, full, facts, list } straight from buildFacts. Returns the archetype, its frame, the signposts and the closest historical cases. */
export function buildProfile({ slug, me, full, facts, list, analogs }) {
  const standing = getStanding(slug), vio = getViolence(slug);
  const events = (full.coups || []).filter((e) => e.type !== "complotto" && e.conf !== "D" && !e.dup && e.prec !== "year").sort((a, b) => b.date.localeCompare(a.date));
  const success = events.find((e) => e.type === "riuscito"), sinceSuccess = success ? years(success.date) : null;
  const a1950 = events.filter((e) => e.year >= 1950).length, a2000 = events.filter((e) => e.year >= 2000).length, a1990 = events.filter((e) => e.year >= 1990).length;
  const regime = full.diagnostics?.regime || "", autocracy = /autocracy/i.test(regime), democracy = /democracy/i.test(regime);
  const tenure = full.diagnostics?.indicators?.find((i) => i.key === "l_tenure")?.value;
  const age = standing?.leaders?.head_of_state_age;
  const regionRecent = list.filter((c) => c.region === me.region && c.slug !== slug && c.last?.date && years(c.last.date) <= 2).length;
  const ma6 = vio?.country?.ma6 ?? 0, un = facts.acled_recent?.baseline_36_months_before?.protests_and_riots?.ratio;

  const matches = [];
  if (success && sinceSuccess <= 5) matches.push("post_coup");
  if (ma6 >= 150 || (ma6 >= 60 && me.pos <= 60)) matches.push("conflict_state");
  if (a1950 >= 5 || a2000 >= 2) matches.push("repeat_player");
  if (!democracy && ((age != null && age >= 75) || (tenure != null && tenure >= 25))) matches.push("aging_ruler");     // a ceremonial head of state in a democracy is not a succession risk
  if (autocracy && ((un != null && un >= 1.3) || (standing?.prices?.cpi_yoy ?? 0) >= 15 || (standing?.currency?.change_12m_pct ?? 0) >= 15)) matches.push("fragile_autocracy");
  if (regionRecent >= 2) matches.push("contagion_exposed");
  if (autocracy && a2000 === 0 && me.risk < 0.02) matches.push("entrenched_autocracy");
  if (me.risk < 0.006 && democracy && a1990 === 0) matches.push("consolidated");
  const key = matches[0] || "mixed", A = ARCHETYPES[key];

  const all = signposts({ facts, standing, regionRecent });
  const chosen = PICK[key].map((k) => all[k]).filter(Boolean).slice(0, 6);
  const a = analogs;
  return {
    archetype: A.label, key, question: A.question, frame: A.frame,
    also: matches.slice(1).map((k) => ARCHETYPES[k].label),
    evidence: {
      attempts_since_1950: a1950, attempts_since_2000: a2000, last_successful_coup: success ? success.date.slice(0, success.prec === "month" ? 7 : 10) : null,
      years_since_last_success: sinceSuccess == null ? null : +sinceSuccess.toFixed(1), regime: regime || null, head_of_state_age: age ?? null, tenure_years: tenure ?? null,
      attempts_in_region_last_24_months: regionRecent,
    },
    signposts: chosen,
    closest_cases: a ? { compared: a.k, followed_by_attempt: Math.round(a.rate * a.k), share: a.rate, pool_base_rate: a.base, cases: distinct(a.nearest).slice(0, 5).map((c) => ({ country: c.country, month: c.month, attempt: !!c.attempt_within_6m })) } : null,
  };
}

/** Who reads the brief changes what the "so what" is, not the evidence. */
export const LENSES = {
  analyst: { label: "Analyst", reader: "a political-risk analyst", wants: "the evidence, its limits and the signposts to track", heading: "Watch list" },
  investor: { label: "Investor or risk manager", reader: "an investor or sovereign-risk manager", wants: "exposure and timing: what moves a country-risk premium, which indicators would force a position change, how far to trust the number, and what the market is pricing", heading: "For investors and risk managers" },
  policy: { label: "Diplomat or policy analyst", reader: "a diplomat or policy analyst", wants: "leverage and windows: who the decisive actors are, what regional bodies, creditors and partners can do, which dates open or close room for action", heading: "For diplomats and policy analysts" },
  newsroom: { label: "Journalist or researcher", reader: "a journalist or researcher", wants: "angles and sources: what is genuinely new, what is easy to get wrong when quoting the number, which records and indicators to cite", heading: "For journalists and researchers" },
  aid: { label: "Humanitarian or development team", reader: "a humanitarian or development operations lead", wants: "operating risk: where violence and instability would hit access, staff and programmes, and which early signs matter for continuity planning", heading: "For humanitarian and development teams" },
};
export const lensOf = (k) => (LENSES[k] ? k : "analyst");
