import test from "node:test";
import assert from "node:assert/strict";
import { OFF_TOPIC, pressPlan } from "../lib/press-plan.js";

const facts = (over = {}) => ({
  groups: [], acled_recent: { baseline_36_months_before: {} }, violence_outlook: null,
  profile: { key: "mixed", archetype: "Mixed profile", signposts: [], evidence: {} }, ...over,
});
const angles = (f) => pressPlan(f).map((p) => p.angle);

test("a country that had a coup is searched for its transition", () => {
  const plan = pressPlan(facts({ profile: { key: "post_coup", archetype: "Post-coup regime", signposts: [], evidence: { last_successful_coup: "2025-11-26", years_since_last_success: 0.9 } } }));
  assert.equal(plan[0].angle, "transition");
  assert.match(plan[0].why, /2025-11-26/);
  assert.ok(plan.some((p) => p.angle === "military"));
});

test("protests above their baseline add the street angle, with the figure as the reason", () => {
  const plan = pressPlan(facts({ acled_recent: { baseline_36_months_before: { protests_and_riots: { ratio: 1.8 } } } }));
  const un = plan.find((p) => p.angle === "unrest");
  assert.ok(un);
  assert.match(un.why, /1\.8x/);
});

test("a democracy is searched through its elections and courts, not through the ruler's health", () => {
  const a = angles(facts({ profile: { key: "tested_democracy", archetype: "Democracy after an attempt", signposts: [], evidence: { regime: "Electoral democracy", head_of_state_age: 81 } } }));
  assert.ok(a.includes("politics"));
  assert.ok(!a.includes("leader"));
});

test("an old ruler in an autocracy adds the leader angle", () => {
  const a = angles(facts({ profile: { key: "aging_ruler", archetype: "Aging ruler, succession risk", signposts: [], evidence: { head_of_state_age: 88 } } }));
  assert.ok(a.includes("leader"));
});

test("the plan is never empty or longer than five angles, and always asks about coups", () => {
  for (const f of [facts(), facts({ groups: [{ key: "economia", contribution_log_odds: 0.9 }, { key: "contagio", contribution_log_odds: 0.9 }, { key: "leader", contribution_log_odds: 0.9 }], acled_recent: { baseline_36_months_before: { protests_and_riots: { ratio: 2 }, political_violence_events: { ratio: 2 } } } })]) {
    const plan = pressPlan(f);
    assert.ok(plan.length >= 3 && plan.length <= 5);
    assert.ok(plan.some((p) => p.angle === "coup"));
  }
});

test("a headline must carry a word of its angle and no sports word", () => {
  const politics = pressPlan(facts({ profile: { key: "consolidated", archetype: "Consolidated", signposts: [], evidence: { regime: "Liberal democracy" } } })).find((p) => p.angle === "politics");
  assert.ok(politics.re.test("Brazil's Lula plays it safe with first post-election fiscal plan"));
  assert.ok(politics.re.test("Protesters demand impeachment of the president"));
  assert.ok(!politics.re.test("Brazil loses 3-2 to Japan in a friendly"));
  assert.ok(OFF_TOPIC.test("Brazil loses 3-2 to Japan in a friendly"));
  assert.ok(!OFF_TOPIC.test("Guinea-Bissau junta blocks former president's return"));
});
