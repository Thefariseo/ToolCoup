import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GROUP_ORDER, layoutLedger, ledgerModel } from "../components/console/ledger.js";

const logit = (p) => Math.log(p / (1 - p)), expit = (z) => 1 / (1 + Math.exp(-z));
const groups = [
  { key: "storia", contrib: 1.42 }, { key: "regime", contrib: 1.73 }, { key: "piazza", contrib: 0.23 }, { key: "economia", contrib: 0.19 },
  { key: "acled", contrib: 0.18 }, { key: "leader", contrib: 0.14 }, { key: "contagio", contrib: -0.12 },
];
const components = [{ key: "logit", probability: 0.099 }, { key: "gbm", probability: 0.068 }, { key: "rf", probability: 0.062 }];
const peers = Object.fromEntries(GROUP_ORDER.map((k) => [k, [[-0.5, 10], [0, 100], [0.5, 40], [1.4, 2], [1.75, 1]]]));
const ref = 0.0025;
const model = (over = {}) => ledgerModel({ groups, components, risk: 0.065, lo: 0.038, hi: 0.09, ref, peers, ...over });

test("the groups are sorted by size of push and chain from the reference to the logistic model", () => {
  const m = model();
  assert.deepEqual(m.steps.map((s) => s.key), ["regime", "storia", "piazza", "economia", "acled", "leader", "contagio"]);
  assert.ok(Math.abs(m.steps[0].p0 - ref) < 1e-12);
  m.steps.slice(1).forEach((s, i) => assert.ok(Math.abs(s.p0 - m.steps[i].p1) < 1e-12));
  const sum = groups.reduce((t, g) => t + g.contrib, 0);
  assert.ok(Math.abs(m.logit - expit(logit(ref) + sum)) < 1e-12);
});

test("the average of the models is the mean of their log-odds", () => {
  const m = model();
  assert.ok(Math.abs(m.avg - expit(components.reduce((t, c) => t + logit(c.probability), 0) / 3)) < 1e-12);
  assert.equal(model({ components: [] }).avg, null);
});

test("a country at the extreme of a group is in the top few percent, and a negative term counts the other tail", () => {
  const m = model();
  const regime = m.steps.find((s) => s.key === "regime"), contagio = m.steps.find((s) => s.key === "contagio");
  assert.equal(regime.side, "top");
  assert.ok(regime.share <= 0.02, `share ${regime.share}`);
  assert.equal(contagio.side, "bottom");
  assert.ok(Math.abs(contagio.share - 10 / 153) < 1e-9, `share ${contagio.share}`);   // only the 10 countries at -0.5 are lower
});

test("missing inputs give no ledger, and missing peers give no share", () => {
  assert.equal(model({ groups: [] }), null);
  assert.equal(model({ ref: null }), null);
  assert.equal(model({ risk: null }), null);
  assert.equal(model({ peers: null }).steps[0].share, null);
});

test("the layout keeps every mark inside the stage, rows in order, ticks apart", () => {
  for (const [W, H] of [[900, 560], [740, 520], [565, 470], [380, 520]]) {
    const L = layoutLedger(model(), W, H);
    assert.equal(L.strips, W >= 720);
    assert.equal(L.compact, W < 720);
    const ys = L.rows.map((r) => r.y);
    assert.deepEqual([...ys].sort((a, b) => a - b), ys);
    for (const r of L.rows) for (const x of [r.x, r.xa, r.xb, r.xl, r.xh].filter((v) => v != null)) assert.ok(x >= L.bx0 - 1 && x <= L.bx1 + 1, `${r.kind} x=${x} outside ${L.bx0}..${L.bx1} at ${W}`);
    for (const c of L.comps) assert.ok(c.x >= L.bx0 - 1 && c.x <= L.bx1 + 1, `component x=${c.x}`);
    L.axis.slice(1).forEach((t, i) => assert.ok(t.x - L.axis[i].x >= 43.9));
    assert.equal(L.boxes.length, 9);
    for (const b of L.boxes) { assert.ok(b.x0 <= b.x1); assert.ok(b.x0 >= -1 && b.x1 <= 1); assert.ok(b.w > 0); }
    assert.ok(L.core.x > -1 && L.core.x < 1 && L.core.y > -1 && L.core.y < 1 && L.core.r > 0);
    assert.ok(L.shareX == null || L.shareX + 74 <= W + 1 || !L.strips);
    if (L.strips) for (const r of L.rows.filter((q) => q.kind === "group")) for (const d of r.bars) assert.ok(d.x >= L.sx0 - 1 && d.x <= L.sx1 + 1 && d.h > 0);
  }
});

test("swarm boxes: amber flows right, cyan flows left, class k+1 is group GROUP_ORDER[k]", () => {
  const L = layoutLedger(model(), 900, 560);
  GROUP_ORDER.forEach((key, k) => {
    const g = groups.find((x) => x.key === key), box = L.boxes[k + 1];
    assert.equal(box.dir, Math.sign(g.contrib), key);
  });
  assert.equal(L.boxes[0].dir, 0);
  assert.equal(L.boxes[8].dir, 0);
});

// The exported data must reproduce the logistic component: the reference is one constant for countries with structural records.
test("on the published data the group terms from one reference reproduce the logistic component", () => {
  const countries = JSON.parse(readFileSync(new URL("../webdata/countries.json", import.meta.url), "utf8"));
  const details = JSON.parse(readFileSync(new URL("../webdata/details.json", import.meta.url), "utf8"));
  const rows = countries.filter((c) => !c.historical && c.structural && c.groups?.length).map((c) => {
    const comp = details[c.slug]?.diagnostics?.components?.find((x) => x.key === "logit");
    return comp ? { c, comp, ref: logit(comp.probability) - c.groups.reduce((s, g) => s + g.contrib, 0) } : null;
  }).filter(Boolean);
  assert.ok(rows.length > 150, `only ${rows.length} countries`);
  const sorted = rows.map((r) => r.ref).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(sorted.at(-1) - sorted[0] < 0.05, `reference spread ${(sorted.at(-1) - sorted[0]).toFixed(3)} log-odds`);
  for (const { c, comp } of rows) {
    const m = ledgerModel({ groups: c.groups, components: details[c.slug].diagnostics.components, risk: c.risk, lo: c.risk_lo, hi: c.risk_hi, ref: expit(median), peers: null });
    assert.ok(Math.abs(logit(m.logit) - logit(comp.probability)) < 0.05, `${c.slug}: ${m.logit} vs ${comp.probability}`);
  }
});
