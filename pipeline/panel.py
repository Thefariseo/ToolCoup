"""Panel lungo paese-mese (1950-oggi) per il modello di previsione.

Unita': paesi V-Dem (codice Correlates of War) piu' i territori coperti solo da ACLED.
Ogni riga descrive cio' che si sapeva alla fine del mese t; il target e' un tentativo di golpe
nei mesi t+1..t+H. Tutte le variabili rispettano i tempi di pubblicazione delle fonti:
gli indicatori annuali V-Dem dell'anno Y entrano da aprile di Y+1, quelli della Banca Mondiale
da luglio di Y+1.

Gruppi di variabili (dalla letteratura sulla previsione dei golpe):
  storia      "trappola dei golpe": tempo dall'ultimo tentativo, frequenza passata (Londregan & Poole)
  contagio    tentativi recenti nella regione e nel mondo
  regime      tipo e solidita' del regime, ruolo dei militari, vincoli sull'esecutivo
  leader      durata in carica del capo di stato, avvicendamenti, elezioni (CoupCast/REIGN)
  economia    reddito, crescita, mortalita' infantile, rendite petrolifere (Gassebner et al.)
  piazza      mobilitazione e violenza politica annuali (V-Dem)
  acled       segnali mensili di proteste, violenza e fratture nell'apparato statale
"""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

from countries import COUNTRIES, canon_code, code_exact, code_from_name, name_of

ROOT = Path(__file__).resolve().parents[1]
STRUCT = ROOT / "data" / "raw" / "structural"
START = 1950 * 12            # primo mese del panel
NEVER = 600                  # mesi "dall'ultimo golpe" quando non ce n'e' mai stato uno (50 anni)

ACLED_REGION = {             # regione ACLED -> macroregione V-Dem (e_regionpol_6C)
    "Europe": 5, "North America": 5, "Oceania": 6, "East Asia": 6, "Southeast Asia": 6, "South Asia": 6,
    "Caucasus and Central Asia": 1, "Middle East": 3, "Northern Africa": 3, "Western Africa": 4,
    "Middle Africa": 4, "Eastern Africa": 4, "Southern Africa": 4, "South America": 2,
    "Central America": 2, "Caribbean": 2, "Antarctica": 6,
}
REGION_NAMES = {1: "Europa orientale e Asia centrale", 2: "America Latina e Caraibi",
                3: "Medio Oriente e Nord Africa", 4: "Africa subsahariana",
                5: "Europa occidentale e Nord America", 6: "Asia e Pacifico"}

VDEM_LEVELS = ["v2x_polyarchy", "v2x_libdem", "v2x_regime", "v2x_ex_military", "v2x_ex_hereditary",
               "v2x_ex_party", "v2x_civlib", "v2x_clphy", "v2xcs_ccsi", "v2x_corr", "v2x_rule", "v2x_neopat",
               "v2x_accountability", "v2x_jucon", "v2xlg_legcon", "v2exrescon", "v2svstterr", "v2stfisccap",
               "v2pepwrsoc", "v2cademmob", "v2caautmob", "v2caviol", "v2x_elecreg"]

GROUPS = {
    "storia": ["h_since_attempt", "h_since_success", "h_att_12m", "h_att_5y", "h_att_10y", "h_att_20y",
               "h_succ_10y", "h_att_all", "h_cs1", "h_cs2", "h_cs3"],
    "contagio": ["c_region_12m", "c_region_36m", "c_global_12m"],
    "regime": ["v2x_polyarchy", "r_poly_sq", "r_closed", "r_elect_aut", "r_elect_dem", "v2x_ex_military",
               "v2x_ex_hereditary", "v2x_ex_party", "r_dpoly_3y", "r_regime_age", "v2x_neopat",
               "v2x_accountability", "v2x_jucon", "v2xlg_legcon", "v2exrescon", "v2x_civlib", "v2x_rule",
               "v2x_corr", "v2svstterr", "v2stfisccap", "v2pepwrsoc", "v2x_elecreg"],
    "leader": ["l_tenure", "l_new_leader", "l_election_lag"],
    "economia": ["e_log_gdppc", "e_growth", "e_growth_3y", "e_log_infmort", "e_log_pop", "e_oil", "e_inflation"],
    "piazza": ["v2cademmob", "v2caautmob", "v2caviol", "v2x_clphy", "v2xcs_ccsi"],
    "acled": ["a_unrest_surge", "a_violence_surge", "a_fatal_surge", "a_infighting", "a_repression_share"],
    "tempo": ["t_trend", "t_post_cold_war"],
}
GROUP_LABELS = {"storia": "Storia golpista", "contagio": "Contagio regionale e globale", "regime": "Tipo e solidità del regime",
                "leader": "Leader ed elezioni", "economia": "Economia e sviluppo",
                "piazza": "Mobilitazione e violenza politica", "acled": "Segnali mensili ACLED",
                "tempo": "Tendenza storica"}
