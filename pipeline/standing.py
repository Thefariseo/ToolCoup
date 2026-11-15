"""Scheda di contesto per paese: fatti da fonti pubbliche che accompagnano la previsione senza entrarvi.

Scrive webdata/standing.json con, per ogni paese, gli ultimi valori noti (con anno o mese e fonte) di:
  - sospensioni da UA / ECOWAS (data/external/suspensions.csv)
  - regime di sanzioni del Consiglio di sicurezza ONU e numero di soggetti inseriti
  - presenza ONU (personale uniformato delle missioni) e variazione sui 12 mesi
  - spesa militare, forze armate, importazioni di armi (Banca Mondiale / SIPRI)
  - riserve, servizio del debito, saldo corrente, debito pubblico (Banca Mondiale)
  - prezzi al consumo e alimentari, cambio (FAOSTAT)
  - capo di stato e di governo con l'eta' (Wikidata)
  - esclusione etnica (ETH Zurich EPR) e tentativi di eludere i limiti di mandato (fino al 2020)
  - tono delle notizie nell'ultimo mese completo rispetto alla storia del paese (GDELT)

Sono fatti descrittivi: le variabili che superano il test fuori campione (pipeline/experiment_extensions.py) entrano anche nel modello.
Uso:  python pipeline/standing.py
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from countries import code_from_name  # noqa: E402
from extensions import EXT, ROOT, SUSPENSIONS, _iso_map  # noqa: E402

OUT = ROOT / "webdata" / "standing.json"
UN_NAMES = {"CD": "Democratic Republic of the Congo", "CF": "Central African Republic", "LY": "Libya", "SD": "Sudan", "SO": "Somalia", "SS": "South Sudan", "YE": "Yemen",
            "HT": "Haiti", "IQ": "Iraq", "KP": "North Korea", "TA": "Afghanistan", "GB": "Guinea-Bissau", "IR": "Iran", "ML": "Mali"}
UN_REGIME = {"DRC": "Democratic Republic of the Congo", "CAR": "Central African Republic", "SouthSudan": "South Sudan", "GB": "Guinea-Bissau", "DPRK": "North Korea"}
r2 = lambda v, d=2: None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), d)


MIN_YEAR = date.today().year - 8          # un valore piu' vecchio di otto anni non descrive piu' il paese: non si mostra


def latest(df: pd.DataFrame, col: str, key: str = "ccode") -> dict:
    """Ultimo valore non mancante per paese, se abbastanza recente: {ccode: (valore, anno)}."""
    d = df.dropna(subset=[col]).sort_values([key, "year"]).groupby(key).tail(1)
    return {int(k): (float(v), int(y)) for k, v, y in zip(d[key], d[col], d["year"]) if int(y) >= MIN_YEAR}


def main() -> None:
    countries = json.loads((ROOT / "webdata" / "countries.json").read_text())
    slug_of = {}
    for c in countries:
        cc = code_from_name(c["name"])
        if cc is not None and not c.get("historical"):
            slug_of.setdefault(int(cc), c["slug"])
    iso = _iso_map()
    rec: dict[str, dict] = {slug: {} for slug in slug_of.values()}
    put = lambda cc, key, val: rec[slug_of[cc]].__setitem__(key, val) if cc in slug_of and val else None

    # --- sospensioni
    if SUSPENSIONS.exists():
        s = pd.read_csv(SUSPENSIONS, comment="#")
        for r in s.itertuples():
            cc = code_from_name(r.country)
            if cc in slug_of:
                rec[slug_of[cc]].setdefault("suspensions", []).append({"body": r.body, "start": r.start, "end": r.end if isinstance(r.end, str) else None, "basis": r.basis})
        for v in rec.values():
            if "suspensions" in v:
                v["suspensions"].sort(key=lambda x: x["start"], reverse=True)
    # --- sanzioni ONU
    un = EXT / "un_sanctions.csv"
    if un.exists():
        u = pd.read_csv(un).dropna(subset=["listed_on"])
        u["ccode"] = u["prefix"].map(UN_NAMES).map(lambda n: code_from_name(n) if isinstance(n, str) else None)
        for cc, g in u.dropna(subset=["ccode"]).groupby("ccode"):
            put(int(cc), "un_sanctions", {"listed": int(len(g)), "regime": UN_REGIME.get(g["regime"].iloc[0], g["regime"].iloc[0]), "first": g["listed_on"].min()[:7], "last": g["listed_on"].max()[:7]})
    # --- missioni ONU
    pk = EXT / "peacekeeping.csv"
    if pk.exists():
        p = pd.read_csv(pk); p["ccode"] = p["host_iso3"].map(iso); p = p.dropna(subset=["ccode"]); p["ccode"] = p["ccode"].astype(int)
        last_month = p["month"].max()
        for cc, g in p.groupby("ccode"):
            g = g.sort_values("month")
            now = g[g["month"] == last_month]["personnel"].sum()
            ym = (int(last_month[:4]) - 1, int(last_month[5:]))
            before = g[g["month"] == f"{ym[0]}-{ym[1]:02d}"]["personnel"].sum()
            if now > 0 or before > 0:
                put(int(cc), "un_mission", {"personnel": int(now), "month": last_month, "twelve_months_earlier": int(before)})
            elif g["personnel"].max() > 0:
                put(int(cc), "un_mission", {"personnel": 0, "month": last_month, "peak": int(g["personnel"].max()), "peak_month": g.loc[g["personnel"].idxmax(), "month"], "ended": g[g["personnel"] > 0]["month"].max()})
    # --- Banca Mondiale: militare e stress
    base = pd.read_csv(ROOT / "data" / "raw" / "structural" / "wdi.csv", usecols=["iso3", "year", "population"])
    base["ccode"] = base["iso3"].map(iso); pop = latest(base.dropna(subset=["ccode"]).astype({"ccode": int}), "population")
    for fname, cols in (("wdi_military.csv", {"milex_gdp": "military_spending_gdp", "armed_forces": "armed_forces", "arms_imports": "arms_imports"}),
                        ("wdi_stress.csv", {"reserves_months": "reserves_months", "debt_service_exports": "debt_service_exports", "current_account_gdp": "current_account_gdp", "govt_debt_gdp": "govt_debt_gdp"})):
        f = EXT / fname
        if not f.exists():
            continue
        w = pd.read_csv(f); w["ccode"] = w["iso3"].map(iso); w = w.dropna(subset=["ccode"]).astype({"ccode": int})
        for col, name in cols.items():
            for cc, (v, y) in latest(w, col).items():
                if name == "armed_forces" and cc in pop and pop[cc][0] > 0:
                    put(cc, "armed_forces_per_1000", {"value": r2(v / pop[cc][0] * 1000), "year": y, "total": int(v)})
                elif name == "arms_imports":
                    put(cc, "arms_imports", {"value": r2(v / 1e6, 1), "year": y})
                else:
                    put(cc, name, {"value": r2(v), "year": y})
    # --- prezzi e cambio
    fc = EXT / "fao_cpi.csv"
    if fc.exists():
        f = pd.read_csv(fc); f["ccode"] = f["area"].map(code_from_name); f = f.dropna(subset=["ccode"]).astype({"ccode": int})
        f["t"] = f["year"] * 12 + f["month"] - 1
        for cc, g in f.groupby("ccode"):
            wide = g.pivot_table(index="t", columns="series", values="value", aggfunc="last").sort_index()
            out = {}
            for series in ("cpi", "food_cpi"):
                if series in wide and wide[series].notna().sum() > 13:
                    s_ = wide[series].dropna(); t = s_.index[-1]
                    if t - 12 in s_.index:
                        out[series + "_yoy"] = r2((s_.iloc[-1] / s_.loc[t - 12] - 1) * 100, 1); out["month"] = f"{t // 12}-{t % 12 + 1:02d}"
            put(cc, "prices", out)
    fx = EXT / "fao_fx.csv"
    if fx.exists():
        f = pd.read_csv(fx); f["ccode"] = f["area"].map(code_from_name); f = f.dropna(subset=["ccode"]).astype({"ccode": int}); f["t"] = f["year"] * 12 + f["month"] - 1
        for cc, g in f.groupby("ccode"):
            s_ = g.groupby("t")["value"].last().sort_index()
            if len(s_) > 13 and s_.index[-1] - 12 in s_.index:
                t = s_.index[-1]
                put(cc, "currency", {"lcu_per_usd": r2(s_.iloc[-1], 2), "change_12m_pct": r2((s_.iloc[-1] / s_.loc[t - 12] - 1) * 100, 1), "month": f"{t // 12}-{t % 12 + 1:02d}"})
    # --- leader
    ld = EXT / "leaders_wikidata.csv"
    if ld.exists():
        l = pd.read_csv(ld).dropna(subset=["iso3"]); l["ccode"] = l["iso3"].map(iso); l = l.dropna(subset=["ccode"]).drop_duplicates("ccode")
        today = date.today()
        age = lambda b: None if not isinstance(b, str) else int((today - date.fromisoformat(b)).days / 365.25)
        for r in l.itertuples():
            put(int(r.ccode), "leaders", {"head_of_state": r.head_of_state if isinstance(r.head_of_state, str) else None, "head_of_state_age": age(r.hos_birth),
                                          "head_of_government": r.head_of_government if isinstance(r.head_of_government, str) else None, "head_of_government_age": age(r.hog_birth)})
    # --- esclusione etnica
    ep = EXT / "epr.csv"
    if ep.exists():
        e = pd.read_csv(ep); e["ccode"] = e["statename"].map(code_from_name); e = e.dropna(subset=["ccode"]).astype({"ccode": int}); e["status"] = e["status"].str.upper()
        for cc, g in e.groupby("ccode"):
            y = g["to"].max(); cur = g[g["to"] == y]
            excl = cur[cur["status"].isin(["POWERLESS", "DISCRIMINATED", "SELF-EXCLUSION"])]
            put(cc, "ethnic_power", {"excluded_share": r2(excl["size"].sum()), "excluded_groups": int(len(excl)), "groups": int(len(cur)), "year": int(y)})
    tl = EXT / "term_limits.csv"
    if tl.exists():
        t = pd.read_csv(tl); t["ccode"] = t["ccode"].map(lambda c: None if c != c else int(c)); t = t.dropna(subset=["ccode", "year"])
        for cc, g in t[t["attempt"] == 1].groupby("ccode"):
            put(int(cc), "term_limit_evasion", {"years": sorted(int(y) for y in g["year"]), "coverage_ends": int(t["year"].max())})
    # --- notizie
    gd = ROOT / "data" / "gdelt" / "daily_sample.csv"; fp = ROOT / "data" / "gdelt" / "fips_countries.tsv"
    if gd.exists() and fp.exists():
        names = pd.read_csv(fp, sep="\t", header=None, names=["fips", "name"], dtype=str)
        unit_of = {r.fips: code_from_name(r.name) for r in names.itertuples()}
        g = pd.read_csv(gd); g["ccode"] = g["fips"].map(unit_of); g = g.dropna(subset=["ccode"]).astype({"ccode": int})
        g["month"] = g["date"].str[:7]
        m = g.groupby(["ccode", "month"], as_index=False)[["events", "mentions", "tone_w", "r14", "r17", "r18", "r19", "r20"]].sum()
        m["tone"] = m["tone_w"] / m["mentions"]; m["conflict"] = (m["r14"] + m["r17"] + m["r18"] + m["r19"] + m["r20"]) / m["events"]
        days = g.groupby("month")["date"].nunique(); complete = [mo for mo in sorted(days.index) if days[mo] >= 3]
        last = complete[-1] if complete else None
        for cc, h in m.groupby("ccode"):
            h = h[h["month"].isin(complete)].sort_values("month")
            if last is None or h.empty or h["month"].iloc[-1] != last or len(h) < 24:
                continue
            hist = h.iloc[:-1].tail(36)
            z = (h["tone"].iloc[-1] - hist["tone"].mean()) / (hist["tone"].std() or 1)
            zc = (h["conflict"].iloc[-1] - hist["conflict"].mean()) / (hist["conflict"].std() or 1)
            put(int(cc), "news", {"month": last, "tone": r2(h["tone"].iloc[-1]), "tone_z": r2(z, 1), "conflict_share": r2(h["conflict"].iloc[-1], 3), "conflict_z": r2(zc, 1), "months": int(len(hist))})
    rec = {k: v for k, v in rec.items() if v}
    OUT.write_text(json.dumps({"meta": {"generated": date.today().isoformat(), "countries": len(rec)}, "countries": rec}, separators=(",", ":"), ensure_ascii=False))
    print(f"{len(rec)} paesi -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
