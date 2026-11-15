import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCountry } from "../lib/country-analysis.js";
import { pct } from "../lib/format.js";

test("small positive probabilities remain distinguishable from zero", () => {
  assert.equal(pct(.00001), "<0.01%");
  assert.equal(pct(.0006), "0.06%");
  assert.equal(pct(0), "0.0%");
  assert.equal(pct(null), "–");
  assert.equal(pct(Infinity), "–");
});

test("missing values are not zeros; zero baseline never divides by zero", () => {
  const a = analyzeCountry({ series: { start: "2024-01", unrest: [...Array(24).fill(0), 2, 4, 6], violence: [null, 0, 0] } });
  assert.equal(a.signals[0].recentTotal, 12);
  assert.equal(a.signals[0].newActivity, true);
  assert.equal(a.signals[0].ratio, null);
  assert.equal(a.signals[0].through, "2026-03");
  assert.equal(a.signals[1].recentTotal, null);
  assert.equal(a.delta, null);
});

test("history dates survive gaps and median excludes current estimate", () => {
  const a = analyzeCountry({ risk: .5, risk_3m_ago: 0, risk_hist: { start: "2020-11", values: [null, .1, .9, .5] } });
  assert.equal(a.history.peakMonth, "2021-01");
  assert.equal(a.history.median, .5);
  assert.equal(a.history.percentile, .5);
  assert.equal(a.delta, .5);
});

test("regional peers exclude self and historical states; tied risks share rank", () => {
  const c = { slug: "a", name: "A", region: "R", risk: .2 };
  const a = analyzeCountry(c, [c, { slug: "b", name: "B", region: "R", risk: .2 },
    { slug: "c", name: "C", region: "R", risk: 1, historical: true }]);
  assert.equal(a.region.rank, 1);
  assert.equal(a.region.median, .2);
  assert.equal(a.region.count, 2);
  assert.deepEqual(a.region.peers.map((p) => p.slug), ["b"]);
});

test("archive separates plots, duplicates, and the stricter forecast target", () => {
  const base = { type: "fallito", conf: "B", sources: "Other", year: 2020 };
  const a = analyzeCountry({ coups: [base, { ...base, type: "complotto" }, { ...base, dup: "x" },
    { ...base, conf: "A", disputed: true }, { ...base, conf: "D" }] });
  assert.equal(a.archive.attempts, 2);
  assert.equal(a.archive.modelEvents, 1);
  assert.equal(a.archive.disputed, 1);
  assert.equal(a.archive.plots, 1);
});

test("short coverage does not fabricate a historical baseline", () => {
  const a = analyzeCountry({ series: { start: "2026-01", unrest: [1, 2, 3, 4, 5, 6] } });
  assert.equal(a.signals[0].recentTotal, 15);
  assert.equal(a.signals[0].baselineMean, null);
  assert.equal(a.signals[0].ratio, null);
});
