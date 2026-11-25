import test from "node:test";
import assert from "node:assert/strict";
import { averageAnswers, calibrateAnalyst, expit, liquidity, logit, marketSixMonth, pool, pooledMarket, usableMarket } from "../lib/hybrid.js";
import { modelAtHorizon } from "../lib/market-pick.js";

const TERMS = { grid: [1, 2, 3, 4, 6, 9, 12, 18, 24], long: { "12": { a: 0.05, b: 0.97 }, "24": { a: 0.1, b: 0.9 } } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const mk = (over = {}) => ({ kind: "coup", p: 0.1, months: 13, volume: 60000, ...over });

test("a market price is restated as the six-month probability that reproduces it at the market's horizon", () => {
  for (const [price, months] of [[0.065, 1.5], [0.31, 13.5], [0.02, 6], [0.4, 20]]) {
    const p6 = marketSixMonth(price, months, TERMS);
    assert.ok(near(modelAtHorizon(p6, months, TERMS), price, 1e-6), `${price} at ${months} months`);
  }
  assert.ok(near(marketSixMonth(0.07, 6, TERMS), 0.07, 1e-6), "at six months the price is its own six-month probability");
  assert.ok(marketSixMonth(0.31, 13.5, TERMS) < 0.31 && marketSixMonth(0.065, 1.5, TERMS) > 0.065);
  assert.equal(marketSixMonth(null, 6), null);
});

test("only coup markets with enough volume, a sensible horizon and a real price are used", () => {
  assert.ok(usableMarket(mk()));
  assert.ok(!usableMarket(mk({ kind: "exit" })) && !usableMarket(mk({ volume: 900 })) && !usableMarket(mk({ months: 0.4 })) && !usableMarket(mk({ months: 30 })));
  assert.ok(!usableMarket(mk({ p: 0.001 })) && !usableMarket(mk({ p: 0.99 })) && !usableMarket(null));
});

test("several markets pool in log-odds weighted by volume", () => {
  const a = mk({ p: 0.05, months: 6, volume: 90000 }), b = mk({ p: 0.2, months: 6, volume: 10000 });
  const r = pooledMarket([a, b, mk({ kind: "exit" })], TERMS);
  assert.equal(r.n, 2);
  assert.ok(near(r.p, expit(0.9 * logit(0.05) + 0.1 * logit(0.2)), 1e-6));
  assert.equal(r.volume, 100000);
  assert.equal(pooledMarket([mk({ volume: 10 })], TERMS), null);
});

test("the analyst is shrunk toward the base rate and thin markets lose weight", () => {
  assert.ok(near(calibrateAnalyst(0.01, 0.01), 0.01));
  assert.ok(near(calibrateAnalyst(0.2, 0.01, 1), 0.2));
  const c = calibrateAnalyst(0.2, 0.01);
  assert.ok(c > 0.01 && c < 0.2);
  assert.ok(liquidity(5000) === 0.25 && liquidity(100000) === 1 && liquidity(1e7) === 1 && liquidity(40000) > 0.25);
});

test("one source is returned as it is; more independent sources are extremised away from the base rate, not from one half", () => {
  const base = 0.01;
  assert.ok(near(pool({ model: 0.03 }, base).p, 0.03));
  const agree = pool({ model: 0.03, market: { p: 0.03, volume: 100000 }, analyst: 0.03 }, base);
  assert.ok(agree.p > 0.03, "agreement above the base rate is pushed further above it");
  assert.equal(agree.n, 3);
  assert.ok(near(agree.a, 1.2));
  const low = pool({ model: 0.004, analyst: 0.004 }, base);
  assert.ok(low.p < 0.004, "agreement below the base rate is pushed further below it");
  assert.ok(near(pool({ model: 0.01, analyst: 0.01 }, base).p, 0.01), "agreement at the base rate stays there");
});

test("weights start at the priors, follow the learned adjustments and always sum to one", () => {
  const r = pool({ model: 0.02, market: { p: 0.1, volume: 1e6 }, analyst: 0.05 }, 0.01);
  assert.ok(near(Object.values(r.weights).reduce((a, b) => a + b, 0), 1));
  assert.ok(near(r.weights.model, 0.7) && near(r.weights.market, 0.2) && near(r.weights.analyst, 0.1));
  const down = pool({ model: 0.02, market: { p: 0.1, volume: 1e6 }, analyst: 0.05 }, 0.01, { market: -1 });
  assert.ok(down.weights.market < r.weights.market && down.p < r.p);
  const thin = pool({ model: 0.02, market: { p: 0.1, volume: 5000 } }, 0.01);
  assert.ok(thin.weights.market < 0.2 / 0.9);
  assert.equal(pool({}, 0.01), null);
});

test("several answers from one analyst average in log-odds, and the closest one speaks for the group", () => {
  const a = averageAnswers([{ raw: 0.01, id: "a" }, { raw: 0.04, id: "b" }, { raw: 0.02, id: "c" }]);
  const z = (logit(0.01) + logit(0.04) + logit(0.02)) / 3;
  assert.ok(Math.abs(logit(a.raw) - z) < 1e-9);
  assert.deepEqual(a.samples, [0.01, 0.04, 0.02]);
  assert.equal(a.pick.id, "c");
  assert.ok(a.raw > 0.01 && a.raw < 0.04);
  assert.equal(averageAnswers([]), null);
  assert.equal(averageAnswers([null, { raw: Number.NaN }]), null);
  assert.equal(averageAnswers([{ raw: 0.07, id: "only" }]).pick.id, "only");
  assert.ok(averageAnswers([{ raw: 0.9 }, { raw: 0.5 }]).raw <= 0.5 + 1e-12);        // held inside the range the analyst is allowed to answer in
});
