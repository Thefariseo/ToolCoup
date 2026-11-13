"""Scarica le variabili strutturali per il modello in data/raw/structural/.

  vdem_structural.csv   V-Dem (paese-anno dal 1900): regime, leader, elezioni, mobilitazione, PIL storico
  wdi.csv               Banca Mondiale (dal 1960): PIL pro capite e crescita, mortalita' infantile,
                        popolazione, rendite petrolifere, inflazione

Entrambe pubbliche e senza credenziali. Per V-Dem serve R (Rscript).

Uso:  python pipeline/fetch_structural.py
"""
import csv
import json
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "raw" / "structural"
UA = {"User-Agent": "ToolCoup/1.0 (research pipeline; +https://github.com/Thefariseo/ToolCoup)"}
VDEM_URL = "https://raw.githubusercontent.com/vdeminstitute/vdemdata/master/data/vdem.RData"
VDEM_VARS = ["country_name", "country_text_id", "COWcode", "year", "v2x_polyarchy", "v2x_libdem", "v2x_regime",
             "v2x_ex_military", "v2x_ex_hereditary", "v2x_ex_party", "v2x_civlib", "v2x_clphy", "v2xcs_ccsi",
             "v2x_corr", "v2x_rule", "v2xnp_pres", "v2x_neopat", "e_gdppc", "e_pop", "e_regionpol_6C",
             "v2exnamhos", "v2exnamhog", "v2exhoshog", "v2xel_elecparl", "v2xel_elecpres", "v2x_elecreg",
             "v2reginfo", "v2regdur", "v2regendtype", "v2svstterr", "v2cademmob", "v2caautmob", "v2cagenmob",
             "v2caviol", "v2exrescon", "v2x_jucon", "v2xlg_legcon", "v2x_accountability", "v2svdomaut",
             "v2stfisccap", "v2clpolcl", "v2pepwrsoc", "e_total_oil_income_pc"]
WDI = {"NY.GDP.PCAP.KD": "gdppc", "NY.GDP.PCAP.KD.ZG": "gdp_growth", "SP.DYN.IMRT.IN": "infant_mortality",
       "SP.POP.TOTL": "population", "NY.GDP.PETR.RT.ZS": "oil_rents", "FP.CPI.TOTL.ZG": "inflation"}


def get(url: str) -> bytes:
    """Scarica con curl se disponibile (l'API della Banca Mondiale lascia in attesa urllib), altrimenti urllib."""
    curl = "/usr/bin/curl" if Path("/usr/bin/curl").exists() else shutil.which("curl")   # quello di sistema
    if curl:
        return subprocess.run([curl, "-sS", "-L", "--fail", "--max-time", "120", url], check=True,
                              capture_output=True).stdout
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
        return r.read()


def fetch_vdem() -> None:
    if not shutil.which("Rscript"):
        print("  V-Dem: saltato, serve R (Rscript)")
        return
    out = OUT / "vdem_structural.csv"
    with tempfile.TemporaryDirectory() as tmp:
        rda = Path(tmp) / "vdem.RData"
        rda.write_bytes(get(VDEM_URL))
        want = ",".join(f'"{v}"' for v in VDEM_VARS)
        code = (f'e <- new.env(); load("{rda}", envir=e); d <- get(ls(e)[1], envir=e); '
                f'have <- intersect(c({want}), names(d)); '
                f'write.csv(d[d$year >= 1900, have], "{out}", row.names=FALSE)')
        subprocess.run(["Rscript", "--vanilla", "-e", code], check=True, capture_output=True)
    print(f"  vdem_structural.csv: {out.stat().st_size / 1e6:.1f} MB")


def fetch_wdi() -> None:
    rows: dict[tuple[str, int], dict] = {}
    for code, name in WDI.items():
        page, pages = 1, 1
        while page <= pages:
            url = (f"https://api.worldbank.org/v2/country/all/indicator/{code}"
                   f"?format=json&per_page=20000&date=1960:2030&page={page}")
            for attempt in range(3):
                try:
                    meta, data = json.loads(get(url))
                    break
                except (subprocess.CalledProcessError, ValueError, OSError):
                    meta, data = None, None
            if meta is None:
                print(f"  WDI {name}: non disponibile ora, si prosegue senza")
                break
            pages = meta["pages"]
            for d in data or []:
                iso3 = d.get("countryiso3code")
                if iso3 and d["value"] is not None:
                    rows.setdefault((iso3, int(d["date"])), {})[name] = d["value"]
            page += 1
        else:
            print(f"  WDI {name}: fatto")
    with open(OUT / "wdi.csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["iso3", "year", *WDI.values()])
        for (iso3, year), vals in sorted(rows.items()):
            w.writerow([iso3, year, *[vals.get(n, "") for n in WDI.values()]])
    print(f"  wdi.csv: {len(rows)} paese-anni")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    fetch_wdi()
    fetch_vdem()
