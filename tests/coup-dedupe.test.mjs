import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dedupeSameDay } from "../lib/coup-dedupe.js";

const load = (f) => JSON.parse(fs.readFileSync(new URL(`../webdata/${f}.json`, import.meta.url)));
const data = () => ({ coups: load("coups"), countries: load("countries"), summary: load("summary") });

test("Brasilia, 8 January 2023, is one failed attempt, not a failed and a successful one", () => {
  const d = data(), before = d.countries.find((c) => c.slug === "brazil");
  const [attempts, successes] = [before.attempts, before.successes];
  const flagged = dedupeSameDay(d);
  assert.ok(flagged.some((e) => e.id === "140-20230108-2"));
  const live = d.coups.filter((e) => e.slug === "brazil" && e.date === "2023-01-08" && !e.dup);
  assert.deepEqual(live.map((e) => e.type), ["fallito"]);
  const after = d.countries.find((c) => c.slug === "brazil");
  assert.equal(after.attempts, attempts - 1);
  assert.equal(after.successes, successes - 1);
  assert.equal(after.last.type, "fallito");
});

test("running it twice changes nothing more", () => {
  const d = data();
  dedupeSameDay(d);
  const snap = JSON.stringify(d.countries);
  assert.equal(dedupeSameDay(d).length, 0);
  assert.equal(JSON.stringify(d.countries), snap);
});

test("counts stay equal to the number of events that remain, for every country", () => {
  const d = data();
  dedupeSameDay(d);
  for (const c of d.countries) {
    const ev = d.coups.filter((e) => e.slug === c.slug && !e.dup && e.conf !== "D" && (e.type === "riuscito" || e.type === "fallito"));
    assert.equal(c.attempts, ev.length, c.slug);
    assert.equal(c.successes, ev.filter((e) => e.type === "riuscito").length, c.slug);
  }
});
