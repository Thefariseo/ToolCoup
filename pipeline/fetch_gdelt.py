"""GDELT senza Google Cloud: campionamento dei file giornalieri aperti.

BigQuery richiede un progetto Google Cloud. I file grezzi di GDELT 1.0 (un archivio di eventi per giorno, 8-12 MB compressi, dal 2013-04,
http://data.gdeltproject.org/events/) sono pubblici e senza credenziali: qui se ne legge uno ogni `--every` giorni (default 7),
si aggregano per paese dell'azione (codice FIPS) e si accumulano in data/gdelt/daily_sample.csv. Da quel campione si ricavano, per ogni
paese e mese, volume, tono medio e quota di eventi di conflitto (CAMEO: 14 proteste, 17 coercizione, 18 aggressione, 19 combattimenti, 20 violenza di massa).

Il campione e' un'approssimazione: con una settimana su sette ogni mese pesa 4 giorni interi, sufficienti per medie e quote, non per conteggi esatti.
L'esecuzione e' incrementale: i giorni gia' presenti vengono saltati, quindi il flusso mensile scarica solo quelli nuovi (circa quattro file).

Uso:  python pipeline/fetch_gdelt.py [--every 7] [--from 2013-04-01] [--workers 4]
"""
from __future__ import annotations

import argparse
import io
import shutil
import subprocess
import threading
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "gdelt" / "daily_sample.csv"
FIPS = ROOT / "data" / "gdelt" / "fips_countries.tsv"
URL = "http://data.gdeltproject.org/events/{d}.export.CSV.zip"
COLS = {1: "sqldate", 28: "root", 30: "goldstein", 31: "mentions", 34: "tone", 51: "fips"}
ROOTS = [13, 14, 15, 17, 18, 19, 20]
FIELDS = ["date", "fips", "events", "mentions", "tone_w", "gold_w"] + [f"r{r}" for r in ROOTS]
lock = threading.Lock()


def curl() -> str:
    return "/usr/bin/curl" if Path("/usr/bin/curl").exists() else shutil.which("curl")


def day_rows(d: date) -> pd.DataFrame | None:
    raw = subprocess.run([curl(), "-sS", "-L", "--fail", "--max-time", "240", URL.format(d=d.strftime("%Y%m%d"))], capture_output=True)
    if raw.returncode != 0 or not raw.stdout:
        return None
    z = zipfile.ZipFile(io.BytesIO(raw.stdout))
    df = pd.read_csv(z.open(z.namelist()[0]), sep="\t", header=None, usecols=list(COLS), names=None, dtype=str, on_bad_lines="skip", low_memory=False)
    df = df.rename(columns=COLS)
    for c in ("root", "goldstein", "mentions", "tone"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["fips", "root", "mentions", "tone"])
    df["m"] = df["mentions"].clip(lower=1)
    df["tone_w"] = df["tone"] * df["m"]; df["gold_w"] = df["goldstein"].fillna(0) * df["m"]
    g = df.groupby("fips").agg(events=("root", "size"), mentions=("m", "sum"), tone_w=("tone_w", "sum"), gold_w=("gold_w", "sum"))
    for r in ROOTS:
        g[f"r{r}"] = df[df["root"] == r].groupby("fips").size().reindex(g.index).fillna(0).astype(int)
    g = g.reset_index(); g.insert(0, "date", d.isoformat())
    return g[FIELDS]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=int, default=7)
    ap.add_argument("--from", dest="start", default="2013-04-01")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if not FIPS.exists():
        FIPS.write_bytes(subprocess.run([curl(), "-sS", "-L", "--fail", "--max-time", "60", "https://www.gdeltproject.org/data/lookups/FIPS.country.txt"], check=True, capture_output=True).stdout)
    done = set(pd.read_csv(OUT, usecols=["date"])["date"].unique()) if OUT.exists() else set()
    skipped = set(OUT.with_suffix(".missing").read_text().split()) if OUT.with_suffix(".missing").exists() else set()
    d, end, days = date.fromisoformat(args.start), date.today() - timedelta(days=3), []
    while d <= end:
        if d.isoformat() not in done and d.isoformat() not in skipped:
            days.append(d)
        d += timedelta(days=args.every)
    print(f"{len(done)} giorni gia' presenti, {len(days)} da scaricare")
    new_header = not OUT.exists()
    n_ok = 0

    def work(day: date) -> None:
        nonlocal n_ok, new_header
        try:
            rows = day_rows(day)
        except Exception as e:                                   # file corrotto o rete: si riprova alla prossima esecuzione
            print(f"  {day}: {str(e)[:80]}")
            return
        with lock:
            if rows is None:
                with open(OUT.with_suffix(".missing"), "a") as fh:
                    fh.write(day.isoformat() + "\n")             # il file non esiste (alcuni giorni mancano nell'archivio)
                return
            rows.to_csv(OUT, mode="a", header=new_header, index=False)
            new_header = False; n_ok += 1
            if n_ok % 25 == 0:
                print(f"  {n_ok}/{len(days)} ({day})", flush=True)

    with ThreadPoolExecutor(args.workers) as ex:
        list(ex.map(work, days))
    print(f"Scritti {n_ok} giorni in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
