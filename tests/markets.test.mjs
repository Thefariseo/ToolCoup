import test from "node:test";
import assert from "node:assert/strict";
import { VENUES, modelAtHorizon, primaryMarket, termCurve } from "../lib/market-pick.js";

const m = (source, volume, extra = {}) => ({ source, volume, kind: "coup", question: `${source} ${volume}`, ...extra });

test("the market with the most volume wins between Polymarket and Kalshi", () => {
  assert.equal(primaryMarket([m("Polymarket", 200000), m("Kalshi", 900000)]).source, "Kalshi");
  assert.equal(primaryMarket([m("Kalshi", 40000), m("Polymarket", 41000)]).source, "Polymarket");
});

test("a thin market gives way to a deeper one", () => {
  assert.equal(primaryMarket([m("Polymarket", 900), m("Kalshi", 12000)]).source, "Kalshi");
  assert.equal(primaryMarket([m("Polymarket", 300), m("Kalshi", 900)]).source, "Kalshi");
  assert.equal(primaryMarket([]), null);
});

test("play-money venues never lead, even with the most volume", () => {
  assert.equal(primaryMarket([m("Manifold", 5e6)]), null);
  assert.equal(primaryMarket([m("Polymarket", 900), m("Manifold", 5e6)]).source, "Polymarket");
});

test("leader-exit questions never lead", () => {
  assert.equal(primaryMarket([m("Polymarket", 1e6, { kind: "exit" })]), null);
});

test("our six-month probability is restated for the market horizon with a constant hazard", () => {
  assert.ok(Math.abs(modelAtHorizon(0.1, 12) - 0.19) < 1e-9);
  assert.ok(Math.abs(modelAtHorizon(0.1, 6) - 0.1) < 1e-9);
  assert.equal(modelAtHorizon(0.1, null), null);
  assert.equal(modelAtHorizon(0.1, 60), null);
});

test("only the two real-money venues are read", () => {
  assert.deepEqual(VENUES, ["Polymarket", "Kalshi"]);
});

import { kalshiQuote } from "../lib/market-pick.js";

test("a tight Kalshi book is priced at its mid, a wide one at the last trade", () => {
  assert.ok(Math.abs(kalshiQuote({ yes_bid_dollars: "0.06", yes_ask_dollars: "0.08", last_price_dollars: "0.07" }).p - 0.07) < 1e-9);
  assert.equal(kalshiQuote({ yes_bid_dollars: "0.01", yes_ask_dollars: "1.00", last_price_dollars: "0.20" }).p, 0.2);
  assert.equal(kalshiQuote({ yes_bid_dollars: "0.01", yes_ask_dollars: "1.00", last_price_dollars: "0" }), null);   // never traded: no price
});

test("Kalshi volume is read from the fixed-point field and turned into dollars", () => {
  assert.equal(kalshiQuote({ yes_bid_dollars: "0.10", yes_ask_dollars: "0.12", volume_fp: "20000.00" }).volume, 2200);
  assert.equal(kalshiQuote({ yes_bid: 10, yes_ask: 12, volume: 1000 }).volume, 110);
  assert.equal(kalshiQuote({ yes_bid_dollars: "0.10", yes_ask_dollars: "0.12" }).volume, null);
});

// The same vectors are in pipeline/test_terms.py: the curve is computed in Python (to fit and publish) and in JavaScript (to restate a probability).
const TERMS = { grid: [1, 2, 3, 4, 6, 9, 12, 18, 24], long: { "12": { a: -0.1, b: 0.9 }, "24": { a: -0.4, b: 0.85 } } };

test("the term curve is constant hazard to six months, identity at six, and never decreasing", () => {
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const c = Object.fromEntries(termCurve(0.1, TERMS));
  assert.ok(near(c[1], 0.017407) && near(c[3], 0.051317) && near(c[6], 0.1) && near(c[9], 0.146185));
  assert.ok(near(c[12], 0.146185), "a corrected 12-month value below the 9-month one is raised to it");
  assert.ok(near(c[24], 0.271) || c[24] >= c[18]);
  const f = termCurve(0.3, TERMS).map(([, v]) => v);
  assert.ok(f.every((v, i) => i === 0 || v >= f[i - 1]));
  assert.ok(near(termCurve(0.001, TERMS).find(([h]) => h === 6)[1], 0.001));
});

test("restating at a market horizon interpolates in cumulative hazard and falls back to constant hazard without terms", () => {
  assert.ok(Math.abs(modelAtHorizon(0.1, 12, null) - 0.19) < 1e-9);
  const t = { grid: [1, 2, 3, 4, 6, 9, 12, 18, 24], long: {} };          // no correction fitted: same as constant hazard everywhere
  for (const m of [0.5, 1.5, 4.5, 7, 13.5, 30, 48]) assert.ok(Math.abs(modelAtHorizon(0.07, m, t) - (1 - Math.pow(1 - 0.07, m / 6))) < 1e-9, `months ${m}`);
  assert.equal(modelAtHorizon(0.1, 0, TERMS), null);
  assert.equal(modelAtHorizon(0.1, 49, TERMS), null);
  assert.ok(modelAtHorizon(0.1, 7.5, TERMS) > 0.1 && modelAtHorizon(0.1, 7.5, TERMS) < 0.146185);
  const sane = { grid: TERMS.grid, long: { "12": { a: 0.05, b: 0.97 }, "24": { a: 0.1, b: 0.9 } } };
  const a = modelAtHorizon(0.2, 14, sane), b = modelAtHorizon(0.2, 20, sane), c = modelAtHorizon(0.2, 40, sane);
  assert.ok(a < b && b < c && c < 1);
  assert.ok(modelAtHorizon(0.2, 40, TERMS) >= modelAtHorizon(0.2, 24, TERMS), "a flat corrected tail never lowers a longer horizon");
});
