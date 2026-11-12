"""Scarica l'ultima versione del dataset Powell & Thyne.

Non esiste un'API: gli autori pubblicano un CSV con nome datato (pt_AAAAMMGG.csv) sulla pagina
https://jonathanmpowell.com/coups. Lo script legge la pagina, trova il CSV piu' recente e lo
salva in data/raw/coups/powell_thyne.csv.

Uso:  python pipeline/fetch_coups.py
"""
import re
import sys
import urllib.request
from pathlib import Path

PAGE = "https://jonathanmpowell.com/coups"
OUT = Path(__file__).resolve().parents[1] / "data" / "raw" / "coups" / "powell_thyne.csv"
UA = {"User-Agent": "ToolCoup/1.0 (research pipeline; +https://github.com/Thefariseo/ToolCoup)"}


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def main() -> None:
    html = get(PAGE).decode("utf-8", "replace")
    links = sorted(set(re.findall(r'https?://[^"\'\s]+/pt_(\d{8})[^"\'\s]*\.csv', html)))
    urls = {m.group(1): m.group(0) for m in re.finditer(r'https?://[^"\'\s]+/pt_(\d{8})[^"\'\s]*\.csv', html)}
    if not links:
        sys.exit(f"Nessun CSV trovato su {PAGE}: scaricalo a mano e salvalo in {OUT}")
    version = links[-1]
    data = get(urls[version])
    head = data[:200].decode("utf-8", "replace").lower()
    if "country" not in head or "coup" not in head:
        sys.exit("Il file scaricato non sembra il dataset dei golpe: controlla la pagina a mano.")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(data)
    print(f"Powell & Thyne versione {version}: {data.count(b'\n') - 1} tentativi di golpe -> {OUT.name}")


if __name__ == "__main__":
    main()