FEATURE_LABELS = {
    "h_since_attempt": "Tempo dall'ultimo tentativo di golpe", "h_since_success": "Tempo dall'ultimo golpe riuscito",
    "h_att_12m": "Tentativi negli ultimi 12 mesi", "h_att_5y": "Tentativi negli ultimi 5 anni",
    "h_att_10y": "Tentativi negli ultimi 10 anni", "h_att_20y": "Tentativi negli ultimi 20 anni",
    "h_succ_10y": "Golpe riusciti negli ultimi 10 anni", "h_att_all": "Tentativi dal 1900",
    "h_cs1": "Tempo dall'ultimo tentativo (curva)", "h_cs2": "Tempo dall'ultimo tentativo (curva)",
    "h_cs3": "Tempo dall'ultimo tentativo (curva)",
    "c_region_12m": "Golpe nella regione (12 mesi)", "c_region_36m": "Golpe nella regione (3 anni)",
    "c_global_12m": "Golpe nel mondo (12 mesi)",
    "v2x_polyarchy": "Livello di democrazia", "r_poly_sq": "Regime ibrido", "r_closed": "Autocrazia chiusa",
    "r_elect_aut": "Autocrazia elettorale", "r_elect_dem": "Democrazia elettorale",
    "v2x_ex_military": "Peso dei militari nel governo", "v2x_ex_hereditary": "Potere ereditario",
    "v2x_ex_party": "Potere del partito dominante", "r_dpoly_3y": "Variazione della democrazia in 3 anni",
    "r_regime_age": "Età del regime", "v2x_neopat": "Neopatrimonialismo", "v2x_accountability": "Responsabilità del governo",
    "v2x_jucon": "Vincoli giudiziari", "v2xlg_legcon": "Vincoli parlamentari", "v2exrescon": "Rispetto della costituzione",
    "v2x_civlib": "Libertà civili", "v2x_rule": "Stato di diritto", "v2x_corr": "Corruzione",
    "v2svstterr": "Controllo del territorio", "v2stfisccap": "Capacità fiscale", "v2pepwrsoc": "Distribuzione del potere",
    "v2x_elecreg": "Regime con elezioni",
    "l_tenure": "Anni in carica del capo di stato", "l_new_leader": "Capo di stato insediato da poco",
    "l_election_lag": "Elezioni nazionali nell'ultimo anno",
    "e_log_gdppc": "Reddito pro capite", "e_growth": "Crescita economica", "e_growth_3y": "Crescita media in 3 anni",
    "e_log_infmort": "Mortalità infantile", "e_log_pop": "Popolazione", "e_oil": "Rendite petrolifere",
    "e_inflation": "Inflazione",
    "v2cademmob": "Mobilitazione per la democrazia", "v2caautmob": "Mobilitazione per l'autocrazia",
    "v2caviol": "Violenza politica", "v2x_clphy": "Integrità fisica dei cittadini", "v2xcs_ccsi": "Forza della società civile",
    "a_unrest_surge": "Impennata di proteste e disordini", "a_violence_surge": "Impennata di violenza armata",
    "a_fatal_surge": "Impennata di vittime", "a_infighting": "Scontri recenti tra forze statali",
    "a_repression_share": "Quota di proteste represse",
    "t_trend": "Tendenza di lungo periodo", "t_post_cold_war": "Dopo la guerra fredda",
}
ALL_FEATURES = [f for g in GROUPS.values() for f in g]


