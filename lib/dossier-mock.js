// Development only: a canned narrative at the maximum lengths the real prompt allows, to tune the PDF layout without spending API credit.
const L = (n, w) => Array.from({ length: n }, (_, i) => w[i % w.length]).join(" ");
const base = "the army remains the arbiter of succession while civilian institutions are thin and the economy offers few reasons for restraint among officers who already hold the levers of power".split(" ");
export function mockNarrative(facts) {
  return {
    headline: L(30, base) + ".",
    key_takeaways: [1, 2, 3, 4].map((i) => ({ title: `Takeaway number ${i} in eight words, a claim`, text: L(52, base) + "." })),
    bottom_line: L(125, base) + ".",
    evidence: [1, 2, 3, 4, 5].map((i) => ({ theme: `Theme ${i} here`, finding: L(28, base), reporting: i === 4 ? "" : L(28, base), refs: i === 4 ? [] : ["P1"], direction: ["up", "down", "watch", "up", "watch"][i - 1], implication: L(32, base) })),
    markets_read: facts?.prediction_markets?.length ? L(85, base) + "." : "",
    group_readings: ["storia", "contagio", "regime", "leader", "economia", "piazza", "acled"].map((g) => ({ group: g, reading: L(28, base) })),
    history_note: L(30, base), acled_note: L(30, base), region_note: L(30, base),
    background: L(72, base), society_politics: L(72, base), security_sector: L(72, base),
    current_situation: { text: L(115, base), refs: [] },
    scenarios: ["Continuity", "Escalation", "Stabilisation"].map((name) => ({ name, description: L(46, base), signposts: [L(12, base), L(12, base)] })),
    lens_note: L(34, base) + ".",
    lens_actions: [1, 2, 3].map(() => ({ action: L(14, base), why: L(30, base) })),
    press_digest: [], caveats: [L(28, base), L(28, base), L(28, base)],
  };
}
