"""Scarica le fonti usate per il database dei golpe in data/raw/coup_sources/.

Tutte pubbliche e senza credenziali. Powell & Thyne ha il suo script (fetch_coups.py).
Il Cline Center Coup d'Etat Project non consente lo scaricamento automatico: i suoi dati
entrano attraverso il confronto gia' fatto da Colpus (aggiornato al 2020).

PIPE e V-Dem sono distribuiti in formato R: per convertirli serve R installato (Rscript).

Uso:  python pipeline/fetch_coup_sources.py
"""
import json
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "raw" / "coup_sources"
UA = {"User-Agent": "ToolCoup/1.0 (research pipeline; +https://github.com/Thefariseo/ToolCoup)"}

FILES = {
    # Archigos 4.1 - Goemans, Gleditsch & Chiozza (2009), capi di stato 1875-2015
    "archigos/Archigos_4.1_stata14.dta": "https://www.rochester.edu/college/faculty/hgoemans/Archigos_4.1_stata14.dta",
    # Center for Systemic Peace - Marshall & Marshall, Coups d'Etat 1946-2021
    "csp/CSPCoupsListv2021.xls": "http://www.systemicpeace.org/inscr/CSPCoupsListv2021.xls",
    # Colpus - Chin, Carter & Wright (2021): elenco aggiornato, versione 1.0 e file dei candidati
    "colpus/colpus_latest.dta": "https://drive.google.com/uc?export=download&id=1bBSmmtkZQG6OGBMOamr4fht9H7xrf8Ac",
    "colpus/colpus_v1.dta": "https://drive.google.com/uc?export=download&id=1_xG2EkcBC3NgwIbFI-SXoYgcihgBBC19",
    "colpus/colpus_candidates.dta": "https://drive.google.com/uc?export=download&id=1aK92WPkT-kd_1de2k15__5yJRJ_SWGHb",
}

SPARQL = """SELECT ?e ?eLabel ?typeLabel ?date ?start ?end ?country ?countryLabel ?article WHERE {
  ?e wdt:P31 ?type . ?type wdt:P279* wd:Q45382 .
  OPTIONAL { ?e wdt:P585 ?date } OPTIONAL { ?e wdt:P580 ?start } OPTIONAL { ?e wdt:P582 ?end }
  OPTIONAL { ?e wdt:P17 ?country }
  OPTIONAL { ?article schema:about ?e ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }"""


# dati in formato R (.rda): (cartella/file csv, url, codice R che produce il data frame `x` da `d`)
R_SOURCES = [
    # PIPE - Przeworski et al. (2013), Political Institutions and Political Events, 1788-2008
    ("pipe/PIPE.csv", "https://raw.githubusercontent.com/xmarquez/democracyData/master/data/PIPE.rda",
     "x <- d"),
    # V-Dem (include gli Historical Regimes Data di Knutsen, Djuve & Wig): solo le variabili sui regimi
    ("vdem/vdem_regimes.csv", "https://raw.githubusercontent.com/vdeminstitute/vdemdata/master/data/vdem.RData",
     'v <- intersect(c("country_name","country_text_id","year","COWcode","v2reginfo","v2regendtype",'
     '"v2regidnr","e_pt_coup","e_coups"), names(d)); x <- d[!is.na(d$v2reginfo), v]'),
]


def fetch_r(rel: str, url: str, expr: str) -> None:
    if not shutil.which("Rscript"):
        print(f"  {rel}: saltato, serve R (Rscript) per convertire {url}")
        return
    out = OUT / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        rda = Path(tmp) / "data.rda"
        rda.write_bytes(get(url))
        code = (f'e <- new.env(); load("{rda}", envir=e); d <- as.data.frame(get(ls(e)[1], envir=e)); '
                f'{expr}; write.csv(x, "{out}", row.names=FALSE)')
        subprocess.run(["Rscript", "--vanilla", "-e", code], check=True, capture_output=True)
    print(f"  {rel}: {out.stat().st_size / 1024:.0f} KB")


def get(url: str, headers: dict | None = None) -> bytes:
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def save(rel: str, data: bytes) -> None:
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print(f"  {rel}: {len(data) / 1024:.0f} KB")


def main() -> None:
    for rel, url in FILES.items():
        data = get(url)
        if data[:15].lstrip().lower().startswith((b"<!doctype", b"<html")):
            print(f"  {rel}: il server ha risposto con una pagina web invece del file - scaricalo a mano da {url}")
            continue
        save(rel, data)
    q = urllib.parse.urlencode({"query": SPARQL, "format": "json"})
    save("wikidata/wikidata_coups.json", get("https://query.wikidata.org/sparql?" + q,
                                             {"Accept": "application/sparql-results+json"}))
    for page, rel in (("List of coups and coup attempts", "wikipedia/list_coups.json"),
                      ("List of coups and coup attempts by country", "wikipedia/list_by_country.json")):
        q = urllib.parse.urlencode({"action": "parse", "page": page, "prop": "wikitext",
                                    "format": "json", "formatversion": 2})
        raw = get("https://en.wikipedia.org/w/api.php?" + q)
        json.loads(raw)["parse"]["wikitext"]      # verifica che la risposta sia quella attesa
        save(rel, raw)
    for rel, url, expr in R_SOURCES:
        fetch_r(rel, url, expr)


if __name__ == "__main__":
    main()
