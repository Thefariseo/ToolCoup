"""Esperimento: i segnali di innesco (testo ACLED) e il calendario elettorale migliorano la previsione?

Confronto a parita' di tutto il resto, fuori campione, anno per anno dal 2005:
    base      le 58 variabili del modello pubblicato
    +inneschi base + segnali di innesco (pipeline/triggers.py)
    +elezioni base + elezioni nazionali nei 6 mesi successivi / precedenti
    +entrambi

Il modello pubblicato NON viene toccato: l'esito va in data/experiments/triggers.json e decide se le
nuove variabili entrano nell'edizione successiva del registro.

Uso:  python pipeline/experiment_triggers.py [--from 2005]
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
from sklearn.metrics import roc_auc_score

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as M  # noqa: E402
import run as R  # noqa: E402
import triggers as T  # noqa: E402
from countries import code_from_name  # noqa: E402
from data import RAW_SERIES  # noqa: E402
from panel import ALL_FEATURES, build_panel  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
ELECTIONS = ROOT / "data" / "raw" / "elections" / "elections.csv"
OUT = ROOT / "data" / "experiments" / "triggers.json"
ELECTION_FEATURES = ["l_election_next6", "l_election_last6"]


def election_features(panel: pd.DataFrame) -> pd.DataFrame:
    e = pd.read_csv(ELECTIONS)
    e = e[e["type"].isin(["executive", "legislative", "general"])].copy()
    e["unit"] = e["country"].map(code_from_name)
    e = e.dropna(subset=["unit"]).astype({"unit": int})
    d = pd.to_datetime(e["date"])
    e["t"] = d.dt.year * 12 + d.dt.month - 1
    years = sorted(d.dt.year.unique())
    times = {u: np.sort(g["t"].to_numpy()) for u, g in e.groupby("unit")}
    nxt, last = np.full(len(panel), np.nan), np.full(len(panel), np.nan)
    tt, covered = panel["t"].to_numpy(), panel["year"].isin(years).to_numpy() & (panel["unit"] > 0).to_numpy()
    for u, idx in panel.groupby("unit").indices.items():
        a, t = times.get(u, np.array([], dtype=int)), tt[idx]
        nxt[idx] = (np.searchsorted(a, t + 6, side="right") - np.searchsorted(a, t, side="right")) > 0
        last[idx] = (np.searchsorted(a, t, side="right") - np.searchsorted(a, t - 6, side="right")) > 0
    out = pd.DataFrame({"l_election_next6": nxt, "l_election_last6": last}, index=panel.index)
    out[~covered] = np.nan
    return out


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
    panel, pinfo = build_panel(R.COUPDB, am[["country", "t"] + RAW_SERIES], info, t_end, H)

    first = am.groupby("country")["t"].min()
    grid = pd.DataFrame([(c, t) for c, t0 in first.items() for t in range(int(t0), t_end + 1)], columns=["country", "t"])
    trig = T.features(T.monthly(), grid)
    trig["unit"] = trig["country"].map(pinfo["unit_of_acled"])
    panel = panel.merge(trig[["unit", "t"] + T.FEATURES], on=["unit", "t"], how="left")
    panel[ELECTION_FEATURES] = election_features(panel) if ELECTIONS.exists() else np.nan

    specs = {}
    for tag, extra in (("base", []), ("trig", T.FEATURES), ("elec", ELECTION_FEATURES), ("both", T.FEATURES + ELECTION_FEATURES)):
        for name, make in (("logit", M.make_logit), ("gbm", M.make_gbm), ("rf", M.make_rf)):
            specs[f"{name}_{tag}"] = (make, ALL_FEATURES + extra)
    M.FIRST_TEST_YEAR = args.start
    print(f"Validazione anno per anno dal {args.start} ({len(specs)} modelli)...")
    preds = M.walk_forward(panel, H, specs=specs)
    for tag in ("base", "trig", "elec", "both"):
        preds[tag] = M.combine(preds, [f"{m}_{tag}" for m in ("logit", "gbm", "rf")])

    oos = panel["y_known"] & preds["base"].notna()
    windows = {"trigger coverage": oos & panel["g_any_6m"].notna(), "election coverage": oos & panel["l_election_next6"].notna()}
    result = {"generated": date.today().isoformat(), "first_test_year": args.start, "horizon": H, "windows": {}, "signals": []}
    for wname, mask in windows.items():
        y, t, unit = panel.loc[mask, "y"], panel.loc[mask, "t"], panel.loc[mask, "unit"]
        w = {"n": int(mask.sum()), "pos": int(y.sum()), "models": {}, "comparisons": []}
        for tag in ("base", "trig", "elec", "both"):
            w["models"][tag] = M.score(y, preds.loc[mask, tag], t)
        for tag in ("trig", "elec", "both"):
            d = M.bootstrap_diff(y, preds.loc[mask, tag], preds.loc[mask, "base"], unit)
            d["model"] = tag
            w["comparisons"].append(d)
            print(f"  [{wname}] {tag:5s} vs base: dAUC {d['d_auc']:+.3f} {d['d_auc_ci']}  dPR {d['d_pr']:+.3f} {d['d_pr_ci']}  P(meglio) {d['p_better']}")
        result["windows"][wname] = w

    # ogni segnale preso da solo: quanto spesso segue un tentativo quando e' acceso e quando e' spento
    for f in T.FEATURES + ELECTION_FEATURES:
        mask = oos & panel[f].notna()
        on = mask & (panel[f] > 0)
        y = panel.loc[mask, "y"]
        row = {"feature": f, "label": T.LABELS.get(f, f), "n": int(mask.sum()), "n_on": int(on.sum()),
               "rate_on": round(float(panel.loc[on, "y"].mean()), 4) if on.any() else None,
               "rate_off": round(float(panel.loc[mask & ~on, "y"].mean()), 4),
               "auc": round(float(roc_auc_score(y, panel.loc[mask, f])), 3) if 0 < y.sum() < len(y) else None}
        # a parita' di rischio strutturale: tasso osservato / tasso previsto dal modello base quando il segnale e' acceso
        exp = float(preds.loc[on, "base"].mean()) if on.any() else None
        row["lift_vs_base_model"] = round(row["rate_on"] / exp, 2) if exp and row["rate_on"] is not None else None
        result["signals"].append(row)
        print(f"  {f:18s} acceso {row['n_on']:6d}/{row['n']:6d}  tasso {row['rate_on']} vs {row['rate_off']}  "
              f"AUC {row['auc']}  osservato/previsto {row['lift_vs_base_model']}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False))
    print(f"Scritto {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
