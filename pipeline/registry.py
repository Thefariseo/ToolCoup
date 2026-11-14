"""Registro pubblico delle previsioni.

Ogni mese la previsione pubblicata viene archiviata in registry/issues/AAAA-MM.json e non viene piu'
toccata: il file e' nel repository, quindi la data e il contenuto sono verificabili dalla cronologia
di git, e il suo SHA-256 e' annotato in registry/index.json. Quando la finestra di previsione si
chiude, l'edizione viene confrontata con i golpe registrati nel database.

    python pipeline/registry.py            # archivia l'edizione corrente (se nuova) e ricalcola i punteggi
    python pipeline/registry.py --check    # verifica soltanto che le edizioni archiviate siano intatte

Legge webdata/ (prodotto da run.py) e scrive registry/ e webdata/registry.json.

Evento da prevedere (lo stesso del modello): almeno un tentativo di golpe, riuscito o fallito, nella
finestra; contano gli eventi confermati da almeno due fonti accademiche o presenti in Powell & Thyne.

Oltre al registro vero e proprio il file contiene una ricostruzione ("hindcast"): le previsioni fuori
campione della validazione, tagliate in edizioni semestrali dal 2000. Servono a mostrare come si
legge il registro, ma NON sono previsioni fatte in anticipo e restano separate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "webdata"
REG = ROOT / "registry"
ISSUES = REG / "issues"
TARGET = ("At least one coup attempt (successful or failed) in the window, confirmed by two or more "
          "academic sources or listed by Powell & Thyne.")


def ym(s: str) -> int:
    return int(s[:4]) * 12 + int(s[5:7]) - 1


def label(t: int) -> str:
    return f"{t // 12}-{t % 12 + 1:02d}"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(name: str):
    return json.loads((WEB / name).read_text(encoding="utf-8"))


def is_target(e: dict) -> bool:
    return (e["type"] in ("riuscito", "fallito") and e["colpus"] not in ("not exist", "combined") and not e["dup"]
            and (e["conf"] == "A" or "Powell & Thyne" in e["sources"]))


def is_candidate(e: dict) -> bool:
    """Evento registrato ma non (ancora) confermato quanto basta per contare."""
    return e["type"] in ("riuscito", "fallito") and not e["dup"] and e["conf"] in ("B", "C") and not is_target(e)


# ------------------------------------------------------------------ archivio
def archive() -> str | None:
    summary, countries = load("summary.json"), load("countries.json")
    meta = summary["meta"]
    if meta.get("demo"):
        print("Registro: dati dimostrativi, niente da archiviare")
        return None
    issue = meta["forecast_from"]
    path = ISSUES / f"{issue}.json"
    ens = next(m for m in summary["metrics"] if m["key"] == "ensemble")
    doc = {
        "issue": issue, "published": meta["generated"], "data_end": meta["data_end"],
        "window": [meta["forecast_from"], meta["forecast_to"]], "horizon": meta["horizon"], "target": TARGET,
        "base_rate": meta["base_rate"],
        "model": {"n_features": meta["n_features"], "oos_auc": ens["all"]["auc"], "oos_from": meta["first_test_year"],
                  "calibration": meta["calibration"]},
        "forecasts": [{"slug": c["slug"], "name": c["name"], "iso": c["iso"], "p": c["risk"], "lo": c["risk_lo"],
                       "hi": c["risk_hi"], "rank": c["rank"]}
                      for c in sorted((c for c in countries if c["risk"] is not None), key=lambda c: c["rank"])],
    }
    ISSUES.mkdir(parents=True, exist_ok=True)
    index_path = REG / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else []
    if path.exists():
        print(f"Registro: l'edizione {issue} e' gia' archiviata ({json.loads(path.read_text())['published']}), non viene riscritta")
        return issue
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    index.append({"issue": issue, "published": doc["published"], "n": len(doc["forecasts"]), "sha256": sha(path)})
    index_path.write_text(json.dumps(sorted(index, key=lambda r: r["issue"]), indent=1) + "\n")
    print(f"Registro: archiviata l'edizione {issue} ({len(doc['forecasts'])} paesi)")
    return issue


def check() -> list[str]:
    index_path = REG / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else []
    bad = [r["issue"] for r in index if not (ISSUES / f"{r['issue']}.json").exists() or sha(ISSUES / f"{r['issue']}.json") != r["sha256"]]
    known = {r["issue"] for r in index}
    bad += [p.stem for p in ISSUES.glob("*.json") if p.stem not in known]
    return sorted(set(bad))


# ------------------------------------------------------------------ punteggi
def auc(p: list[float], y: list[int]) -> float | None:
    pos, neg = sum(y), len(y) - sum(y)
    if not pos or not neg:
        return None
    order = sorted(range(len(p)), key=lambda i: p[i])
    ranks, i = [0.0] * len(p), 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and p[order[j + 1]] == p[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return (sum(r for r, v in zip(ranks, y) if v) - pos * (pos + 1) / 2) / (pos * neg)


def score(p: list[float], y: list[int], base: float) -> dict:
    n = len(p)
    brier = sum((a - b) ** 2 for a, b in zip(p, y)) / n
    ref = sum((base - b) ** 2 for b in y) / n
    clip = lambda v: min(max(v, 1e-6), 1 - 1e-6)
    top = sorted(range(n), key=lambda i: -p[i])[:max(1, round(n * 0.1))]
    a = auc(p, y)
    return {"n": n, "events": sum(y), "expected": round(sum(p), 2), "brier": round(brier, 5), "brier_ref": round(ref, 5),
            "skill": round(1 - brier / ref, 3) if ref > 0 else None,
            "log_loss": round(-sum(math.log(clip(a_) if b else 1 - clip(a_)) for a_, b in zip(p, y)) / n, 4),
            "auc": None if a is None else round(a, 3), "top10_hits": sum(y[i] for i in top), "top10_n": len(top)}


def events_in(coups_by_slug: dict, slugs: set, lo: int, hi: int, keep) -> list[dict]:
    out = []
    for slug in slugs:
        for e in coups_by_slug.get(slug, ()):
            if keep(e) and e["prec"] != "year" and lo <= ym(e["date"]) <= hi:
                out.append(e)
    return sorted(out, key=lambda e: e["date"])


def build() -> dict:
    summary, coups = load("summary.json"), load("coups.json")
    by_slug: dict[str, list] = {}
    for e in coups:
        by_slug.setdefault(e["slug"], []).append(e)
    data_end = ym(summary["meta"]["data_end"])       # ultimo mese coperto dai dati sugli eventi

    issues = []
    for path in sorted(ISSUES.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        lo, hi = ym(doc["window"][0]), ym(doc["window"][1])
        fc = doc["forecasts"]
        rank = {f["slug"]: f for f in fc}
        closed = data_end >= hi
        hits = events_in(by_slug, set(rank), lo, min(hi, data_end), is_target)
        pending = events_in(by_slug, set(rank), lo, min(hi, data_end), is_candidate)
        hit_slugs = {e["slug"] for e in hits}
        ev = lambda e, ok: {"slug": e["slug"], "name": e["name"], "date": e["date"], "type": e["type"], "conf": e["conf"],
                            "p": rank[e["slug"]]["p"], "rank": rank[e["slug"]]["rank"], "counted": ok}
        issues.append({
            "issue": doc["issue"], "published": doc["published"], "data_end": doc["data_end"], "window": doc["window"],
            "status": "closed" if closed else "open", "n": len(fc), "base_rate": doc["base_rate"],
            "observed_through": label(min(hi, data_end)) if data_end >= lo else None,
            "months_observed": max(0, min(hi, data_end) - lo + 1), "expected": round(sum(f["p"] for f in fc), 2),
            "events": [ev(e, True) for e in hits] + [ev(e, False) for e in pending],
            "score": score([f["p"] for f in fc], [int(f["slug"] in hit_slugs) for f in fc], doc["base_rate"]) if closed else None,
            "top": [{"slug": f["slug"], "name": f["name"], "p": f["p"], "lo": f["lo"], "hi": f["hi"], "rank": f["rank"],
                     "hit": f["slug"] in hit_slugs} for f in fc[:25]],
            "sha256": sha(path),
        })
    closed = [i for i in issues if i["status"] == "closed"]
    pooled = None
    if closed:
        p, y, base = [], [], []
        for i in closed:
            doc = json.loads((ISSUES / f"{i['issue']}.json").read_text())
            hit = {e["slug"] for e in i["events"] if e["counted"]}
            for f in doc["forecasts"]:
                p.append(f["p"]); y.append(int(f["slug"] in hit)); base.append(doc["base_rate"])
        pooled = score(p, y, sum(base) / len(base))

    return {"generated": summary["meta"]["generated"], "target": TARGET, "horizon": summary["meta"]["horizon"],
            "data_end": summary["meta"]["data_end"], "issues": issues[::-1], "pooled": pooled,
            "integrity": {"ok": not check(), "altered": check()}, "hindcast": hindcast(summary, by_slug, data_end)}


def hindcast(summary: dict, by_slug: dict, data_end: int, first_year: int = 2000) -> dict:
    """Edizioni semestrali ricostruite dalla validazione fuori campione (non previsioni in anticipo)."""
    details, H = load("details.json"), summary["meta"]["horizon"]
    series = {}
    for slug, d in details.items():
        h = d.get("risk_hist") or {}
        if h.get("values"):
            series[slug] = (ym(h["start"]), h["values"])
    names = {c["slug"]: c["name"] for c in load("countries.json")}
    rows, all_p, all_y, caught = [], [], [], []
    for year in range(first_year, data_end // 12 + 1):
        for month in (0, 6):
            t = year * 12 + month - 1                     # dati fino a t, finestra t+1 .. t+H
            if t + H > data_end:
                continue
            fc = {s: v[t - s0] for s, (s0, v) in series.items() if 0 <= t - s0 < len(v) and v[t - s0] is not None}
            if len(fc) < 50:
                continue
            order = sorted(fc, key=lambda s: -fc[s])
            rank = {s: i + 1 for i, s in enumerate(order)}
            hits = events_in(by_slug, set(fc), t + 1, t + H, is_target)
            hit = {e["slug"] for e in hits}
            base = summary["meta"]["base_rate"]
            p, y = [fc[s] for s in order], [int(s in hit) for s in order]
            sc = score(p, y, base)
            all_p += p; all_y += y
            for e in hits:
                caught.append({"issue": label(t + 1), "slug": e["slug"], "name": names.get(e["slug"], e["name"]), "date": e["date"],
                               "type": e["type"], "p": round(fc[e["slug"]], 5), "rank": rank[e["slug"]], "n": len(fc)})
            rows.append({"issue": label(t + 1), "window": [label(t + 1), label(t + H)], "n": len(fc), "events": len(hit),
                         "expected": sc["expected"], "skill": sc["skill"], "auc": sc["auc"], "top10_hits": sc["top10_hits"],
                         "top10_n": sc["top10_n"]})
    seen, first = set(), []
    for e in caught:                                       # un evento compare in una sola edizione semestrale
        key = (e["slug"], e["date"])
        if key not in seen:
            seen.add(key); first.append(e)
    return {"from": first_year, "issues": rows[::-1], "events": first[::-1],
            "pooled": score(all_p, all_y, summary["meta"]["base_rate"]) if all_p else None}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verifica soltanto l'integrita' delle edizioni archiviate")
    args = ap.parse_args()
    if args.check:
        bad = check()
        sys.exit(f"Edizioni alterate o non indicizzate: {', '.join(bad)}" if bad else print("Registro integro") or 0)
    archive()
    out = build()
    (WEB / "registry.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    h = out["hindcast"]
    print(f"Registro: {len(out['issues'])} edizioni ({sum(i['status'] == 'closed' for i in out['issues'])} chiuse); "
          f"hindcast {len(h['issues'])} edizioni, {len(h['events'])} eventi, skill {h['pooled']['skill'] if h['pooled'] else '-'}")
    if not out["integrity"]["ok"]:
        sys.exit(f"ATTENZIONE: edizioni alterate: {', '.join(out['integrity']['altered'])}")


if __name__ == "__main__":
    main()
