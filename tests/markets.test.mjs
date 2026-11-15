import test from "node:test";
import assert from "node:assert/strict";
import { isRealMoney, modelAtHorizon, primaryMarket } from "../lib/market-pick.js";

const m = (source, volume, extra = {}) => ({ source, volume, kind: "coup", question: `${source} ${volume}`, ...extra });

test("the market with the most volume wins between Polymarket and Kalshi", () => {
  assert.equal(primaryMarket([m("Polymarket", 200000), m("Kalshi", 900000), m("Manifold", 5e6)]).source, "Kalshi");
  assert.equal(primaryMarket([m("Kalshi", 40000), m("Polymarket", 41000)]).source, "Polymarket");
});

test("a thin real-money market gives way to a deeper one, and play money only fills a gap", () => {
  assert.equal(primaryMarket([m("Polymarket", 900), m("Kalshi", 12000)]).source, "Kalshi");
  assert.equal(primaryMarket([m("Polymarket", 900), m("Manifold", 5e6)]).source, "Polymarket");
  assert.equal(primaryMarket([m("Manifold", 300), m("Manifold", 9000)]).volume, 9000);
  assert.equal(primaryMarket([]), null);
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

test("real-money venues are the ones shown without links", () => {
  assert.ok(isRealMoney("Polymarket") && isRealMoney("Kalshi"));
  assert.ok(!isRealMoney("Manifold"));
});
