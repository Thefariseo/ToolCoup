"""Estensioni del pannello: variabili nuove da fonti pubbliche, in sei gruppi.

  forze     spesa militare (% PIL), forze armate ogni 1000 abitanti, spesa per soldato, importazioni di armi (Banca Mondiale/SIPRI)
  leader2   eta' del capo (Archigos fino al 2015, Wikidata per l'ultimo mese)
  stress    prezzi al consumo e alimentari, cambio, prezzo del petrolio x dipendenza petrolifera (FAOSTAT, FRED)
  etnia     quota di popolazione esclusa dal potere, quota del gruppo dominante (ETH Zurich EPR)
  esterno   sospensioni da UA/ECOWAS (data/external/suspensions.csv, dalle voci datate di Wikipedia), sanzioni del Consiglio di sicurezza (lista consolidata ONU)
  stranieri forze straniere: personale delle missioni ONU (HDX/DPO) e eventi ACLED con forze esterne; il ritiro si legge come calo sui 12 mesi
  limiti    tentativi di eludere i limiti di mandato presidenziali (Fails & Richardson, fino al 2020)
  debito    stress sovrano da fondamentali: riserve in mesi di importazioni, servizio del debito, saldo corrente, debito pubblico (Banca Mondiale)
  media     tono e quota di conflitto nelle notizie (GDELT, un giorno su sette; data/gdelt/daily_sample.csv)

Ogni variabile usa solo cio' che era pubblicato al mese t: i dati annuali con un anno di ritardo, FAOSTAT con due mesi.
Mancante resta mancante (gli alberi la gestiscono); nulla viene riempito con valori inventati.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from countries import canon_code, code_from_name

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "data" / "raw" / "extensions"
STRUCT = ROOT / "data" / "raw" / "structural"
ARCHIGOS = ROOT / "data" / "raw" / "coup_sources" / "archigos" / "Archigos_4.1_stata14.dta"
SUSPENSIONS = ROOT / "data" / "external" / "suspensions.csv"

EXT_GROUPS = {
    "forze": ["m_milex_gdp", "m_milex_gdp_chg3", "m_forces_per_1000", "m_milex_per_soldier", "m_arms_imports_pc"],
    "leader2": ["L_age", "L_age_gt70"],
    "stress": ["s_food_cpi_yoy", "s_cpi_yoy", "s_food_gap", "s_fx_dep_12m", "s_fx_vol_3m", "s_brent_x_oil", "s_food_index_yoy"],
    "etnia": ["x_excl_share", "x_dominant_share", "x_n_excl_groups"],
    "esterno": ["z_susp_now", "z_susp_12m", "z_un_listed", "z_un_regime"],
    "stranieri": ["f_pk_personnel_log", "f_pk_chg12", "f_pk_drawdown", "f_ext_events6", "f_ext_chg12"],
    "limiti": ["t_evasion_prev", "t_evasion_5y"],
    "debito": ["d_reserves_months", "d_debt_service", "d_current_account", "d_govt_debt"],
    "media": ["g_log_events", "g_tone", "g_conflict_share", "g_protest_share", "g_tone_chg6", "g_conflict_chg6"],
}
EXT_LABELS = {
    "m_milex_gdp": "Military spending / % of GDP", "m_milex_gdp_chg3": "Military spending change / 3 years",
    "m_forces_per_1000": "Armed forces per 1,000 people", "m_milex_per_soldier": "Military spending per soldier (log)",
    "m_arms_imports_pc": "Arms imports per capita (log)", "L_age": "Leader age", "L_age_gt70": "Leader older than 70",
    "s_food_cpi_yoy": "Food prices / 12-month change", "s_cpi_yoy": "Consumer prices / 12-month change",
    "s_food_gap": "Food inflation minus general inflation", "s_fx_dep_12m": "Currency depreciation / 12 months",
    "s_fx_vol_3m": "Currency volatility / 3 months", "s_brent_x_oil": "Oil price change x oil dependence",
    "s_food_index_yoy": "Global food prices / 12-month change", "x_excl_share": "Population excluded from power (ethnic)",
    "x_dominant_share": "Share held by dominant ethnic groups", "x_n_excl_groups": "Number of excluded ethnic groups",
    "z_susp_now": "Suspended from AU / ECOWAS", "z_susp_12m": "Suspended from AU / ECOWAS in the past year",
    "z_un_listed": "UN sanctions listings (cumulative)", "z_un_regime": "Under a UN sanctions regime",
    "f_pk_personnel_log": "UN peacekeeping personnel (log)", "f_pk_chg12": "UN peacekeeping personnel / 12-month change",
    "f_pk_drawdown": "UN mission drawdown (more than half in a year)", "f_ext_events6": "ACLED events with external forces / 6-month mean",
    "f_ext_chg12": "External-force activity / 12-month change", "t_evasion_prev": "Term-limit evasion attempt last year",
    "t_evasion_5y": "Term-limit evasion attempt in the past five years", "d_reserves_months": "Reserves in months of imports",
    "d_debt_service": "Debt service / % of exports", "d_current_account": "Current account / % of GDP", "d_govt_debt": "Government debt / % of GDP",
    "g_log_events": "News volume (log)", "g_tone": "News tone", "g_conflict_share": "Share of conflict events in the news",
    "g_protest_share": "Share of protest events in the news", "g_tone_chg6": "News tone / change vs 6 months", "g_conflict_chg6": "Conflict share / change vs 6 months",
}
EXT_GROUP_LABELS = {"forze": "Armed forces", "leader2": "Leader age", "stress": "Economic stress (monthly)", "etnia": "Ethnic exclusion", "esterno": "Regional suspensions and UN sanctions",
                    "stranieri": "Foreign forces", "limiti": "Term-limit evasion", "debito": "Sovereign stress (fundamentals)", "media": "News tone (GDELT)"}
ALL_EXT = [f for g in EXT_GROUPS.values() for f in g]


def _annual_to_monthly(panel: pd.DataFrame, table: pd.DataFrame, cols: list[str], lag_years: int = 1, ffill: int = 3) -> pd.DataFrame:
    """Valori annuali (ccode, year) -> righe del pannello: ritardo di pubblicazione e ultimo valore noto riportato avanti (limite in anni)."""
    t = table.sort_values(["ccode", "year"]).drop_duplicates(["ccode", "year"], keep="last")
    last_year = int(panel["year"].max())
    grid = pd.MultiIndex.from_product([t["ccode"].unique(), range(int(t["year"].min()), last_year + 1)], names=["ccode", "year"])
    t = t.set_index(["ccode", "year"]).reindex(grid)[cols]
    t = t.groupby(level=0).ffill(limit=ffill).reset_index()
    t["year"] = t["year"] + lag_years
    m = panel[["unit", "year"]].merge(t.rename(columns={"ccode": "unit"}), on=["unit", "year"], how="left")
    return m[cols].set_index(panel.index)


def _iso_map() -> dict[str, int]:
    v = pd.read_csv(STRUCT / "vdem_structural.csv", usecols=["country_text_id", "COWcode", "country_name"], low_memory=False).drop_duplicates("country_text_id", keep="last")
    v["ccode"] = [canon_code(c) if c == c else code_from_name(n) for c, n in zip(v["COWcode"], v["country_name"])]
    return v.dropna(subset=["ccode"]).set_index("country_text_id")["ccode"].astype(int).to_dict()


def _forze(panel: pd.DataFrame) -> pd.DataFrame:
    p = EXT / "wdi_military.csv"
    out = pd.DataFrame(index=panel.index, columns=EXT_GROUPS["forze"], dtype=float)
    if not p.exists():
        return out
    w = pd.read_csv(p); w["ccode"] = w["iso3"].map(_iso_map()); w = w.dropna(subset=["ccode"]).astype({"ccode": int})
    base = pd.read_csv(STRUCT / "wdi.csv", usecols=["iso3", "year", "gdppc", "population"]); base["ccode"] = base["iso3"].map(_iso_map())
    w = w.merge(base.dropna(subset=["ccode"]).astype({"ccode": int})[["ccode", "year", "gdppc", "population"]], on=["ccode", "year"], how="left")
    w = w.sort_values(["ccode", "year"])
    w["m_milex_gdp"] = w["milex_gdp"]
    w["m_milex_gdp_chg3"] = w["milex_gdp"] - w.groupby("ccode")["milex_gdp"].shift(3)
    w["m_forces_per_1000"] = w["armed_forces"] / w["population"] * 1000
    w["m_milex_per_soldier"] = np.log((w["milex_gdp"] / 100 * w["gdppc"] * w["population"] / w["armed_forces"].where(w["armed_forces"] > 0)).clip(lower=1))
    w["m_arms_imports_pc"] = np.log1p(w["arms_imports"] / w["population"])
    return _annual_to_monthly(panel, w, EXT_GROUPS["forze"], ffill=8)


def _leader(panel: pd.DataFrame, t_end: int) -> pd.DataFrame:
    out = pd.DataFrame(index=panel.index, columns=EXT_GROUPS["leader2"], dtype=float)
    if ARCHIGOS.exists():
        a = pd.read_stata(ARCHIGOS)
        a = a.dropna(subset=["yrborn", "ccode", "startdate"]).copy()
        sd, ed = pd.to_datetime(a["startdate"], errors="coerce"), pd.to_datetime(a["enddate"], errors="coerce")
        a["t0"] = sd.dt.year * 12 + sd.dt.month - 1
        a["t1"] = ed.dt.year * 12 + ed.dt.month - 1
        a = a.dropna(subset=["t0", "t1"])
        age = np.full(len(panel), np.nan)
        pt, pu = panel["t"].to_numpy(), panel["unit"].to_numpy()
        for cc, g in a.groupby("ccode"):
            idx = np.flatnonzero(pu == int(cc))
            if not len(idx):
                continue
            for r in g.itertuples():
                hit = idx[(pt[idx] >= r.t0) & (pt[idx] <= r.t1)]
                age[hit] = pt[hit] / 12 - r.yrborn
        out["L_age"] = age
    wd = EXT / "leaders_wikidata.csv"
    if wd.exists():                                       # solo il mese piu' recente: l'unico per cui sappiamo chi governa
        d = pd.read_csv(wd).dropna(subset=["iso3"]); d["ccode"] = d["iso3"].map(_iso_map())
        d["birth"] = pd.to_datetime(d["hos_birth"].fillna(d["hog_birth"]), errors="coerce")
        d = d.dropna(subset=["ccode", "birth"]).drop_duplicates("ccode")
        born = {int(c): b.year + (b.month - 1) / 12 for c, b in zip(d["ccode"], d["birth"])}
        last = panel["t"] == t_end
        out.loc[last, "L_age"] = panel.loc[last, "unit"].map(lambda u: (t_end / 12 - born[u]) if u in born else np.nan)
    out["L_age_gt70"] = (out["L_age"] > 70).astype(float).where(out["L_age"].notna())
    return out


def _stress(panel: pd.DataFrame) -> pd.DataFrame:
    cols = EXT_GROUPS["stress"]
    out = pd.DataFrame(index=panel.index, columns=cols, dtype=float)
    key = pd.DataFrame({"unit": panel["unit"], "t": panel["t"]}, index=panel.index)
    frames = []
    for name, series in (("fao_cpi.csv", ("cpi", "food_cpi")), ("fao_fx.csv", ("fx",))):
        p = EXT / name
        if not p.exists():
            continue
        f = pd.read_csv(p); f["unit"] = f["Area" if "Area" in f else "area"].map(code_from_name)
        f = f.dropna(subset=["unit"]).astype({"unit": int})
        f["t"] = f["year"] * 12 + f["month"] - 1
        wide = f.pivot_table(index=["unit", "t"], columns="series", values="value", aggfunc="last").sort_index()
        wide = wide.reset_index()
        for s in series:
            if s in wide:
                g = wide.groupby("unit")[s]
                prev = g.shift(12)
                if s == "fx":
                    wide["s_fx_dep_12m"] = np.log(wide[s] / prev).clip(-1, 3)
                    wide["s_fx_vol_3m"] = np.log(wide[s] / g.shift(1)).groupby(wide["unit"]).transform(lambda x: x.rolling(3, min_periods=3).std())
                else:
                    wide[f"s_{s}_yoy"] = np.log(wide[s] / prev)
        frames.append(wide)
    shift = 2                                             # FAOSTAT pubblica con circa due mesi di ritardo
    for wide in frames:
        wide = wide.copy(); wide["t"] = wide["t"] + shift
        use = [c for c in wide.columns if c.startswith("s_")]
        m = key.merge(wide[["unit", "t"] + use], on=["unit", "t"], how="left").set_index(panel.index)
        for c in use:
            out[c] = m[c]
    srt = panel.sort_values(["unit", "t"]).index
    for c in [c for c in out.columns if c in ("s_food_cpi_yoy", "s_cpi_yoy", "s_fx_dep_12m", "s_fx_vol_3m")]:
        out.loc[srt, c] = out.loc[srt, c].groupby(panel.loc[srt, "unit"]).ffill(limit=4)
    out["s_food_gap"] = out["s_food_cpi_yoy"] - out["s_cpi_yoy"]
    fr = EXT / "fred_commodities.csv"
    if fr.exists():
        c = pd.read_csv(fr, parse_dates=["date"]); c["t"] = c["date"].dt.year * 12 + c["date"].dt.month - 1 + 1
        c["brent_chg"] = np.log(c["brent"] / c["brent"].shift(12)); c["s_food_index_yoy"] = np.log(c["food_index"] / c["food_index"].shift(12))
        cm = key.merge(c[["t", "brent_chg", "s_food_index_yoy"]], on="t", how="left").set_index(panel.index)
        out["s_food_index_yoy"] = cm["s_food_index_yoy"]
        oil = panel["e_oil"] if "e_oil" in panel else pd.Series(np.nan, index=panel.index)
        out["s_brent_x_oil"] = cm["brent_chg"] * oil
    return out


def _etnia(panel: pd.DataFrame) -> pd.DataFrame:
    p = EXT / "epr.csv"
    if not p.exists():
        return pd.DataFrame(index=panel.index, columns=EXT_GROUPS["etnia"], dtype=float)
    e = pd.read_csv(p); e["ccode"] = e["statename"].map(code_from_name); e = e.dropna(subset=["ccode"]).astype({"ccode": int})
    e["status"] = e["status"].str.upper()
    excl = {"POWERLESS", "DISCRIMINATED", "SELF-EXCLUSION"}
    dom = {"MONOPOLY", "DOMINANT"}
    e = e.rename(columns={"from": "y0", "to": "y1"})
    rows = []
    for r in e.itertuples():
        for y in range(int(r.y0), int(r.y1) + 1):
            rows.append((r.ccode, y, r.size if r.status in excl else 0.0, r.size if r.status in dom else 0.0, 1 if r.status in excl else 0))
    t = pd.DataFrame(rows, columns=["ccode", "year", "x_excl_share", "x_dominant_share", "x_n_excl_groups"]).groupby(["ccode", "year"], as_index=False).sum()
    t[["x_excl_share", "x_dominant_share"]] = t[["x_excl_share", "x_dominant_share"]].clip(upper=1)
    # lo status di un anno e' codificato a posteriori e puo' gia' riflettere un golpe di quell'anno: si usa l'anno precedente; le categorie sono stabili, si prolungano oltre il 2021
    return _annual_to_monthly(panel, t, EXT_GROUPS["etnia"], lag_years=1, ffill=9)


def _esterno(panel: pd.DataFrame) -> pd.DataFrame:
    cols = EXT_GROUPS["esterno"]
    out = pd.DataFrame(0.0, index=panel.index, columns=cols)
    if not SUSPENSIONS.exists():
        out[["z_susp_now", "z_susp_12m"]] = np.nan
    else:
        sp = pd.read_csv(SUSPENSIONS, comment="#")
        sp["unit"] = sp["country"].map(code_from_name)
        ym = lambda v: int(str(v)[:4]) * 12 + int(str(v)[5:7]) - 1
        for r in sp.dropna(subset=["unit"]).itertuples():
            t0 = ym(r.start); t1 = ym(r.end) if isinstance(r.end, str) and r.end else 10 ** 9
            mine = panel["unit"] == int(r.unit)
            out.loc[mine & (panel["t"] >= t0) & (panel["t"] <= t1), "z_susp_now"] = 1.0
            out.loc[mine & (panel["t"] >= t0) & (panel["t"] <= (t1 + 12 if t1 < 10 ** 9 else t1)), "z_susp_12m"] = 1.0
        out.loc[panel["year"] < 2000, ["z_susp_now", "z_susp_12m"]] = np.nan          # l'elenco parte dal 2001: prima non e' coperto
    un = EXT / "un_sanctions.csv"
    if not un.exists():
        out[["z_un_listed", "z_un_regime"]] = np.nan
        return out
    u = pd.read_csv(un).dropna(subset=["listed_on"])
    names = {"CD": "Democratic Republic of the Congo", "CF": "Central African Republic", "LY": "Libya", "SD": "Sudan", "SO": "Somalia", "SS": "South Sudan", "YE": "Yemen",
             "HT": "Haiti", "IQ": "Iraq", "KP": "North Korea", "TA": "Afghanistan", "GB": "Guinea-Bissau", "IR": "Iran", "ML": "Mali"}
    u["unit"] = u["prefix"].map(names).map(lambda n: code_from_name(n) if isinstance(n, str) else None)
    ld = u["listed_on"].str[:10]
    u["t"] = ld.str[:4].astype(int) * 12 + ld.str[5:7].astype(int) - 1
    for unit, g in u.dropna(subset=["unit"]).groupby("unit"):
        ts = np.sort(g["t"].to_numpy()); mine = (panel["unit"] == int(unit)).to_numpy()
        n = np.searchsorted(ts, panel.loc[mine, "t"].to_numpy(), side="right")
        out.loc[mine, "z_un_listed"] = np.log1p(n); out.loc[mine, "z_un_regime"] = (n > 0).astype(float)
    return out


def _acled_external(units: set) -> pd.DataFrame:
    """Eventi violenti ACLED in cui compare un attore 'External/Other forces' (inter = 8), per paese e mese."""
    frames = []
    for f in sorted((ROOT / "data" / "raw" / "acled").glob("acled_*.csv")):
        d = pd.read_csv(f, usecols=["event_date", "event_type", "inter1", "inter2", "country"])
        ext = lambda v: v.astype(str).str.contains("External", na=False) | v.astype(str).isin(["8", "8.0"])     # etichetta di testo (API recente) o codice 8
        d = d[d["event_type"].isin(["Battles", "Explosions/Remote violence", "Violence against civilians"]) & (ext(d["inter1"]) | ext(d["inter2"]))]
        dt = pd.to_datetime(d["event_date"]); d = d.assign(t=dt.dt.year * 12 + dt.dt.month - 1)
        frames.append(d.groupby(["country", "t"]).size().rename("n").reset_index())
    e = pd.concat(frames, ignore_index=True).groupby(["country", "t"], as_index=False)["n"].sum()
    e["unit"] = e["country"].map(code_from_name)
    e = e.dropna(subset=["unit"]).astype({"unit": int})
    return e.groupby(["unit", "t"], as_index=False)["n"].sum()                   # piu' nomi ACLED possono confluire nello stesso paese


def _stranieri(panel: pd.DataFrame) -> pd.DataFrame:
    cols = EXT_GROUPS["stranieri"]
    out = pd.DataFrame(np.nan, index=panel.index, columns=cols)
    key = pd.DataFrame({"unit": panel["unit"], "t": panel["t"]}, index=panel.index)
    pk = EXT / "peacekeeping.csv"
    if pk.exists():
        p = pd.read_csv(pk); p["unit"] = p["host_iso3"].map(_iso_map())
        p = p.dropna(subset=["unit"]).astype({"unit": int}); p["t"] = p["month"].str[:4].astype(int) * 12 + p["month"].str[5:7].astype(int) - 1
        p = p.groupby(["unit", "t"], as_index=False)["personnel"].sum()
        t_last = int(p["t"].max())                                                        # ultimo mese pubblicato; oltre, si riporta l'ultimo valore per al piu' 6 mesi
        eff = key["t"].clip(upper=t_last)
        known = (panel["t"] >= 1991 * 12) & (panel["t"] - t_last <= 6)
        m = key.assign(t=eff).merge(p, on=["unit", "t"], how="left").set_index(panel.index)
        pers = m["personnel"].fillna(0.0).where(known)                                   # prima del 1991 il dataset non c'e': sconosciuto, non zero
        lag = key.assign(t=eff - 12).merge(p, on=["unit", "t"], how="left").set_index(panel.index)["personnel"].fillna(0.0).where(known & (panel["t"] >= 1992 * 12))
        out["f_pk_personnel_log"] = np.log1p(pers)
        out["f_pk_chg12"] = np.log1p(pers) - np.log1p(lag)
        out["f_pk_drawdown"] = ((lag >= 100) & (pers < lag * 0.5)).astype(float).where(lag.notna())
    if (ROOT / "data" / "raw" / "acled").exists():
        e = _acled_external(set(panel["unit"]))
        m = key.merge(e, on=["unit", "t"], how="left").set_index(panel.index)["n"].fillna(0.0)
        srt = panel.sort_values(["unit", "t"]).index
        mean6 = m.loc[srt].groupby(panel.loc[srt, "unit"]).transform(lambda x: x.rolling(6, min_periods=3).mean())
        out.loc[srt, "f_ext_events6"] = np.log1p(mean6)
        out.loc[srt, "f_ext_chg12"] = np.log1p(mean6) - np.log1p(mean6.groupby(panel.loc[srt, "unit"]).shift(12))
        out.loc[panel["year"] < 1997, ["f_ext_events6", "f_ext_chg12"]] = np.nan
    return out


def _limiti(panel: pd.DataFrame) -> pd.DataFrame:
    cols = EXT_GROUPS["limiti"]; p = EXT / "term_limits.csv"
    if not p.exists():
        return pd.DataFrame(np.nan, index=panel.index, columns=cols)
    t = pd.read_csv(p); t["ccode"] = t["ccode"].map(lambda c: canon_code(int(c)) if c == c else None)
    t = t.dropna(subset=["ccode", "year"]).astype({"ccode": int, "year": int}).sort_values(["ccode", "year"])
    t["a"] = t["attempt"].fillna(0.0)
    t["a5"] = t.groupby("ccode")["a"].transform(lambda x: x.rolling(5, min_periods=1).max())
    t["t_evasion_prev"], t["t_evasion_5y"] = t["a"], t["a5"]
    out = _annual_to_monthly(panel, t.rename(columns={"ccode": "ccode"}), cols, lag_years=1, ffill=0)
    out[panel["year"] > 2021] = np.nan                                                  # il dataset termina nel 2020: oltre, sconosciuto
    return out


def _debito(panel: pd.DataFrame) -> pd.DataFrame:
    cols = EXT_GROUPS["debito"]; p = EXT / "wdi_stress.csv"
    if not p.exists():
        return pd.DataFrame(np.nan, index=panel.index, columns=cols)
    w = pd.read_csv(p); w["ccode"] = w["iso3"].map(_iso_map()); w = w.dropna(subset=["ccode"]).astype({"ccode": int})
    w = w.rename(columns={"reserves_months": "d_reserves_months", "debt_service_exports": "d_debt_service", "current_account_gdp": "d_current_account", "govt_debt_gdp": "d_govt_debt"})
    return _annual_to_monthly(panel, w, cols, lag_years=1, ffill=3)


def _media(panel: pd.DataFrame) -> pd.DataFrame:
    cols = EXT_GROUPS["media"]; d = ROOT / "data" / "gdelt" / "daily_sample.csv"; f = ROOT / "data" / "gdelt" / "fips_countries.tsv"
    out = pd.DataFrame(np.nan, index=panel.index, columns=cols)
    if not d.exists() or not f.exists():
        return out
    names = pd.read_csv(f, sep="\t", header=None, names=["fips", "name"], dtype=str)
    unit_of = {r.fips: code_from_name(r.name) for r in names.itertuples()}
    g = pd.read_csv(d); g["unit"] = g["fips"].map(unit_of); g = g.dropna(subset=["unit"]).astype({"unit": int})
    dt = pd.to_datetime(g["date"]); g["t"] = dt.dt.year * 12 + dt.dt.month - 1
    days = g.groupby("t")["date"].nunique().rename("days")
    m = g.groupby(["unit", "t"], as_index=False)[["events", "mentions", "tone_w", "gold_w", "r14", "r17", "r18", "r19", "r20"]].sum().merge(days, on="t")
    m["g_log_events"] = np.log1p(m["events"] / m["days"]); m["g_tone"] = m["tone_w"] / m["mentions"]
    m["g_conflict_share"] = (m["r14"] + m["r17"] + m["r18"] + m["r19"] + m["r20"]) / m["events"]; m["g_protest_share"] = m["r14"] / m["events"]
    m = m.sort_values(["unit", "t"])
    for c, name in (("g_tone", "g_tone_chg6"), ("g_conflict_share", "g_conflict_chg6")):
        m[name] = m[c] - m.groupby("unit")[c].transform(lambda x: x.shift(1).rolling(6, min_periods=3).mean())
    m["t"] = m["t"] + 1                                                                    # il mese t usa i dati del mese t-1, completo
    key = pd.DataFrame({"unit": panel["unit"], "t": panel["t"]}, index=panel.index)
    return key.merge(m[["unit", "t"] + cols], on=["unit", "t"], how="left").set_index(panel.index)[cols]


def features(panel: pd.DataFrame, t_end: int) -> pd.DataFrame:
    """Una riga per riga del pannello, colonne ALL_EXT."""
    parts = [_forze(panel), _leader(panel, t_end), _stress(panel), _etnia(panel), _esterno(panel), _stranieri(panel), _limiti(panel), _debito(panel), _media(panel)]
    return pd.concat(parts, axis=1)[ALL_EXT].astype(float)
