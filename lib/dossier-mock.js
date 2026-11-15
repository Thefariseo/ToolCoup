// Development only: a canned narrative at the maximum lengths the real prompt allows, to tune the PDF layout without spending API credit.
const L = (n, w) => Array.from({ length: n }, (_, i) => w[i % w.length]).join(" ");
const base = "the army remains the arbiter of succession while civilian institutions are thin and the economy offers few reasons for restraint among officers who already hold the levers of power".split(" ");
export function mockNarrative() {
  return {
    headline: "The structural score is high and the street is quiet, but the coverage points to a succession question the model cannot read.",
    key_takeaways: [1, 2, 3, 4].map((i) => ({ title: `Takeaway number ${i} in six words`, text: L(34, base) + "." })),
    bottom_line: L(78, base) + ".",
    cross_check: [1, 2, 3, 4, 5].map((i) => ({ theme: `Theme ${i} here`, model: L(18, base), media: L(18, base), verdict: ["converge", "diverge", "gap", "diverge", "converge"][i - 1], so_what: L(24, base) })),
    blind_spots: [L(28, base), L(28, base), L(28, base)],
    group_readings: ["storia", "contagio", "regime", "leader", "economia", "piazza", "acled"].map((g) => ({ group: g, reading: L(24, base) })),
    history_note: L(26, base), acled_note: L(26, base), region_note: L(26, base),
    background: L(62, base), society_politics: L(62, base), security_sector: L(62, base),
    current_situation: { text: L(85, base), refs: [] },
    scenarios: ["Continuity", "Escalation", "Stabilisation"].map((name) => ({ name, description: L(38, base), signposts: [L(10, base), L(10, base)] })),
    lens_note: L(28, base) + ".",
    lens_actions: [1, 2, 3].map(() => ({ action: L(12, base), why: L(24, base) })),
    press_digest: [], caveats: [L(26, base), L(26, base), L(26, base)],
  };
}
