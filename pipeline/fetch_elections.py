"""Calendario elettorale nazionale, passato e futuro, da Wikipedia in inglese.

Le pagine "AAAA national electoral calendar" elencano mese per mese le elezioni nazionali di ogni
paese; quelle degli anni a venire riportano le elezioni gia' fissate. Uscita:
data/raw/elections/elections.csv con una riga per (paese, data, tipo).

  tipo = executive | legislative | general | referendum | other

Limite da tenere presente: le pagine degli anni passati mostrano le elezioni che si sono tenute
davvero. Usarle come "elezione in programma" nella validazione storica introduce un piccolo
vantaggio a posteriori (elezioni anticipate o rinviate), che la previsione corrente non ha.

Uso:  python pipeline/fetch_elections.py [--from 2000]
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "raw" / "elections" / "elections.csv"
API = "https://en.wikipedia.org/w/api.php"
UA = {"User-Agent": "ToolCoup/1.0 (research pipeline)"}
MONTHS = {m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                           "september", "october", "november", "december"])}


def wikitext(title: str) -> str | None:
    q = urllib.parse.urlencode({"action": "parse", "page": title, "prop": "wikitext", "format": "json", "redirects": 1})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{API}?{q}", headers=UA), timeout=60) as r:
                d = json.load(r)
            return None if "error" in d else d["parse"]["wikitext"]["*"]
        except OSError:
            time.sleep(3 * (attempt + 1))
    return None


def kind(text: str) -> str:
    t = text.lower()
    ex = bool(re.search(r"president|executive|head of state", t))
    lg = bool(re.search(r"parliament|legislat|assembly|senate|house|chamber|congress|duma|council|general election|diet|sejm|riksdag|knesset", t))
    if "general" in t or (ex and lg):
        return "general"
    if ex:
        return "executive"
    if lg:
        return "legislative"
    return "referendum" if "referendum" in t else "other"


def parse(year: int, text: str):
    month = None
    for line in text.splitlines():
        h = re.match(r"==+\s*(.+?)\s*==+\s*$", line)
        if h:                                   # le sezioni non mensili (elezioni indirette, note) azzerano il mese
            month = MONTHS.get(h.group(1).lower())
            continue
        if not month or not line.startswith("*") or line.startswith("**"):
            continue
        body = re.sub(r"<ref.*?(</ref>|/>)|<ref[^>]*>.*", "", line[1:]).strip()
        if ":" not in body:
            continue
        when, rest = body.split(":", 1)
        m = re.search(r"\[\[(?:[^\]|]*\|)?([^\]]+)\]\]", rest)
        if not m:
            continue
        country = re.sub(r"\{\{[^}]*\}\}", "", m.group(1)).strip()
        d = re.search(r"(\d{1,2})", when)
        yield {"country": country, "date": f"{year}-{month:02d}-{int(d.group(1)) if d else 15:02d}",
               "day_known": bool(d), "type": kind(rest[m.end():] or rest), "scheduled": year > date.today().year
               or (year == date.today().year and month >= date.today().month), "text": re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]+)\]\]", r"\1", rest).strip()[:120]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", type=int, default=2008)
    args = ap.parse_args()
    rows = []
    for year in range(args.start, date.today().year + 2):
        text = None
        for attempt in range(3):                # l'API ogni tanto risponde a vuoto: si riprova
            text = wikitext(f"{year} national electoral calendar")
            if text:
                break
            time.sleep(2 + 2 * attempt)
        got = list(parse(year, text)) if text else []
        rows += got
        print(f"  {year}: {len(got)} elezioni" + ("" if text else " (pagina assente)"))
        time.sleep(0.3)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["country", "date", "day_known", "type", "scheduled", "text"])
        w.writeheader()
        w.writerows(rows)
    print(f"Fatto: {len(rows)} righe in {OUT.relative_to(OUT.parents[3])}")


if __name__ == "__main__":
    main()
