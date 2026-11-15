import test from "node:test";
import assert from "node:assert/strict";
import { VENUES, modelAtHorizon, primaryMarket } from "../lib/market-pick.js";

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
