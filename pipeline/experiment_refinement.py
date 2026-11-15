"""Reproducible retrospective comparison; never changes the published forecast.

python pipeline/experiment_refinement.py
Requires a completed run.py validation with a matching content fingerprint.
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd
import model as M
from run import acled_monthly, COUPDB, WF_CACHE
from panel import build_panel
from data import RAW_SERIES


def main():
    am, meta = acled_monthly()
    info = am.groupby("country").agg(iso=("iso", "first"), region=("region", "first"))
    panel, _ = build_panel(COUPDB, am[["country", "t"] + RAW_SERIES], info, meta["t_end"], 6)
    cached = pd.read_pickle(WF_CACHE)
    if cached["sig"] != M.validation_signature(panel, 6):
        raise ValueError("Validation cache is stale; run pipeline/run.py first")
    preds = cached["preds"]
    raw = M.combine(preds, M.ENSEMBLE)
    adaptive, weights, history = M.combine_forward(panel, preds, 6)
    candidates = {
        "published": M.calibrate_forward(panel, raw, 6)[0],
        "adaptive_weights": M.calibrate_forward(panel, adaptive, 6)[0],
        "rolling_calibration": M.calibrate_forward(panel, raw, 6, window_years=20, regularization=1)[0],
        "arithmetic_rolling": M.calibrate_forward(panel, preds[M.ENSEMBLE].mean(axis=1, skipna=False), 6,
                                                 window_years=20, regularization=1)[0],
    }
    report = {"validation_signature": cached["sig"], "horizon": 6,
              "design": "Exploratory retrospective comparison, not an untouched test set. All fitting is chronological, with matured outcomes only.",
              "adaptive_weights": dict(zip(M.ENSEMBLE, weights.tolist())), "weight_history": history,
              "candidates": {}, "decision": "No automatic promotion. Inspect paired intervals and all periods before changing the published model."}
    for name, p in candidates.items():
        report["candidates"][name] = {}
        for year in (1975, 2000, 2015, 2020):
            mask = panel.y_known & p.notna() & panel.year.ge(year)
            scores = M.score(panel.loc[mask, "y"], p[mask], panel.loc[mask, "t"])
            # Keep unrounded errors to avoid reporting rounded ties as improvements.
            scores["brier_exact"] = float(np.mean((p[mask] - panel.loc[mask, "y"]) ** 2))
            report["candidates"][name][str(year)] = scores
        if name != "published":
            mask = panel.y_known & p.notna() & panel.year.ge(2015)
            report["candidates"][name]["paired_since_2015"] = M.bootstrap_diff(
                panel.loc[mask, "y"], p[mask], candidates["published"][mask], panel.loc[mask, "unit"])
        print(name, report["candidates"][name]["2015"], flush=True)
    path = Path(__file__).resolve().parents[1] / "data" / "experiments" / "refinement.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n")


if __name__ == "__main__":
    main()
