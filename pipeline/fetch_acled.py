"""Scarica gli eventi ACLED via API (OAuth) in data/raw/acled/acled_AAAA.csv, un file per anno.

Credenziali myACLED (mai salvate in chiaro, mai nel repository):
  - variabili d'ambiente ACLED_EMAIL e ACLED_PASSWORD, oppure
  - richieste a terminale se le variabili mancano (la password non viene mostrata).
Il token di rinnovo (valido 14 giorni) viene tenuto in .acled_token.json, escluso da git,
cosi' le esecuzioni successive non richiedono la password.

Uso:
    python pipeline/fetch_acled.py                 # tutti gli anni dal 1997; salta quelli gia' scaricati
    python pipeline/fetch_acled.py --from 2018     # solo dal 2018
    python pipeline/fetch_acled.py --refresh       # riscarica tutto

Gli ultimi due anni vengono sempre riscaricati, perche' ACLED aggiorna e corregge gli eventi recenti.
Documentazione API: https://acleddata.com/api-documentation/getting-started
"""
from __future__ import annotations

import argparse
import csv
import getpass
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "raw" / "acled"
TOKEN_FILE = ROOT / ".acled_token.json"
TOKEN_URL = "https://acleddata.com/oauth/token"
READ_URL = "https://acleddata.com/api/acled/read"
FIELDS = ["event_id_cnty", "event_date", "year", "event_type", "sub_event_type", "inter1", "inter2",
          "iso", "region", "country", "fatalities"]
LIMIT = 5000
UA = "ToolCoup/1.0 (+https://github.com/Thefariseo/ToolCoup)"


def _post(url: str, form: dict) -> dict:
    req = urllib.request.Request(url, data=urllib.parse.urlencode(form).encode(),
                                 headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def _save_token(tok: dict) -> None:
    TOKEN_FILE.write_text(json.dumps({"refresh_token": tok.get("refresh_token")}))
    os.chmod(TOKEN_FILE, 0o600)


def get_token() -> str:
    """Token di accesso: prima prova il rinnovo, poi email + password."""
    if TOKEN_FILE.exists():
        try:
            saved = json.loads(TOKEN_FILE.read_text())
            tok = _post(TOKEN_URL, {"refresh_token": saved["refresh_token"],
                                    "grant_type": "refresh_token", "client_id": "acled"})
            _save_token(tok)
            return tok["access_token"]
        except (urllib.error.HTTPError, KeyError, ValueError):
            pass  # token di rinnovo scaduto o non valido: si torna alle credenziali
    email = os.environ.get("ACLED_EMAIL") or input("Email myACLED: ").strip()
    password = os.environ.get("ACLED_PASSWORD") or getpass.getpass("Password myACLED (non viene mostrata): ")
    try:
        tok = _post(TOKEN_URL, {"username": email, "password": password, "grant_type": "password",
                                "client_id": "acled", "scope": "authenticated"})
    except urllib.error.HTTPError as e:
        sys.exit(f"Accesso ACLED rifiutato (HTTP {e.code}): controlla email e password, "
                 "e che l'account abbia accesso all'API.")
    _save_token(tok)
    return tok["access_token"]


def _get(params: dict, token: str, tries: int = 5) -> dict:
    url = READ_URL + "?" + urllib.parse.urlencode(params, safe="|")
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                sys.exit(f"ACLED ha rifiutato la richiesta (HTTP {e.code}): token scaduto o account "
                         "senza accesso a questi dati.")
            if e.code not in (429, 500, 502, 503, 504) or attempt == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == tries - 1:
                raise
        time.sleep(5 * (attempt + 1))
    raise RuntimeError("irraggiungibile")


def fetch_year(year: int, token: str) -> int:
    """Scarica un anno con paginazione a cursore; scrive il CSV solo a download completo."""
    base = {"_format": "json", "year": year, "fields": "|".join(FIELDS), "limit": LIMIT}
    tmp, out = OUT_DIR / f"acled_{year}.csv.part", OUT_DIR / f"acled_{year}.csv"
    n, cursor, page = 0, "0", 1
    with open(tmp, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        while True:
            params = dict(base, cursor=cursor) if cursor is not None else dict(base, page=page)
            resp = _get(params, token)
            rows = resp.get("data") or []
            w.writerows(rows)
            n += len(rows)
            print(f"\r  {year}: {n:,} eventi", end="", flush=True)
            if "next_cursor" in resp:
                cursor = resp["next_cursor"]
                if cursor is None or not rows:
                    break
            else:                       # risposta senza cursore: paginazione a pagine
                cursor, page = None, page + 1
                if len(rows) < LIMIT:
                    break
    print()
    if n == 0:
        tmp.unlink()
        return 0
    tmp.replace(out)
    return n


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", type=int, default=1997, help="primo anno (default 1997)")
    ap.add_argument("--refresh", action="store_true", help="riscarica anche gli anni gia' presenti")
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    token = get_token()
    this_year = date.today().year
    total = 0
    for year in range(args.start, this_year + 1):
        out = OUT_DIR / f"acled_{year}.csv"
        if out.exists() and not args.refresh and year < this_year - 1:
            print(f"  {year}: gia' scaricato, salto")
            continue
        total += fetch_year(year, token)
    print(f"Fatto: {total:,} eventi scaricati in {OUT_DIR.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
