// Links to the evidence behind each coup record. Event-specific where the record has a Wikidata item (its entry
// and the linked English Wikipedia article); otherwise the academic dataset that codes it (dataset page, not the
// single event). A Wikipedia search is the last resort so that no record is left without a place to check it.
import fs from "node:fs";
import path from "node:path";

let qids = null, articles = null;
function loadArticles() {
  if (articles) return articles;
  try { articles = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "coupdb", "wikipedia_articles.json"), "utf8")); } catch { articles = {}; }
  return articles;
}
function loadQids() {
  if (qids) return qids;
  qids = new Map();
  try {
    const text = fs.readFileSync(path.join(process.cwd(), "data", "coupdb", "attestations.csv"), "utf8");
    for (const line of text.split("\n")) {
      const m = /^([^,]+),Wikidata,(Q\d+),/.exec(line);
      if (m && !qids.has(m[1])) qids.set(m[1], m[2]);
    }
  } catch { /* the archive still renders without links */ }
  return qids;
}

export const DATASETS = {
  "Powell & Thyne": "https://www.uky.edu/~clthyn2/coup_data/home.htm",
  "Colpus": "https://doi.org/10.1093/isq/sqab058",
  "Center for Systemic Peace": "https://www.systemicpeace.org/inscrdata.html",
  "Cline Center": "https://clinecenter.illinois.edu/",
  "V-Dem historical regimes": "https://v-dem.net/data/",
  "Archigos": "https://www.rochester.edu/college/faculty/hgoemans/data.htm",
};

export function coupLinks(e) {
  const out = [], q = loadQids().get(e.id);
  if (q) {
    const a = loadArticles()[q];
    if (a) out.push({ label: "Wikipedia", url: a, kind: "event" });
    out.push({ label: "Wikidata", url: `https://www.wikidata.org/wiki/${q}`, kind: "event" });
  }
  for (const s of (e.sources || "").split(";").map((x) => x.trim())) if (DATASETS[s]) out.push({ label: s, url: DATASETS[s], kind: "dataset" });
  if (!out.length) out.push({ label: "Search Wikipedia", url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(`${e.year} ${e.name} coup`)}`, kind: "search" });
  return out;
}
