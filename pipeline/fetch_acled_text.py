"""Scarica da ACLED il testo degli eventi utili a riconoscere i precursori di un golpe.

Il modello usa solo conteggi mensili; qui si scarica il campo descrittivo (`notes`) e gli attori, ma
non per tutti i 3 milioni di eventi: solo per
  - tutti gli "Strategic developments" (arresti, rimpasti, accordi, cambi ai vertici, ecc.);
  - gli eventi di qualunque tipo il cui testo contiene una delle radici in STEMS (coup, mutin, overthrow);
  - gli eventi con un attore "Mutiny of ..." (ammutinamenti codificati da ACLED).
La classificazione vera e propria avviene dopo, in locale (pipeline/triggers.py): il filtro lato
server e' volutamente largo ("coup" prende anche "couple").

Uscita: data/raw/acled_text/acled_text_AAAA.csv (fuori dal repository, come gli altri dati ACLED).

Uso:
    python pipeline/fetch_acled_text.py              # dal 1997, salta gli anni gia' scaricati
    python pipeline/fetch_acled_text.py --from 2024  # solo dal 2024
Gli ultimi due anni vengono sempre riscaricati.
"""
from __future__ import annotations

import argparse
import csv
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_acled as F  # noqa: E402

OUT_DIR = F.ROOT / "data" / "raw" / "acled_text"
FIELDS = ["event_id_cnty", "event_date", "year", "event_type", "sub_event_type", "actor1", "actor2",
          "inter1", "inter2", "iso", "region", "country", "fatalities", "notes"]
WORKERS = 6
# Ogni ricerca nel testo costa al server circa mezzo minuto per anno, anche a vuoto: poche radici.
# Rimpasti, arresti, stati d'emergenza e crisi al vertice sono gia' quasi tutti "Strategic developments".
STEMS = ["coup", "mutin", "overthrow"]


def pages(params: dict, auth: dict):
    base = {"_format": "json", "fields": "|".join(FIELDS), "limit": F.LIMIT, **params}
    cursor, page = "0", 1
    while True:
        resp = F._get(dict(base, cursor=cursor) if cursor is not None else dict(base, page=page), auth)
        rows = resp.get("data") or []
        yield from rows
        if "next_cursor" in resp:
            cursor = resp["next_cursor"]
            if cursor is None or not rows:
                return
        else:
            cursor, page = None, page + 1
            if len(rows) < F.LIMIT:
                return


def fetch_year(year: int, auth: dict) -> int:
    queries = [{"event_type": "Strategic developments"}]
    queries += [{"notes": s, "notes_where": "LIKE"} for s in STEMS]
    queries += [{"actor1": "Mutiny", "actor1_where": "LIKE"}, {"actor2": "Mutiny", "actor2_where": "LIKE"}]
    seen: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:      # le ricerche nel testo sono lente: in parallelo
        for rows in pool.map(lambda q: list(pages(dict(q, year=year), auth)), queries):
            for row in rows:
                seen.setdefault(row["event_id_cnty"], row)
    print(f"  {year}: {len(seen):,} eventi", flush=True)
    if not seen:
        return 0
    tmp, out = OUT_DIR / f"acled_text_{year}.csv.part", OUT_DIR / f"acled_text_{year}.csv"
    with open(tmp, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(sorted(seen.values(), key=lambda r: (r["event_date"], r["event_id_cnty"])))
    tmp.replace(out)
    return len(seen)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", type=int, default=1997)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    auth = {"token": F.get_token()}
    this_year, total = date.today().year, 0
    for year in range(args.start, this_year + 1):
        out = OUT_DIR / f"acled_text_{year}.csv"
        if out.exists() and not args.refresh and year < this_year - 1:
            print(f"  {year}: gia' scaricato, salto")
            continue
        total += fetch_year(year, auth)
    print(f"Fatto: {total:,} eventi con testo in {OUT_DIR.relative_to(F.ROOT)}/")


if __name__ == "__main__":
    main()
