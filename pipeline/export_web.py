"""Scrive i dati letti dal sito Next.js (cartella webdata/).

  summary.json    metadati, metriche di validazione, serie storiche aggregate
  countries.json  un record per paese: rischio attuale, posizione, fattori, sintesi dei golpe
  details.json    per paese: storia del rischio e serie mensili ACLED
  coups.json      tutti gli eventi del database dei golpe, con affidabilita' e fonti
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import pandas as pd

from data import ALIASES, norm

# stati storici non coperti da ACLED -> codice ISO numerico del territorio odierno (per la mappa)
HIST_ISO = {315: "203", 817: "704", 265: "276", 680: "887", 511: "834", 730: "410", 245: "276",
            563: "710", 564: "710", 711: "156"}


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def export(result: dict, coupdb_csv: Path | None, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    acled = {c["name"]: c for c in result["countries"]}
    lookup = {norm(n): n for n in acled}

    def site_name(name: str) -> str:
        n = norm(name)
        return lookup.get(n) or ALIASES.get(n) or name

    # ---------------- eventi
    events = []
    if coupdb_csv and coupdb_csv.exists():
        db = pd.read_csv(coupdb_csv, keep_default_na=False)
        for r in db.itertuples():
            name = site_name(r.country)
            iso = acled[name]["iso"] if name in acled else HIST_ISO.get(int(r.ccode))
            events.append({
                "id": r.event_id, "slug": slugify(name), "name": name, "iso": iso,
                "date": r.date, "prec": r.date_precision, "year": int(r.year), "type": r.type,
                "conf": r.confidence, "nsch": int(r.n_scholarly), "sources": r.sources,
                "label": r.label, "self": str(r.self_coup) == "True",
                "disputed": str(r.disputed) == "True", "colpus": r.colpus_class,
                "dup": r.possible_duplicate_of,
            })
    else:                                   # modalita' demo: solo gli eventi usati dal modello
        for c in result["countries"]:
            for k in c["coups"]:
                events.append({"id": f"{c['name']}-{k['date']}", "slug": slugify(c["name"]), "name": c["name"],
                               "iso": c["iso"], "date": k["date"] + "-01", "prec": "month",
                               "year": int(k["date"][:4]), "type": "riuscito" if k["success"] else "fallito",
                               "conf": "A", "nsch": 1, "sources": "demo", "label": "", "self": False,
                               "disputed": False, "colpus": "", "dup": ""})
    events.sort(key=lambda e: (e["date"], e["name"]))

    # ---------------- paesi
    stats: dict[str, dict] = {}
    for e in events:
        if e["type"] == "complotto" or e["conf"] == "D" or e["dup"]:
            continue
        s = stats.setdefault(e["slug"], {"name": e["name"], "iso": e["iso"], "attempts": 0, "successes": 0,
                                         "last": None})
        s["attempts"] += 1
        s["successes"] += e["type"] == "riuscito"
        s["last"] = {"date": e["date"], "type": e["type"]}
    countries, details = [], {}
    for c in result["countries"]:
        slug = slugify(c["name"])
        st = stats.pop(slug, {"attempts": 0, "successes": 0, "last": None})
        countries.append({"slug": slug, "name": c["name"], "iso": c["iso"], "region": c["region"],
                          "risk": c["risk"], "risk_lo": c.get("risk_lo"), "risk_hi": c.get("risk_hi"),
                          "rank": c["rank"], "risk_3m_ago": c["risk_3m_ago"], "structural": c.get("structural", True),
                          "drivers": c["drivers"], "groups": c.get("groups", []), "historical": False,
                          "attempts": st["attempts"],
                          "successes": st["successes"], "last": st["last"]})
        details[slug] = {"risk_hist": c["risk_hist"], "series": c["series"]}
    for slug, st in sorted(stats.items()):   # paesi presenti solo nella storia dei golpe
        countries.append({"slug": slug, "name": st["name"], "iso": st["iso"], "region": "", "risk": None,
                          "risk_lo": None, "risk_hi": None, "rank": None, "risk_3m_ago": None, "structural": False,
                          "drivers": [], "groups": [], "historical": True,
                          "attempts": st["attempts"], "successes": st["successes"], "last": st["last"]})

    # ---------------- sintesi
    per_year: dict[int, dict] = {}
    for e in events:
        if e["type"] == "complotto" or e["dup"]:
            continue
        y = per_year.setdefault(e["year"], {"year": e["year"], "A": [0, 0], "B": [0, 0], "C": [0, 0], "D": [0, 0]})
        y[e["conf"]][0 if e["type"] == "riuscito" else 1] += 1
    years = range(min(per_year), max(per_year) + 1) if per_year else []
    timeline = [per_year.get(y, {"year": y, "A": [0, 0], "B": [0, 0], "C": [0, 0], "D": [0, 0]}) for y in years]
    summary = {"meta": result["meta"], "metrics": result["metrics"], "comparisons": result.get("comparisons", []),
               "calibration": result.get("calibration", []), "timeline": timeline,
               "event_study": result["history"]["event_study"], "factors": result["history"]["factors"],
               "by_region": result["history"]["by_region"]}

    def dump(name, obj):
        path = out_dir / name
        path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        return f"{name} {path.stat().st_size / 1024:.0f} KB"

    print("Dati per il sito:", ", ".join([dump("summary.json", summary), dump("countries.json", countries),
                                          dump("details.json", details), dump("coups.json", events)]))
    missing = sorted({e["name"] for e in events if not e["iso"]})
    if missing:
        print("  paesi senza codice per la mappa:", ", ".join(missing))