# ------------------------------------------------------------------ covariate annuali
def load_country_years() -> pd.DataFrame:
    """V-Dem + Banca Mondiale, una riga per (ccode, anno) con le variabili gia' trasformate."""
    v = pd.read_csv(STRUCT / "vdem_structural.csv", low_memory=False)
    v["ccode"] = [canon_code(c) if c == c else code_from_name(n) for c, n in zip(v["COWcode"], v["country_name"])]
    v = v.dropna(subset=["ccode"]).copy()
    v["ccode"] = v["ccode"].astype(int)
    v = v.sort_values(["ccode", "year", "v2x_polyarchy"]).drop_duplicates(["ccode", "year"], keep="last")

    wdi_path = STRUCT / "wdi.csv"
    if wdi_path.exists():
        w = pd.read_csv(wdi_path)
        iso = v.dropna(subset=["country_text_id"]).drop_duplicates("ccode", keep="last").drop_duplicates("country_text_id", keep="last").set_index("country_text_id")["ccode"]
        w["ccode"] = w["iso3"].map(iso)
        w = w.dropna(subset=["ccode"]).astype({"ccode": int}).drop(columns="iso3")
        v = v.merge(w, on=["ccode", "year"], how="outer").sort_values(["ccode", "year"])
        v["vdem_row"] = v["v2x_polyarchy"].notna()
    else:
        for c in ("gdppc", "gdp_growth", "infant_mortality", "population", "oil_rents", "inflation"):
            v[c] = np.nan
        v["vdem_row"] = True
    g = v.groupby("ccode", sort=False)

    # --- regime
    v["r_poly_sq"] = v["v2x_polyarchy"] * (1 - v["v2x_polyarchy"]) * 4          # massimo nei regimi ibridi
    v["r_closed"] = (v["v2x_regime"] == 0).astype(float).where(v["v2x_regime"].notna())
    v["r_elect_aut"] = (v["v2x_regime"] == 1).astype(float).where(v["v2x_regime"].notna())
    v["r_elect_dem"] = (v["v2x_regime"] == 2).astype(float).where(v["v2x_regime"].notna())
    v["r_dpoly_3y"] = v["v2x_polyarchy"] - g["v2x_polyarchy"].shift(3)
    start = v["v2reginfo"].astype(str).str.extract(r"\((\d{2})/(\d{2})/(\d{4})\s*-")
    v["regime_start_t"] = pd.to_numeric(start[2], errors="coerce") * 12 + pd.to_numeric(start[1], errors="coerce") - 1

    # --- leader: anni consecutivi con lo stesso capo di stato
    name = v["v2exnamhos"].astype(str).str.strip().str.lower()
    changed = (name != g["v2exnamhos"].shift(1).astype(str).str.strip().str.lower()) | (v["year"] != g["year"].shift(1) + 1)
    run = changed.groupby(v["ccode"]).cumsum()
    v["l_tenure_years"] = v.groupby(["ccode", run]).cumcount().where(v["v2exnamhos"].notna())
    v["l_election_lag"] = v[["v2xel_elecparl", "v2xel_elecpres"]].max(axis=1)

    # --- economia: livelli storici V-Dem prolungati con i tassi della Banca Mondiale
    def extend(level: pd.Series, growth_pct: pd.Series) -> pd.Series:
        out = level.to_numpy(dtype=float).copy()
        gr = growth_pct.to_numpy(dtype=float)
        for i in range(1, len(out)):
            if np.isnan(out[i]) and not np.isnan(out[i - 1]):
                out[i] = out[i - 1] * (1 + (gr[i] if not np.isnan(gr[i]) else 0.0) / 100.0)
        return pd.Series(out, index=level.index)

    hist_growth = g["e_gdppc"].pct_change(fill_method=None) * 100
    v["e_growth"] = v["gdp_growth"].fillna(hist_growth).clip(-30, 30)
    v["gdp_level"] = pd.concat([extend(d["e_gdppc"], d["e_growth"]) for _, d in v.groupby("ccode", sort=False)])
    pop_growth = g["population"].pct_change(fill_method=None) * 100
    v["pop_level"] = pd.concat([extend(d["e_pop"], pop_growth.loc[d.index]) for _, d in v.groupby("ccode", sort=False)])
    v["e_log_gdppc"] = np.log(v["gdp_level"].clip(lower=0.05))
    v["e_growth_3y"] = v.groupby("ccode", sort=False)["e_growth"].transform(lambda s: s.rolling(3, min_periods=1).mean())
    v["e_log_infmort"] = np.log(v["infant_mortality"].clip(lower=1))
    v["e_log_pop"] = np.log(v["pop_level"].clip(lower=0.001))
    v["e_oil"] = np.log1p(v["oil_rents"].fillna(v["e_total_oil_income_pc"] / 100).clip(lower=0))
    v["e_inflation"] = np.log1p(v["inflation"].clip(lower=0, upper=500))
    # indicatori lenti pubblicati in ritardo: si usa l'ultimo valore noto (fino a 5 anni)
    slow = ["e_log_infmort", "e_oil", "e_log_pop", "e_log_gdppc"]
    v[slow] = v.groupby("ccode", sort=False)[slow].ffill(limit=5)
    return v


