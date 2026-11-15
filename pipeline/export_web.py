"""Scrive i dati letti dal sito Next.js (cartella webdata/).

  summary.json    metadati, metriche di validazione, serie storiche aggregate
  countries.json  un record per paese: rischio attuale, posizione, fattori, sintesi dei golpe
  details.json    per paese: storia del rischio e serie mensili ACLED
  coups.json      tutti gli eventi del database dei golpe, con affidabilita' e fonti

Per correggere la sola storia dei golpe senza ricalcolare le previsioni (dopo una modifica al database dei golpe):
    python pipeline/export_web.py --refresh-history
"""
from __future__ import annotations

import json
import re
import sys
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


def build_events(coupdb_csv: Path | None, countries: list[dict]) -> list[dict]:
    """Eventi del database dei golpe con i nomi e i codici usati dal sito. `countries`: i paesi con previsione."""
    acled = {c["name"]: c for c in countries}
    lookup = {norm(n): n for n in acled}

    def site_name(name: str) -> str:
        n = norm(name)
        return lookup.get(n) or ALIASES.get(n) or name

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
        for c in countries:
            for k in c["coups"]:
                events.append({"id": f"{c['name']}-{k['date']}", "slug": slugify(c["name"]), "name": c["name"],
                               "iso": c["iso"], "date": k["date"] + "-01", "prec": "month",
                               "year": int(k["date"][:4]), "type": "riuscito" if k["success"] else "fallito",
                               "conf": "A", "nsch": 1, "sources": "demo", "label": "", "self": False,
                               "disputed": False, "colpus": "", "dup": ""})
    events.sort(key=lambda e: (e["date"], e["name"]))
    return events


def event_stats(events: list[dict]) -> dict[str, dict]:
    """Tentativi, successi e ultimo evento per paese (esclusi complotti, livello D e possibili doppioni)."""
    stats: dict[str, dict] = {}
    for e in events:
        if e["type"] == "complotto" or e["conf"] == "D" or e["dup"]:
            continue
        s = stats.setdefault(e["slug"], {"name": e["name"], "iso": e["iso"], "attempts": 0, "successes": 0,
                                         "last": None})
        s["attempts"] += 1
        s["successes"] += e["type"] == "riuscito"
        s["last"] = {"date": e["date"], "type": e["type"]}
    return stats


def historical_entries(stats: dict[str, dict]) -> list[dict]:
    """Paesi presenti solo nella storia dei golpe (senza previsione)."""
    return [{"slug": slug, "name": st["name"], "iso": st["iso"], "region": "", "risk": None,
             "risk_lo": None, "risk_hi": None, "rank": None, "risk_3m_ago": None, "structural": False,
             "drivers": [], "groups": [], "historical": True,
             "attempts": st["attempts"], "successes": st["successes"], "last": st["last"]}
            for slug, st in sorted(stats.items())]


def yearly_timeline(events: list[dict]) -> list[dict]:
    per_year: dict[int, dict] = {}
    for e in events:
        if e["type"] == "complotto" or e["dup"]:
            continue
        y = per_year.setdefault(e["year"], {"year": e["year"], "A": [0, 0], "B": [0, 0], "C": [0, 0], "D": [0, 0]})
        y[e["conf"]][0 if e["type"] == "riuscito" else 1] += 1
    years = range(min(per_year), max(per_year) + 1) if per_year else []
    return [per_year.get(y, {"year": y, "A": [0, 0], "B": [0, 0], "C": [0, 0], "D": [0, 0]}) for y in years]


def _dump(out_dir: Path, name: str, obj) -> str:
    path = out_dir / name
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return f"{name} {path.stat().st_size / 1024:.0f} KB"


def export(result: dict, coupdb_csv: Path | None, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    events = build_events(coupdb_csv, result["countries"])

    # ---------------- paesi
    stats = event_stats(events)
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
        details[slug] = {"risk_hist": c["risk_hist"], "series": c["series"], "diagnostics": c.get("diagnostics")}
    countries += historical_entries(stats)

    # ---------------- sintesi
    summary = {"meta": result["meta"], "metrics": result["metrics"], "comparisons": result.get("comparisons", []),
               "calibration": result.get("calibration", []), "timeline": yearly_timeline(events),
               "event_study": result["history"]["event_study"], "factors": result["history"]["factors"],
               "by_region": result["history"]["by_region"]}

    print("Dati per il sito:", ", ".join([_dump(out_dir, "summary.json", summary), _dump(out_dir, "countries.json", countries),
                                          _dump(out_dir, "details.json", details), _dump(out_dir, "coups.json", events)]))
    missing = sorted({e["name"] for e in events if not e["iso"]})
    if missing:
        print("  paesi senza codice per la mappa:", ", ".join(missing))


def refresh_history(coupdb_csv: Path, out_dir: Path) -> None:
    """Riscrive coups.json, la sintesi dei golpe in countries.json e la serie annuale in summary.json.

    Le previsioni, le metriche e i dettagli restano quelli gia' pubblicati: serve a correggere la storia dei golpe
    (nuove regole del database) senza cambiare i numeri emessi con l'edizione corrente.
    """
    countries = json.loads((out_dir / "countries.json").read_text(encoding="utf-8"))
    summary = json.loads((out_dir / "summary.json").read_text(encoding="utf-8"))
    forecast = [c for c in countries if not c["historical"]]
    events = build_events(coupdb_csv, forecast)
    stats = event_stats(events)
    for c in forecast:
        st = stats.pop(c["slug"], {"attempts": 0, "successes": 0, "last": None})
        c["attempts"], c["successes"], c["last"] = st["attempts"], st["successes"], st["last"]
    summary["timeline"] = yearly_timeline(events)
    print("Storia dei golpe aggiornata:", ", ".join([_dump(out_dir, "coups.json", events),
                                                     _dump(out_dir, "countries.json", forecast + historical_entries(stats)),
                                                     _dump(out_dir, "summary.json", summary)]))


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    if "--refresh-history" in sys.argv:
        refresh_history(root / "data" / "coupdb" / "coups.csv", root / "webdata")
    else:
        sys.exit("uso: python pipeline/export_web.py --refresh-history")
