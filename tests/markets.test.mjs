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
