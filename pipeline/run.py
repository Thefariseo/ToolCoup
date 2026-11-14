"""Pipeline completa: dati -> panel lungo -> insieme di modelli -> validazione -> webdata/*.json

Uso:
    python pipeline/run.py                 # tutto, con 20 ricampionamenti per l'incertezza
    python pipeline/run.py --boot 0        # senza intervalli di incertezza (piu' veloce)
    python pipeline/run.py --horizon 12    # orizzonte di previsione in mesi (default 6)

Servono: data/raw/acled/ (fetch_acled.py), data/coupdb/coups.csv (build_coupdb.py),
data/raw/structural/ (fetch_structural.py).
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as M  # noqa: E402
from data import RAW_SERIES, load_acled, monthly_panel, ord_label  # noqa: E402
from export_web import export as export_web  # noqa: E402
from panel import ALL_FEATURES, GROUP_LABELS, GROUPS, build_panel  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
ACLED_DIR = ROOT / "data" / "raw" / "acled"
COUPDB = ROOT / "data" / "coupdb" / "coups.csv"
CACHE = ROOT / "data" / "raw" / "acled_monthly.pkl"
WF_CACHE = ROOT / "data" / "raw" / "walk_forward.pkl"

MODEL_LABELS = {
    "ensemble": "Insieme calibrato (modello pubblicato)",
    "ensemble_raw": "Insieme prima della calibrazione",
    "logit": "Componente: regressione logistica",
    "gbm": "Componente: gradient boosting",
    "rf": "Componente: foresta casuale",
    "ensemble_noacled": "Insieme senza i segnali ACLED",
    "storia_contagio": "Solo storia golpista e contagio",
    "storia": "Solo storia golpista del paese",
}


def acled_monthly() -> tuple[pd.DataFrame, dict]:
    """Aggregazione mensile ACLED, riusata finche' i file grezzi non cambiano."""
    files = sorted(ACLED_DIR.glob("*.csv"))
    stamp = [(f.name, f.stat().st_size, int(f.stat().st_mtime)) for f in files]
    if CACHE.exists():
        cached = pd.read_pickle(CACHE)
        if cached["stamp"] == stamp:
            return cached["monthly"], cached["meta"]
    print("Carico ACLED...")
    monthly, meta = monthly_panel(load_acled(ACLED_DIR))
    pd.to_pickle({"stamp": stamp, "monthly": monthly, "meta": meta}, CACHE)
    return monthly, meta


