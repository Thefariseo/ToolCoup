"""Scarica le fonti delle estensioni del modello in data/raw/extensions/ (tutte pubbliche, senza chiavi):

  wdi_military.csv       Banca Mondiale/SIPRI: spesa militare (% PIL), forze armate, importazioni di armi
  fao_cpi.csv            FAOSTAT: indici dei prezzi al consumo, generale e alimentare, mensili per paese
  fao_fx.csv             FAOSTAT: tasso di cambio mensile (moneta locale per dollaro)
  epr.csv                ETH Zurich, Ethnic Power Relations: gruppi etnici, quota di popolazione, status di potere
  fred_commodities.csv   FRED/FMI: petrolio Brent, indice dei prezzi alimentari, grano (mensili, globali)
  leaders_wikidata.csv   Wikidata: capi di stato e di governo in carica con data di nascita
  un_sanctions.csv       Consiglio di sicurezza ONU: lista consolidata, una riga per persona/entita' con regime e data di inserimento
  peacekeeping.csv       ONU DPO (HDX): personale uniformato (truppe, polizia, osservatori) per paese ospite e mese, 1990-oggi
  term_limits.csv        Fails & Richardson (Harvard Dataverse): tentativi di aggirare i limiti di mandato presidenziali, paese-anno fino al 2020
  wdi_stress.csv         Banca Mondiale: riserve in mesi di importazioni, servizio del debito, saldo corrente, debito pubblico (annuali)

Uso:  python pipeline/fetch_extensions.py
"""
from __future__ import annotations

import csv
import io
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "extensions"
UA = "Praevex/1.0 (research pipeline; +https://github.com/Thefariseo/ToolCoup)"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
WDI = {"MS.MIL.XPND.GD.ZS": "milex_gdp", "MS.MIL.TOTL.P1": "armed_forces", "MS.MIL.MPRT.KD": "arms_imports"}
WDI_STRESS = {"FI.RES.TOTL.MO": "reserves_months", "DT.TDS.DECT.EX.ZS": "debt_service_exports", "BN.CAB.XOKA.GD.ZS": "current_account_gdp", "GC.DOD.TOTL.GD.ZS": "govt_debt_gdp"}


def get(url: str, tries: int = 3) -> bytes:
    """curl di sistema (l'API della Banca Mondiale lascia in attesa urllib), con ritentativi."""
    curl = "/usr/bin/curl" if Path("/usr/bin/curl").exists() else shutil.which("curl")
    last = None
    for _ in range(tries):
        try:
            return subprocess.run([curl, "-sS", "-L", "--fail", "--max-time", "180", "-A", UA, url], check=True, capture_output=True).stdout
        except subprocess.CalledProcessError as e:
            last = e
    raise RuntimeError(f"{url}: {last}")


def _wdi_bulk(indicators: dict, out_name: str) -> None:
    """Un file CSV per indicatore dal download di massa della Banca Mondiale (l'API per-paese e' lenta e a tratti risponde 502)."""
    frames = []
    for code, name in indicators.items():
        z = zipfile.ZipFile(io.BytesIO(get(f"https://api.worldbank.org/v2/en/indicator/{code}?downloadformat=csv")))
        f = next(n for n in z.namelist() if n.startswith("API_"))
        d = pd.read_csv(z.open(f), skiprows=4)
        years = [c for c in d.columns if c.isdigit()]
        long = d.melt(id_vars=["Country Code"], value_vars=years, var_name="year", value_name=name).dropna(subset=[name])
        long["year"] = long["year"].astype(int)
        frames.append(long.rename(columns={"Country Code": "iso3"}).set_index(["iso3", "year"]))
    out = pd.concat(frames, axis=1).reset_index().sort_values(["iso3", "year"])
    out.to_csv(OUT / out_name, index=False)
    print(f"  {out_name}: {len(out)} paese-anni")


def fetch_wdi_military() -> None:
    _wdi_bulk(WDI, "wdi_military.csv")


def fetch_wdi_stress() -> None:
    _wdi_bulk(WDI_STRESS, "wdi_stress.csv")