# ------------------------------------------------------------------ golpe
def load_events(coupdb_csv: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(eventi-target, eventi-storia): i primi sono quelli da prevedere, i secondi tutta la storia A-C."""
    db = pd.read_csv(coupdb_csv, keep_default_na=False)
    db = db[db["type"].isin(["riuscito", "fallito"]) & ~db["colpus_class"].isin(["not exist", "combined"])
            & (db["possible_duplicate_of"] == "")].copy()
    d = pd.to_datetime(db["date"])
    db["t"] = d.dt.year * 12 + d.dt.month - 1
    db["success"] = db["type"].eq("riuscito")
    target = db[(db["confidence"] == "A") | db["sources"].str.contains("Powell & Thyne")]
    broad = db[db["confidence"].isin(["A", "B", "C"])]
    return target, broad


def _count(times: np.ndarray, t: np.ndarray, lo: int, hi: int = 0) -> np.ndarray:
    """Eventi nell'intervallo (t-lo, t-hi]."""
    return np.searchsorted(times, t - hi, side="right") - np.searchsorted(times, t - lo, side="right")


# ------------------------------------------------------------------ panel
def build_panel(coupdb_csv: Path, acled_monthly: pd.DataFrame, acled_info: pd.DataFrame, t_end: int,
                horizon: int) -> tuple[pd.DataFrame, dict]:
    """acled_monthly: righe (country, t, serie grezze); acled_info: indice country -> iso, region."""
    cy = load_country_years()
    target, broad = load_events(coupdb_csv)

    # ---- unita' e righe
    acled_units, taken = {}, set()
    vdem_codes = set(cy["ccode"])
    for name in acled_info.index:
        cc = code_exact(name)                       # i territori ("French Guiana") restano unita' a se'
        ok = cc in vdem_codes and cc not in taken
        acled_units[name] = cc if ok else None
        if ok:
            taken.add(cc)
    extra = {name: -(i + 1) for i, name in enumerate(n for n, c in acled_units.items() if c is None)}
    unit_of_acled = {n: (c if c is not None else extra[n]) for n, c in acled_units.items()}
    acled_name = {u: n for n, u in unit_of_acled.items()}

    vdem_years = cy[cy["vdem_row"]].groupby("ccode")["year"].agg(["min", "max"])
    rows = []
    for cc, (y0, y1) in vdem_years.iterrows():
        first = max(START, (int(y0) + 1) * 12 + 3)            # servono i dati dell'anno prima
        last = min(t_end, (int(y1) + 2) * 12 + 2)             # il paese esiste finche' V-Dem lo copre
        if last >= first:
            rows.append(pd.DataFrame({"unit": cc, "t": np.arange(first, last + 1)}))
    a_first = acled_monthly.groupby("country")["t"].min()
    for name, u in extra.items():
        rows.append(pd.DataFrame({"unit": u, "t": np.arange(int(a_first[name]), t_end + 1)}))
    p = pd.concat(rows, ignore_index=True)
    p["year"] = p["t"] // 12
    p["month"] = p["t"] % 12 + 1
    p["name"] = p["unit"].map(lambda u: acled_name.get(u) or name_of(u))

    # ---- covariate annuali, con il ritardo di pubblicazione
    p["vy"] = p["year"] - np.where(p["month"] >= 4, 1, 2)
    p["wy"] = p["year"] - np.where(p["month"] >= 7, 1, 2)
    vcols = VDEM_LEVELS + ["r_poly_sq", "r_closed", "r_elect_aut", "r_elect_dem", "r_dpoly_3y", "regime_start_t",
                           "l_tenure_years", "l_election_lag", "e_regionpol_6C"]
    wcols = ["e_log_gdppc", "e_growth", "e_growth_3y", "e_log_infmort", "e_log_pop", "e_oil", "e_inflation"]
    p = p.merge(cy[["ccode", "year"] + vcols].rename(columns={"ccode": "unit", "year": "vy"}), on=["unit", "vy"], how="left")
    p = p.merge(cy[["ccode", "year"] + wcols].rename(columns={"ccode": "unit", "year": "wy"}), on=["unit", "wy"], how="left")
    p = p.sort_values(["unit", "t"]).reset_index(drop=True)

    p["region"] = p["e_regionpol_6C"]
    reg_acled = {unit_of_acled[n]: ACLED_REGION.get(r) for n, r in acled_info["region"].items()}
    p["region"] = p.groupby("unit")["region"].transform(lambda s: s.ffill().bfill())
    p["region"] = p["region"].fillna(p["unit"].map(reg_acled))
    p["r_regime_age"] = np.log1p((p["t"] - p["regime_start_t"]).clip(lower=0) / 12.0)
    p["l_tenure"] = np.log1p(p["l_tenure_years"] + (p["t"] - (p["vy"] + 1) * 12 + 1).clip(lower=0) / 12.0)
    p["l_new_leader"] = (p["l_tenure_years"] <= 1).astype(float).where(p["l_tenure_years"].notna())
    p["t_trend"] = (p["year"] - 1990) / 10.0
    p["t_post_cold_war"] = (p["year"] >= 1990).astype(float)

    # ---- storia golpista e target
    tgt = {u: np.sort(g["t"].to_numpy()) for u, g in target.groupby("ccode")}
    suc = {u: np.sort(g["t"].to_numpy()) for u, g in target[target["success"]].groupby("ccode")}
    brd = {u: np.sort(g["t"].to_numpy()) for u, g in broad.groupby("ccode")}
    none = np.array([], dtype=int)
    cols = {k: np.zeros(len(p)) for k in ("y", "onset", "h_since_attempt", "h_since_success", "h_att_12m", "h_att_5y",
                                          "h_att_10y", "h_att_20y", "h_succ_10y", "h_att_all")}
    tt = p["t"].to_numpy()
    for u, idx in p.groupby("unit").indices.items():
        t = tt[idx]
        a, s, b = tgt.get(u, none), suc.get(u, none), brd.get(u, none)
        le = np.searchsorted(a, t, side="right")
        cols["y"][idx] = (np.searchsorted(a, t + horizon, side="right") - le) > 0
        cols["onset"][idx] = np.isin(t, a)
        for key, arr in (("h_since_attempt", b), ("h_since_success", s)):
            k = np.searchsorted(arr, t, side="right")
            since = np.where(k > 0, t - arr[np.maximum(k - 1, 0)] if len(arr) else NEVER, NEVER)
            cols[key][idx] = np.minimum(since, NEVER)
        cols["h_att_12m"][idx] = _count(b, t, 12)
        cols["h_att_5y"][idx] = _count(b, t, 60)
        cols["h_att_10y"][idx] = _count(b, t, 120)
        cols["h_att_20y"][idx] = _count(b, t, 240)
        cols["h_succ_10y"][idx] = _count(s, t, 120)
        cols["h_att_all"][idx] = np.searchsorted(b, t, side="right")
    for k, v in cols.items():
        p[k] = v
    m = p["h_since_attempt"] / 120.0                      # polinomio cubico del tempo (Carter & Signorino)
    p["h_cs1"], p["h_cs2"], p["h_cs3"] = m, m ** 2, m ** 3
    for k in ("h_since_attempt", "h_since_success"):
        p[k] = np.log1p(p[k])
    for k in ("h_att_12m", "h_att_5y", "h_att_10y", "h_att_20y", "h_succ_10y", "h_att_all"):
        p[k] = np.log1p(p[k])

    # ---- contagio: tentativi altrui nella regione e nel mondo
    unit_region = p.groupby("unit")["region"].first()
    tr = target.assign(region=target["ccode"].map(unit_region)).dropna(subset=["region"])
    reg_times = {r: np.sort(g["t"].to_numpy()) for r, g in tr.groupby("region")}
    all_times = np.sort(target["t"].to_numpy())
    c12, c36, g12 = np.zeros(len(p)), np.zeros(len(p)), np.zeros(len(p))
    for u, idx in p.groupby("unit").indices.items():
        t = tt[idx]
        own = tgt.get(u, none)
        rt = reg_times.get(unit_region.get(u), none)
        c12[idx] = _count(rt, t, 12) - _count(own, t, 12)
        c36[idx] = _count(rt, t, 36) - _count(own, t, 36)
        g12[idx] = _count(all_times, t, 12) - _count(own, t, 12)
    p["c_region_12m"], p["c_region_36m"], p["c_global_12m"] = np.log1p(c12), np.log1p(c36), np.log1p(g12)

    # ---- ACLED: scostamenti dalla norma del paese (mancanti fuori copertura)
    a = acled_monthly.copy()
    a["unit"] = a["country"].map(unit_of_acled)
    a = a.sort_values(["unit", "t"])
    a["unrest"] = a["protests"] + a["riots"]
    a["violence"] = a["battles"] + a["explosions"] + a["vac"]
    ga = a.groupby("unit", sort=False)

    def surge(col: str) -> pd.Series:
        lg = np.log1p(a[col])
        gl = lg.groupby(a["unit"], sort=False)
        recent = gl.transform(lambda x: x.rolling(3, min_periods=1).mean())
        base_m = gl.transform(lambda x: x.shift(3).rolling(24, min_periods=6).mean())
        base_s = gl.transform(lambda x: x.shift(3).rolling(24, min_periods=6).std())
        return ((recent - base_m) / (base_s + 0.5)).clip(-4, 4)

    a["a_unrest_surge"], a["a_violence_surge"], a["a_fatal_surge"] = surge("unrest"), surge("violence"), surge("fatalities")
    a["a_infighting"] = (ga["infighting"].transform(lambda x: x.rolling(6, min_periods=1).sum()) > 0).astype(float)
    rep = ga["repression"].transform(lambda x: x.rolling(12, min_periods=1).sum())
    unr = ga["unrest"].transform(lambda x: x.rolling(12, min_periods=1).sum())
    a["a_repression_share"] = rep / (unr + 5)
    a["a_age"] = ga.cumcount()
    acols = GROUPS["acled"]
    a.loc[a["a_age"] < 11, acols] = np.nan                 # primo anno di copertura: norma non ancora stimabile
    p = p.merge(a[["unit", "t"] + acols + ["unrest", "violence", "fatalities", "infighting"]], on=["unit", "t"], how="left")

    p["y_known"] = p["t"] + horizon <= t_end
    p["region_name"] = p["region"].map(REGION_NAMES)
    info = {"unit_of_acled": unit_of_acled, "n_target": int(len(target)), "n_broad": int(len(broad)),
            "target": target, "broad": broad}
    return p.sort_values(["unit", "t"]).reset_index(drop=True), info
