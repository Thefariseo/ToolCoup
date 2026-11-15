"""Esperimento: le cinque estensioni (forze armate, eta' del leader, stress economico mensile, esclusione etnica,
sospensioni esterne) e il LightGBM migliorano la previsione dei golpe?

Stessa procedura degli esperimenti precedenti: validazione anno per anno (modelli addestrati solo sul passato),
con e senza ogni gruppo, stesso insieme di anni, intervalli al 90% da ricampionamento dei paesi.

    base        le variabili del modello pubblicato
    +gruppo     base + un gruppo di estensioni
    +tutte      base + tutte
Per ciascuna combinazione: regressione logistica e LightGBM. In piu' l'insieme pubblicato (logit+gbm+rf) con e senza LightGBM.

Il modello pubblicato NON viene toccato: l'esito va in data/experiments/extensions.json.
Uso:  python pipeline/experiment_extensions.py [--from 2005]
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
import extensions as X  # noqa: E402
from lgbm import make_lgbm  # noqa: E402
import model as M  # noqa: E402
import run as R  # noqa: E402
from data import RAW_SERIES  # noqa: E402
from panel import ALL_FEATURES, build_panel  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "experiments" / "extensions.json"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", type=int, default=2005)
    args = ap.parse_args()
    warnings.simplefilter("ignore")
    H = 6
    am, ameta = R.acled_monthly()
    am["unrest"] = am["protests"] + am["riots"]
    am["violence"] = am["battles"] + am["explosions"] + am["vac"]
    info = am.groupby("country").agg(iso=("iso", "first"), region=("region", "first"))
    t_end = int(ameta["t_end"])
    panel, _ = build_panel(R.COUPDB, am[["country", "t"] + RAW_SERIES], info, t_end, H)
    ext = X.features(panel, t_end)
    panel = pd.concat([panel.drop(columns=[c for c in ext.columns if c in panel.columns]), ext], axis=1)
    print("copertura delle nuove variabili (quota di righe non mancanti, dal 2005):")
    recent = panel["year"] >= 2005
    for g, cols in X.EXT_GROUPS.items():
        print(f"  {g:8s}", {c: round(float(panel.loc[recent, c].notna().mean()), 2) for c in cols})

    specs = {"gbm_base": (M.make_gbm, ALL_FEATURES), "rf_base": (M.make_rf, ALL_FEATURES)}
    tags = {"base": []} | {g: X.EXT_GROUPS[g] for g in X.EXT_GROUPS} | {"tutte": X.ALL_EXT}
    for tag, extra in tags.items():
        specs[f"logit_{tag}"] = (M.make_logit, ALL_FEATURES + extra)
        specs[f"lgbm_{tag}"] = (make_lgbm, ALL_FEATURES + extra)
    M.FIRST_TEST_YEAR = args.start
    print(f"Validazione anno per anno dal {args.start} ({len(specs)} modelli)...")
    preds = M.walk_forward(panel, H, specs=specs)
    preds["ens_published"] = M.combine(preds, ["logit_base", "gbm_base", "rf_base"])
    preds["ens_plus_lgbm"] = M.combine(preds, ["logit_base", "gbm_base", "rf_base", "lgbm_base"])
    for tag in tags:
        preds[f"pair_{tag}"] = M.combine(preds, [f"logit_{tag}", f"lgbm_{tag}"])
    preds["ens_all_ext"] = M.combine(preds, ["logit_tutte", "gbm_base", "rf_base", "lgbm_tutte"])

    base_oos = panel["y_known"] & preds["ens_published"].notna() & preds["lgbm_tutte"].notna()
    windows = {"dal 2005": base_oos, "dal 2015 (tutte le fonti disponibili, GDELT compreso)": base_oos & (panel["year"] >= 2015)}
    result = {"generated": date.today().isoformat(), "first_test_year": args.start, "horizon": H, "windows": {},
              "coverage": {g: {c: round(float(panel.loc[recent, c].notna().mean()), 3) for c in cols} for g, cols in X.EXT_GROUPS.items()}}
    for wname, oos in windows.items():
        y, t, unit = panel.loc[oos, "y"], panel.loc[oos, "t"], panel.loc[oos, "unit"]
        w = {"n": int(oos.sum()), "positives": int(y.sum()), "models": {}, "comparisons": []}
        print(f"=== finestra {wname}: {w['n']} paese-mesi, {w['positives']} tentativi")
        for name in ["ens_published", "ens_plus_lgbm", "ens_all_ext", "gbm_base", "lgbm_base", "logit_base"] + [f"pair_{t_}" for t_ in tags]:
            w["models"][name] = M.score(y, preds.loc[oos, name], t)
        pairs = [("ens_plus_lgbm", "ens_published"), ("lgbm_base", "gbm_base"), ("ens_all_ext", "ens_published")] + [(f"pair_{g}", "pair_base") for g in tags if g != "base"]
        for a_, b_ in pairs:
            d = M.bootstrap_diff(y, preds.loc[oos, a_], preds.loc[oos, b_], unit)
            d["model"], d["versus"] = a_, b_
            w["comparisons"].append(d)
            print(f"  {a_:18s} vs {b_:15s}: dAUC {d['d_auc']:+.4f} {d['d_auc_ci']}  dPR {d['d_pr']:+.4f} {d['d_pr_ci']}  P(meglio) {d['p_better']}")
        for n_, s_ in w["models"].items():
            print(f"  {n_:16s} {s_}")
        result["windows"][wname] = w
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False))
    print(f"Scritto {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