def fetch_un_sanctions() -> None:
    """Lista consolidata del Consiglio di sicurezza: il codice di riferimento (CDi, CFi, GBi...) indica il regime, LISTED_ON la data."""
    import re
    import xml.etree.ElementTree as ET
    root = ET.fromstring(get("https://scsanctions.un.org/resources/xml/en/consolidated.xml"))
    rows = []
    for kind in ("INDIVIDUAL", "ENTITY"):
        for e in root.iter(kind):
            ref = e.findtext("REFERENCE_NUMBER") or ""
            rows.append({"kind": kind.lower(), "ref": ref, "prefix": re.match(r"[A-Za-z]+", ref).group(0)[:2].upper() if ref else "", "regime": e.findtext("UN_LIST_TYPE"), "listed_on": e.findtext("LISTED_ON")})
    pd.DataFrame(rows).to_csv(OUT / "un_sanctions.csv", index=False)
    print(f"  un_sanctions.csv: {len(rows)} voci, generata il {root.attrib.get('dateGenerated', '')[:10]}")


PK_HOST_POST = {"BINUH": "HTI", "BNUB": "BDI", "MINUJUSTH": "HTI", "MINUSCA": "CAF", "MINUSMA": "MLI", "MONUSCO": "COD", "UNIOGBIS": "GNB", "UNITAMS": "SDN",
                "UNMC": "COL", "UNMHA": "YEM", "UNMISS": "SSD", "UNSMIL": "LBY", "UNSMIS": "SYR", "UNSOM": "SOM", "UNSOS": "SOM", "UNTMIS": "SOM", "UNVMC": "COL"}


def fetch_peacekeeping() -> None:
    """Personale uniformato ONU (truppe, polizia, osservatori, esperti) per paese ospite e mese: 1990-2009 dal dataset storico (porta gia' il paese ospite),
    dal 2010 dal dataset per contributore e missione (il paese ospite si ricava dalla missione). Fonte: ONU DPO tramite HDX."""
    def csv_of(pkg: str) -> pd.DataFrame:
        meta = json.loads(get(f"https://data.humdata.org/api/3/action/package_show?id={pkg}"))["result"]
        return pd.read_csv(io.BytesIO(get(meta["resources"][0]["url"])), low_memory=False)
    pre = csv_of("dppadpo-ucpre2010")
    # nei file piu' vecchi "Civilian_Police" ripete "Individual_Police" e "Observers" ripete "Experts_on_Mission": si prende il maggiore, non la somma
    tot = (pre["Troops"].fillna(0) + pre["Formed_Police_Units"].fillna(0) + pre[["Individual_Police", "Civilian_Police"]].fillna(0).max(axis=1)
           + pre[["Experts_on_Mission", "Observers"]].fillna(0).max(axis=1))
    a = pd.DataFrame({"host_iso3": pre["Mission_Country_ISO-3"], "mission": pre["Mission"], "month": pre["Date"].str[:7], "personnel": tot})
    host = pre.drop_duplicates("Mission").set_index("Mission")["Mission_Country_ISO-3"].to_dict() | PK_HOST_POST
    post = csv_of("peacekeeping-uniformed-contributions-by-gender")
    post["personnel"] = post["male_personnel"].fillna(0) + post["female_personnel"].fillna(0)
    b = pd.DataFrame({"host_iso3": post["mission_acronym"].map(host), "mission": post["mission_acronym"], "month": post["last_reporting_date"].str[:7], "personnel": post["personnel"]})
    out = pd.concat([a, b], ignore_index=True).dropna(subset=["host_iso3"])
    out = out[out["month"] < "2010-01"].groupby(["host_iso3", "month"], as_index=False)["personnel"].sum().pipe(
        lambda pre_: pd.concat([pre_, out[out["month"] >= "2010-01"].groupby(["host_iso3", "month"], as_index=False)["personnel"].sum()], ignore_index=True))
    out.sort_values(["host_iso3", "month"]).to_csv(OUT / "peacekeeping.csv", index=False)
    print(f"  peacekeeping.csv: {len(out)} paese-mesi, {out['host_iso3'].nunique()} paesi ospiti, {out['month'].min()} - {out['month'].max()}")


def fetch_term_limits() -> None:
    """Fails & Richardson (Harvard Dataverse doi:10.7910/DVN/5NCYEO): paese-anno, tentativi di eludere i limiti di mandato fino al 2020."""
    df = pd.read_csv(io.BytesIO(get("https://dataverse.harvard.edu/api/access/datafile/13402866")), sep="\t", low_memory=False)
    keep = [c for c in ("country", "countryisocode", "ccode", "year", "Presidential", "reelect", "attempt", "attempt_new", "dv_type", "dv_method") if c in df.columns]
    df[keep].to_csv(OUT / "term_limits.csv", index=False)
    print(f"  term_limits.csv: {len(df)} paese-anni, fino al {int(df['year'].max())}")


