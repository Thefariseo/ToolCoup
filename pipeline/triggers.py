"""Segnali di innesco: precursori specifici di un golpe letti nel testo degli eventi ACLED.

I conteggi mensili (quante proteste, quanta violenza) non migliorano la previsione. Qui si prova una
cosa diversa: riconoscere nel campo descrittivo degli eventi i fatti che la letteratura indica come
anticamera di un golpe, e contarli per paese e mese.

  plot      complotti e tentativi sventati: arresti per "coup plot", "foiled coup", piani per rovesciare
  rumor     voci, timori e minacce di golpe o di intervento dei militari
  purge     rimozioni e rimpasti ai vertici militari e della sicurezza
  officers  arresti di ufficiali e militari
  mutiny    ammutinamenti (testo o attore "Mutiny of ...")
  emergency stato d'emergenza, legge marziale, scioglimento del parlamento, costituzione sospesa
  succession crisi al vertice: morte o malattia del capo di stato, dimissioni, impeachment, terzo mandato

Le regole sono espressioni regolari volutamente semplici e leggibili: ogni categoria si puo' controllare
a mano con `python pipeline/triggers.py --sample purge`. Il testo ACLED e' in inglese.

Ogni variabile del modello e' la somma dei sei mesi fino a t compreso (log1p), quindi usa solo eventi
gia' avvenuti. Restano mancanti fuori dalla copertura ACLED del paese.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
TEXT_DIR = ROOT / "data" / "raw" / "acled_text"

BRASS = (r"(?:army chief|chief of (?:the )?(?:army|defen[cs]e|general|military|naval|air) staff|chief of staff|generals?\b|"
         r"commander|defen[cs]e minister|minister of defen[cs]e|military (?:leadership|chief|leaders?|command)|"
         r"(?:security|intelligence|police) chief|presidential guard|republican guard|senior officers?|top brass|joint chiefs)")
RULES = {
    "plot": (r"(?:coup|putsch)[ -]?(?:plot|attempt|bid)|(?:plot|plan|conspir|attempt|prepar)\w*(?: \w+){0,3} (?:coup|putsch)|"
             r"(?:foil|thwart|abort|fail)\w*(?: \w+){0,2} (?:coup|putsch)|alleged(?: \w+)? (?:coup|putsch)|"
             r"(?:plot|conspir|attempt|plan)\w* to (?:overthrow|topple|oust|unseat|depose)|"
             r"(?:overthrow|topple|oust|depose)\w*(?: \w+){0,2} (?:the )?(?:government|president|regime|head of state)"),
    "rumor": (r"(?:rumou?rs?|fears?|warn\w*|threat\w*|speculation|call\w*|urg\w*|demand\w*)(?: \w+){0,4} "
              r"(?:coup|putsch|military (?:takeover|intervention|rule)|army (?:to )?(?:take|seize|step in))"),
    "purge": (rf"(?:dismiss|sack|fire[sd]\b|remov|replac|reshuffl|purg|reliev|oust|retire[sd]\b|forced (?:into )?retire)\w*"
              rf"(?:[^.]{{0,70}}?){BRASS}|{BRASS}(?:[^.]{{0,50}}?)(?:was|were|has been|have been) "
              r"(?:dismiss|sack|fire|remov|replac|reliev|oust|purg)\w*"),
    "officers": (r"(?:arrest|detain|apprehend|court[- ]martial)\w*(?:[^.]{0,60}?)"
                 r"(?:officers?\b|soldiers?\b|generals?\b|colonels?\b|majors?\b|captains?\b|military personnel|servicemen|troops)"),
    "mutiny": r"mutin",
    "emergency": (r"state of (?:emergency|siege|exception)|martial law|"
                  r"dissol\w+(?: \w+){0,3} (?:parliament|national assembly|government|cabinet|legislature)|"
                  r"suspend\w*(?: \w+){0,3} constitution|constitution(?: \w+){0,2} suspended"),
    "succession": (r"(?:president|head of state|prime minister|king|emir|supreme leader)(?:[^.]{0,40}?)"
                   r"(?:died|dies|death|passed away|hospitali[sz]ed|ill health|incapacitat|resign|stepp?\w* down|impeach)|"
                   r"impeach\w*|no[- ]confidence|third term|term limits?|succession"),
}
COMPILED = {k: re.compile(v, re.I) for k, v in RULES.items()}
NAMES = list(RULES)
FEATURES = [f"g_{k}_6m" for k in NAMES] + ["g_any_6m"]
LABELS = {"g_plot_6m": "Complotti e golpe sventati (6 mesi)", "g_rumor_6m": "Voci e minacce di golpe (6 mesi)",
          "g_purge_6m": "Epurazioni ai vertici militari (6 mesi)", "g_officers_6m": "Arresti di militari (6 mesi)",
          "g_mutiny_6m": "Ammutinamenti (6 mesi)", "g_emergency_6m": "Stato d'emergenza o parlamento sciolto (6 mesi)",
          "g_succession_6m": "Crisi al vertice dello stato (6 mesi)", "g_any_6m": "Segnali di innesco, totale (6 mesi)"}


def load_text() -> pd.DataFrame:
    files = sorted(TEXT_DIR.glob("acled_text_*.csv"))
    if not files:
        raise SystemExit("Manca data/raw/acled_text/: esegui prima pipeline/fetch_acled_text.py")
    d = pd.concat((pd.read_csv(f, dtype=str, keep_default_na=False) for f in files), ignore_index=True)
    d = d.drop_duplicates("event_id_cnty")
    # stesso perimetro per tutti gli anni, qualunque fosse il filtro usato al momento del download
    keep = (d["event_type"].eq("Strategic developments") | d["notes"].str.contains("coup|mutin|overthrow", case=False)
            | d["actor1"].str.contains("Mutiny") | d["actor2"].str.contains("Mutiny"))
    d = d[keep]
    date = pd.to_datetime(d["event_date"], errors="coerce")
    d["t"] = date.dt.year * 12 + date.dt.month - 1
    return d.dropna(subset=["t"]).astype({"t": int})


def classify(d: pd.DataFrame) -> pd.DataFrame:
    notes = d["notes"].fillna("")
    out = pd.DataFrame({k: notes.str.contains(rx) for k, rx in COMPILED.items()}, index=d.index)
    out["mutiny"] |= d["actor1"].str.contains("Mutiny", na=False) | d["actor2"].str.contains("Mutiny", na=False)
    # "officers" vale solo se ad arrestare e' lo stato: un gruppo armato che cattura soldati e' un'altra cosa
    out["officers"] &= d["actor1"].str.contains(r"Military Forces|Police Forces|Government", na=False)
    return out


def monthly() -> pd.DataFrame:
    """Conteggi per (country, t) di ogni categoria."""
    d = load_text()
    flags = classify(d)
    m = pd.concat([d[["country", "t"]], flags.astype(int)], axis=1).groupby(["country", "t"], as_index=False)[NAMES].sum()
    m["any"] = m[NAMES].sum(axis=1)
    return m


def features(counts: pd.DataFrame, grid: pd.DataFrame) -> pd.DataFrame:
    """grid: tutte le righe (country, t) coperte da ACLED. Restituisce grid + variabili g_*."""
    g = grid[["country", "t"]].merge(counts, on=["country", "t"], how="left").fillna(0).sort_values(["country", "t"])
    by = g.groupby("country", sort=False)
    for k in NAMES + ["any"]:
        g[f"g_{k}_6m"] = np.log1p(by[k].transform(lambda x: x.rolling(6, min_periods=1).sum()))
    g.loc[by.cumcount() < 5, FEATURES] = np.nan           # primi mesi di copertura: finestra incompleta
    return g[["country", "t"] + FEATURES]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", choices=NAMES, help="stampa esempi di testo riconosciuti per una categoria")
    ap.add_argument("-n", type=int, default=15)
    args = ap.parse_args()
    d = load_text()
    flags = classify(d)
    if args.sample:
        hit = d[flags[args.sample]]
        for r in hit.sample(min(args.n, len(hit)), random_state=1).itertuples():
            print(f"[{r.event_date} {r.country}] {r.notes[:300]}\n")
        return
    print(f"{len(d):,} eventi con testo, {d['country'].nunique()} paesi, {d['event_date'].min()} → {d['event_date'].max()}")
    for k in NAMES:
        print(f"  {k:10s} {int(flags[k].sum()):7,d} eventi  {d.loc[flags[k], 'country'].nunique():4d} paesi")


if __name__ == "__main__":
    main()
