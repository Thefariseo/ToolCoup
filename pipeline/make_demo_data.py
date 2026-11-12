"""Genera dati SINTETICI nei formati ACLED e Powell & Thyne.

Serve solo a provare pipeline e sito prima di avere i dati veri.
I numeri prodotti non hanno alcun significato reale.

Uso:  python pipeline/make_demo_data.py
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT_ACLED = ROOT / "data" / "demo" / "acled"
OUT_COUPS = ROOT / "data" / "demo" / "coups"

# (nome ACLED, nome stile Powell & Thyne, ISO numerico, regione, inizio copertura, fragilita')
COUNTRIES = [
    ("Mali", "Mali", 466, "Western Africa", 1997, 1.3),
    ("Burkina Faso", "Burkina Faso", 854, "Western Africa", 1997, 1.3),
    ("Niger", "Niger", 562, "Western Africa", 1997, 1.2),
    ("Guinea", "Guinea", 324, "Western Africa", 1997, 1.1),
    ("Guinea-Bissau", "Guinea-Bissau", 624, "Western Africa", 1997, 1.4),
    ("Nigeria", "Nigeria", 566, "Western Africa", 1997, 0.3),
    ("Ghana", "Ghana", 288, "Western Africa", 1997, -0.6),
    ("Senegal", "Senegal", 686, "Western Africa", 1997, -0.6),
    ("Ivory Coast", "Ivory Coast", 384, "Western Africa", 1997, 0.6),
    ("Sierra Leone", "Sierra Leone", 694, "Western Africa", 1997, 0.7),
    ("Chad", "Chad", 148, "Middle Africa", 1997, 1.2),
    ("Gabon", "Gabon", 266, "Middle Africa", 1997, 0.5),
    ("Cameroon", "Cameroon", 120, "Middle Africa", 1997, 0.1),
    ("Democratic Republic of Congo", "DR Congo", 180, "Middle Africa", 1997, 0.8),
    ("Central African Republic", "Central African Republic", 140, "Middle Africa", 1997, 1.2),
    ("Sudan", "Sudan", 729, "Northern Africa", 1997, 1.4),
    ("Egypt", "Egypt", 818, "Northern Africa", 1997, 0.4),
    ("Tunisia", "Tunisia", 788, "Northern Africa", 1997, 0.0),
    ("Libya", "Libya", 434, "Northern Africa", 1997, 0.7),
    ("Algeria", "Algeria", 12, "Northern Africa", 1997, -0.2),
    ("Ethiopia", "Ethiopia", 231, "Eastern Africa", 1997, 0.4),
    ("Kenya", "Kenya", 404, "Eastern Africa", 1997, -0.3),
    ("Burundi", "Burundi", 108, "Eastern Africa", 1997, 0.9),
    ("Madagascar", "Madagascar", 450, "Eastern Africa", 1997, 0.8),
    ("Zimbabwe", "Zimbabwe", 716, "Southern Africa", 1997, 0.4),
    ("South Africa", "South Africa", 710, "Southern Africa", 1997, -1.0),
    ("Myanmar", "Burma", 104, "Southeast Asia", 2010, 1.0),
    ("Thailand", "Thailand", 764, "Southeast Asia", 2010, 0.8),
    ("Philippines", "Philippines", 608, "Southeast Asia", 2016, 0.0),
    ("Indonesia", "Indonesia", 360, "Southeast Asia", 2015, -0.8),
    ("Pakistan", "Pakistan", 586, "South Asia", 2010, 0.5),
    ("Bangladesh", "Bangladesh", 50, "South Asia", 2010, 0.4),
    ("India", "India", 356, "South Asia", 2016, -1.2),
    ("Turkey", "Turkey", 792, "Middle East", 2016, 0.4),
    ("Iraq", "Iraq", 368, "Middle East", 2016, 0.3),
    ("Yemen", "Yemen", 887, "Middle East", 2015, 0.8),
    ("Venezuela", "Venezuela", 862, "South America", 2018, 0.7),
    ("Bolivia", "Bolivia", 68, "South America", 2018, 0.7),
    ("Peru", "Peru", 604, "South America", 2018, 0.3),
    ("Brazil", "Brazil", 76, "South America", 2018, -0.5),
    ("Honduras", "Honduras", 340, "Central America", 2018, 0.4),
    ("Haiti", "Haiti", 332, "Caribbean", 2018, 0.8),
    ("Ukraine", "Ukraine", 804, "Europe", 2018, -0.3),
    ("Russia", "Russia", 643, "Europe", 2018, -0.2),
    ("Armenia", "Armenia", 51, "Caucasus and Central Asia", 2018, 0.2),
    ("Kyrgyzstan", "Kyrgyzstan", 417, "Caucasus and Central Asia", 2018, 0.6),
    ("France", "France", 250, "Europe", 2020, -2.5),
    ("Italy", "Italy", 380, "Europe", 2020, -2.5),
    ("United States", "United States of America", 840, "North America", 2020, -2.5),
]

END = pd.Period("2026-10", "M")

# tipo evento, sotto-tipo, inter1, inter2, media base, sensibilita' all'instabilita'
EVENT_KINDS = [
    ("Protests", "Peaceful protest", "Protesters", "", 6.0, 0.35),
    ("Protests", "Protest with intervention", "Protesters", "State forces", 0.8, 0.6),
    ("Protests", "Excessive force against protesters", "Protesters", "State forces", 0.15, 0.9),
    ("Riots", "Violent demonstration", "Rioters", "State forces", 1.2, 0.6),
    ("Riots", "Mob violence", "Rioters", "Civilians", 0.8, 0.2),
    ("Battles", "Armed clash", "State forces", "Rebel group", 2.0, 0.3),
    ("Battles", "Armed clash", "State forces", "State forces", 0.05, 1.3),
    ("Explosions/Remote violence", "Remote explosive/landmine/IED", "Rebel group", "State forces", 0.8, 0.2),
    ("Violence against civilians", "Attack", "State forces", "Civilians", 0.5, 0.5),
    ("Violence against civilians", "Attack", "Political militia", "Civilians", 1.0, 0.2),
    ("Strategic developments", "Arrests", "State forces", "Civilians", 0.3, 0.8),
    ("Strategic developments", "Change to group/activity", "State forces", "", 0.3, 0.5),
]


def main(seed: int = 7) -> None:
    rng = np.random.default_rng(seed)
    OUT_ACLED.mkdir(parents=True, exist_ok=True)
    OUT_COUPS.mkdir(parents=True, exist_ok=True)

    rows, coups = [], []
    eid = 0
    for name, pt_name, iso, region, start_year, frag in COUNTRIES:
        # golpe "storici" 1950 -> inizio copertura
        for year in range(1950, start_year):
            if rng.random() < 0.012 * np.exp(0.9 * frag):
                coups.append((pt_name, year, int(rng.integers(1, 13)), int(rng.integers(1, 28)),
                              int(rng.integers(1, 3))))
        months = pd.period_range(f"{start_year}-01", END, freq="M")
        s, cooldown, scale = 0.0, 0, float(np.exp(rng.normal(0, 0.6)))
        for m in months:
            s = 0.93 * s + rng.normal(0, 0.38)
            recent = 1.0 if cooldown > 0 else 0.0
            cooldown = max(0, cooldown - 1)
            hazard = 1 / (1 + np.exp(-(-7.6 + 0.9 * frag + 1.5 * s + 1.0 * recent)))
            coup = cooldown < 30 and rng.random() < hazard
            if coup:
                coups.append((pt_name, m.year, m.month, int(rng.integers(1, 28)),
                              2 if rng.random() < 0.5 else 1))
                cooldown = 36
            for etype, sub, i1, i2, base, sens in EVENT_KINDS:
                lam = min(base * scale * np.exp(sens * s + 0.25 * frag), 60.0)
                if coup and i1 == "State forces" and i2 == "State forces":
                    lam += 2.0
                n = int(rng.poisson(lam))
                for _ in range(n):
                    eid += 1
                    day = int(rng.integers(1, m.days_in_month + 1))
                    fat = int(rng.poisson(1.5)) if etype in ("Battles", "Violence against civilians",
                                                             "Explosions/Remote violence") else 0
                    rows.append((f"DEMO{eid}", f"{m.year}-{m.month:02d}-{day:02d}", m.year, etype, sub,
                                 "Demo actor 1", i1, "Demo actor 2", i2, iso, region, name, fat))
            if coup:
                s = min(s + 0.6, 3.0)  # strascico di instabilita' dopo il golpe
            s = float(np.clip(s, -3.0, 3.0))

    cols = ["event_id_cnty", "event_date", "year", "event_type", "sub_event_type", "actor1", "inter1",
            "actor2", "inter2", "iso", "region", "country", "fatalities"]
    pd.DataFrame(rows, columns=cols).to_csv(OUT_ACLED / "acled_demo.csv", index=False)

    cdf = pd.DataFrame(coups, columns=["country", "year", "month", "day", "coup"])
    cdf.insert(1, "ccode", 0)
    cdf["version"] = "DEMO"
    cdf.sort_values(["year", "month", "day"]).to_csv(
        OUT_COUPS / "powell_thyne_coups_final.txt", sep="\t", index=False)
    print(f"Demo: {len(rows):,} eventi sintetici, {len(cdf)} golpe sintetici "
          f"({(cdf.year >= 1997).sum()} dal 1997)")


if __name__ == "__main__":
    main()