def _fao(zip_name: str, keep: dict[str, str], out_name: str, col: str = "Item") -> None:
    z = zipfile.ZipFile(io.BytesIO(get(f"https://bulks-faostat.fao.org/production/{zip_name}")))
    name = next(n for n in z.namelist() if n.endswith("NOFLAG.csv"))
    df = pd.read_csv(z.open(name), encoding="latin-1", low_memory=False)
    df = df[df[col].isin(keep)].copy()
    ycols = [c for c in df.columns if c.startswith("Y") and c[1:].isdigit()]
    df["Item"] = df[col]
    long = df.melt(id_vars=["Area", "Item", "Months"], value_vars=ycols, var_name="year", value_name="value").dropna(subset=["value"])
    long = long[long["Months"].isin(MONTHS)]
    long["year"] = long["year"].str[1:].astype(int)
    long["month"] = long["Months"].map({m: i + 1 for i, m in enumerate(MONTHS)})
    long["series"] = long["Item"].map(keep)
    long[["Area", "series", "year", "month", "value"]].rename(columns={"Area": "area"}).to_csv(OUT / out_name, index=False)
    print(f"  {out_name}: {len(long)} osservazioni, {long['Area'].nunique()} aree")


def fetch_fao() -> None:
    _fao("ConsumerPriceIndices_E_All_Data.zip", {"Consumer Prices, General Indices (2015 = 100)": "cpi", "Consumer Prices, Food Indices (2015 = 100)": "food_cpi"}, "fao_cpi.csv")
    _fao("Exchange_rate_E_All_Data.zip", {"Local currency units per USD": "fx"}, "fao_fx.csv", col="Element")


def fetch_epr() -> None:
    (OUT / "epr.csv").write_bytes(get("https://icr.ethz.ch/data/epr/core/EPR-2021.csv"))
    print("  epr.csv scaricato")


def fetch_fred() -> None:
    frames = []
    for sid, name in (("POILBREUSDM", "brent"), ("PFOODINDEXM", "food_index"), ("PWHEAMTUSDM", "wheat")):
        df = pd.read_csv(io.BytesIO(get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}")))
        df.columns = ["date", name]; df[name] = pd.to_numeric(df[name], errors="coerce")
        frames.append(df.set_index("date"))
    pd.concat(frames, axis=1).reset_index().to_csv(OUT / "fred_commodities.csv", index=False)
    print("  fred_commodities.csv scritto")


LEADERS_Q = """SELECT ?c ?cLabel ?iso3 ?hosLabel ?hosBirth ?hogLabel ?hogBirth WHERE {
  ?c wdt:P31 wd:Q3624078 . OPTIONAL { ?c wdt:P298 ?iso3 }
  OPTIONAL { ?c wdt:P35 ?hos . ?hos wdt:P569 ?hosBirth }
  OPTIONAL { ?c wdt:P6 ?hog . ?hog wdt:P569 ?hogBirth }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }"""


def fetch_leaders() -> None:
    import urllib.parse
    raw = get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(LEADERS_Q))
    rows = json.loads(raw)["results"]["bindings"]
    with open(OUT / "leaders_wikidata.csv", "w", newline="") as fh:
        w = csv.writer(fh); w.writerow(["country", "iso3", "head_of_state", "hos_birth", "head_of_government", "hog_birth"])
        for r in rows:
            g = lambda k: r.get(k, {}).get("value", "")
            w.writerow([g("cLabel"), g("iso3"), g("hosLabel"), g("hosBirth")[:10], g("hogLabel"), g("hogBirth")[:10]])
    print(f"  leaders_wikidata.csv: {len(rows)} righe")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for fn in (fetch_wdi_military, fetch_wdi_stress, fetch_fao, fetch_epr, fetch_fred, fetch_leaders, fetch_un_sanctions, fetch_peacekeeping, fetch_term_limits):
        try:
            fn()
        except Exception as e:                       # una fonte non raggiungibile non ferma le altre
            print(f"  {fn.__name__}: NON disponibile ora ({str(e)[:140]})", file=sys.stderr)


if __name__ == "__main__":
    main()