def event_study(am: pd.DataFrame, events: pd.DataFrame, series, lo=-12, hi=6) -> dict:
    """Attivita' ACLED attorno ai golpe, in deviazioni standard rispetto alla norma del paese."""
    z = am[["country", "t"]].copy()
    for s in series:
        g = am.groupby("country")[s]
        z[s] = (am[s] - g.transform("mean")) / g.transform("std").replace(0, np.nan)
    z = z.set_index(["country", "t"])
    offs = list(range(lo, hi + 1))
    out, n = {s: [] for s in series}, 0
    for k in offs:
        rows = z.reindex([(c, t + k) for c, t in zip(events["country"], events["t"])])
        n = max(n, int(rows.notna().any(axis=1).sum()))
        for s in series:
            v = rows[s].mean()
            out[s].append(None if pd.isna(v) else round(float(v), 3))
    return {"offsets": offs, "series": out, "n": n}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizon", type=int, default=6, help="orizzonte di previsione in mesi")
    ap.add_argument("--boot", type=int, default=20, help="ricampionamenti per gli intervalli di incertezza")
    args = ap.parse_args()
    H = args.horizon
    missing = [str(p.relative_to(ROOT)) for p in (ACLED_DIR, COUPDB, ROOT / "data" / "raw" / "structural" / "vdem_structural.csv")
               if not p.exists() or (p.is_dir() and not list(p.glob("*.csv")))]
    if missing:
        sys.exit("Dati mancanti: " + ", ".join(missing) + " (vedi README.md)")
    warnings.simplefilter("ignore")

    am, ameta = acled_monthly()
    am["unrest"] = am["protests"] + am["riots"]
    am["violence"] = am["battles"] + am["explosions"] + am["vac"]
    info = am.groupby("country").agg(iso=("iso", "first"), region=("region", "first"))
    t_end = int(ameta["t_end"])

    print("Costruisco il panel...")
    panel, pinfo = build_panel(COUPDB, am[["country", "t"] + RAW_SERIES], info, t_end, H)
    unit_of = pinfo["unit_of_acled"]
    known = panel["y_known"]
    print(f"Panel: {len(panel):,} paese-mesi dal {panel['year'].min()}, {panel['unit'].nunique()} unita', "
          f"{int(panel['onset'].sum())} mesi con un tentativo di golpe, {len(ALL_FEATURES)} variabili")

    # ---------------- validazione fuori campione
    # la validazione costa una ventina di minuti: si riusa finche' panel e modelli non cambiano
    sig = (len(panel), t_end, H, tuple(ALL_FEATURES), tuple(M.SPECS), float(panel["y"].sum()),
           float(panel["h_since_attempt"].sum().round(3)), float(panel["v2x_polyarchy"].sum().round(3)))
    cached = pd.read_pickle(WF_CACHE) if WF_CACHE.exists() else None
    if cached is not None and cached["sig"] == sig:
        print("Validazione: riuso i risultati salvati (panel invariato)")
        preds = cached["preds"]
    else:
        print("Validazione anno per anno (circa 20 minuti)...")
        preds = M.walk_forward(panel, H)
        pd.to_pickle({"sig": sig, "preds": preds}, WF_CACHE)
    preds["ensemble_raw"] = M.combine(preds, M.ENSEMBLE)
    preds["ensemble_noacled"] = M.combine(preds, M.ENSEMBLE_NOACLED)
    preds["ensemble"], cal = M.calibrate_forward(panel, preds["ensemble_raw"], H)

    oos = known & preds["ensemble"].notna()
    windows = {"all": oos, "recent": oos & (panel["year"] >= 2000), "acled": oos & panel["a_unrest_surge"].notna()}
    metrics = []
    for key, label in MODEL_LABELS.items():
        row = {"key": key, "label": label}
        for w, mask in windows.items():
            row[w] = M.score(panel.loc[mask, "y"], preds.loc[mask, key], panel.loc[mask, "t"])
        metrics.append(row)
        a = row["all"]
        print(f"  {label:42s} AUC {a['auc']:.3f}  PR {a['pr_auc']:.3f}  Brier-skill {a['brier_skill']:+.3f}  top10 {a['top10_recall']:.2f}"
              f"  | ACLED: AUC {row['acled']['auc']:.3f} PR {row['acled']['pr_auc']:.3f}")

    def diff(a, b, mask, label):
        d = M.bootstrap_diff(panel.loc[mask, "y"], preds.loc[mask, a], preds.loc[mask, b], panel.loc[mask, "unit"])
        d["label"] = label
        print(f"  {label}: dAUC {d['d_auc']:+.3f} {d['d_auc_ci']}  dPR {d['d_pr']:+.3f} {d['d_pr_ci']}")
        return d

    comparisons = [
        diff("ensemble", "storia", windows["all"], "Insieme contro sola storia golpista (dal 1975)"),
        diff("ensemble", "storia", windows["recent"], "Insieme contro sola storia golpista (dal 2000)"),
        diff("ensemble_raw", "ensemble_noacled", windows["acled"], "Con e senza segnali ACLED (periodo ACLED)"),
    ]
    calibration = M.calibration_table(panel.loc[windows["recent"], "y"], preds.loc[windows["recent"], "ensemble"])

    # ---------------- modello finale e previsione
    print("Modello finale...")
    train = panel[known]
    models = M.fit_final(train)
    latest = panel[panel["t"] == t_end].copy()
    latest["risk"] = M.predict_ensemble(models, latest, cal)
    explained = M.explain(models, latest)
    if args.boot > 0:
        draws = M.bootstrap_intervals(train, latest, cal, reps=args.boot)
        latest["risk_lo"], latest["risk_hi"] = np.quantile(draws, 0.1, axis=0), np.quantile(draws, 0.9, axis=0)
        latest["risk_lo"] = np.minimum(latest["risk_lo"], latest["risk"])
        latest["risk_hi"] = np.maximum(latest["risk_hi"], latest["risk"])
    else:
        latest["risk_lo"] = latest["risk_hi"] = np.nan
    latest["explain"] = explained
    panel["risk_hist"] = preds["ensemble"]
    panel.loc[latest.index, "risk_hist"] = latest["risk"]

    # ---------------- risultati per paese (solo unita' coperte da ACLED: sono quelle pubblicate)
    by_unit = {u: g for u, g in panel.groupby("unit")}
    lat = latest.set_index("unit")
    am_by = {c: g.sort_values("t") for c, g in am.groupby("country")}
    r = lambda v, nd=5: None if v is None or pd.isna(v) else round(float(v), nd)
    countries = []
    for name, unit in unit_of.items():
        if unit not in lat.index:
            continue
        row, g, a = lat.loc[unit], by_unit[unit], am_by[name]
        hist = g.loc[g["risk_hist"].first_valid_index():] if g["risk_hist"].notna().any() else g.iloc[0:0]
        prev = g.loc[g["t"] == t_end - 3, "risk_hist"]
        full = a.set_index("t").reindex(range(int(a["t"].min()), t_end + 1), fill_value=0)
        countries.append({
            "name": name, "iso": None if pd.isna(info.loc[name, "iso"]) else f"{int(info.loc[name, 'iso']):03d}",
            "region": info.loc[name, "region"], "risk": r(row["risk"]), "risk_lo": r(row["risk_lo"]),
            "risk_hi": r(row["risk_hi"]), "risk_3m_ago": r(prev.iat[0]) if len(prev) else None,
            "structural": bool(unit > 0), "drivers": row["explain"]["drivers"], "groups": row["explain"]["groups"],
            "risk_hist": {"start": ord_label(int(hist["t"].iat[0])) if len(hist) else None,
                          "values": [r(v) for v in hist["risk_hist"]]},
            "series": {"start": ord_label(int(full.index[0])),
                       **{k: full[k].astype(int).tolist() for k in ("unrest", "violence", "fatalities", "infighting")}},
            "coups": [],
        })
    countries.sort(key=lambda c: -c["risk"])
    for i, c in enumerate(countries):
        c["rank"] = i + 1

    # ---------------- contorno
    name_of_unit = {u: n for n, u in unit_of.items()}
    tgt = pinfo["target"].assign(country=pinfo["target"]["ccode"].map(name_of_unit)).dropna(subset=["country"])
    tgt = tgt.merge(am[["country", "t"]], on=["country", "t"])
    recent = train[train["year"] >= 2000]
    result = {
        "meta": {
            "generated": date.today().isoformat(), "demo": False, "horizon": H,
            "data_start": ameta["date_min"], "data_end": ord_label(t_end),
            "forecast_from": ord_label(t_end + 1), "forecast_to": ord_label(t_end + H),
            "n_events": int(ameta["n_events"]), "n_countries": len(countries),
            "panel_from": int(panel["year"].min()), "n_rows": int(len(panel)), "n_units": int(panel["unit"].nunique()),
            "n_features": len(ALL_FEATURES), "n_onsets": int(panel["onset"].sum()),
            "n_coups_acled": int(len(tgt)), "n_success_acled": int(tgt["success"].sum()),
            "base_rate": r(recent["y"].mean()), "base_rate_all": r(train["y"].mean()),
            "first_test_year": M.FIRST_TEST_YEAR, "n_oos": int(oos.sum()), "n_oos_pos": int(panel.loc[oos, "y"].sum()),
            "coup_source": "db", "history_from": 1900, "n_coups_history": int(pinfo["n_broad"]),
            "boot": args.boot, "calibration": [round(cal[0], 3), round(cal[1], 3)],
            "groups": [{"key": k, "label": GROUP_LABELS[k], "n": len(v)} for k, v in GROUPS.items() if k != "tempo"],
        },
        "metrics": metrics, "comparisons": comparisons, "calibration": calibration,
        "countries": countries,
        "history": {"event_study": event_study(am, tgt, ["unrest", "violence", "fatalities", "infighting"]),
                    "factors": M.coefficient_table(models), "by_region": []},
    }
    export_web(result, COUPDB, ROOT / "webdata")
    import registry                       # archivia l'edizione (se nuova) e aggiorna i punteggi del registro
    registry.archive()
    (ROOT / "webdata" / "registry.json").write_text(json.dumps(registry.build(), ensure_ascii=False, separators=(",", ":")),
                                                    encoding="utf-8")
    print("Top 10 rischio:", ", ".join(f"{c['name']} {c['risk']:.1%}" for c in countries[:10]))


if __name__ == "__main__":
    main()
