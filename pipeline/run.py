"""Pipeline completa: ACLED + golpe -> analisi storica -> modello -> webdata/*.json (dati del sito)

Uso:
    python pipeline/run.py            # dati veri in data/raw/ (se mancano si ferma)
    python pipeline/run.py --demo     # dati sintetici in data/demo/
    python pipeline/run.py --horizon 12
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
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_web import export as export_web  # noqa: E402
from data import (HIST_FEATURES, LABELS, add_acled_features, add_coup_features, load_acled,  # noqa: E402
                  load_coupdb, load_coups, monthly_panel, ord_label)

ROOT = Path(__file__).resolve().parents[1]
BURN_IN = 11          # mesi iniziali di ogni paese esclusi (finestre a 12 mesi incomplete)
MIN_TRAIN_YEARS = 6   # anni minimi di storia prima del primo anno di test


def logit():
    return make_pipeline(StandardScaler(), LogisticRegression(C=0.3, max_iter=2000))


def score(y, p, t):
    """Metriche fuori campione sulle previsioni aggregate."""
    y, p = np.asarray(y), np.asarray(p)
    if y.sum() == 0 or y.sum() == len(y):
        return None
    df = pd.DataFrame({"y": y, "p": p, "t": t})
    df["top"] = df.groupby("t")["p"].rank(pct=True, ascending=False) <= 0.10
    return {"auc": round(float(roc_auc_score(y, p)), 3),
            "pr_auc": round(float(average_precision_score(y, p)), 3),
            "brier": round(float(brier_score_loss(y, p)), 4),
            "top10_recall": round(float(df.loc[df.y == 1, "top"].mean()), 3)}


def walk_forward(panel, feature_sets):
    """Validazione a finestra espandibile: si addestra sul passato, si prova sull'anno dopo."""
    usable = panel[panel["age"] >= BURN_IN]
    years = usable["t"] // 12
    first_test = int(years.min()) + MIN_TRAIN_YEARS
    preds = {k: pd.Series(np.nan, index=panel.index) for k in feature_sets}
    for yr in range(first_test, int(years.max()) + 1):
        # in addestramento solo righe il cui esito era gia' noto prima dell'anno di test
        train = usable[(usable["t"] + panel.attrs["horizon"] < yr * 12)]
        test = usable[years == yr]
        if train["y"].sum() < 5 or test.empty:
            continue
        for k, (make, cols) in feature_sets.items():
            mdl = make().fit(train[cols], train["y"])
            preds[k].loc[test.index] = mdl.predict_proba(test[cols])[:, 1]
    return preds, first_test


def event_study(panel, coups_in, series, lo=-12, hi=6):
    """Attivita' ACLED attorno ai golpe, in deviazioni standard rispetto alla norma del paese."""
    z = panel[["country", "t"]].copy()
    for s in series:
        g = panel.groupby("country")[s]
        z[s] = (panel[s] - g.transform("mean")) / g.transform("std").replace(0, np.nan)
    z = z.set_index(["country", "t"])
    offs = list(range(lo, hi + 1))
    out = {s: [] for s in series}
    n = 0
    for k in offs:
        keys = [(c, t + k) for c, t in zip(coups_in["country"], coups_in["t"])]
        rows = z.reindex(keys)
        n = max(n, int(rows.notna().any(axis=1).sum()))
        for s in series:
            v = rows[s].mean()
            out[s].append(None if pd.isna(v) else round(float(v), 3))
    return {"offsets": offs, "series": out, "n": n}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true", help="usa i dati sintetici in data/demo/")
    ap.add_argument("--horizon", type=int, default=6, help="orizzonte di previsione in mesi")
    ap.add_argument("--coups", choices=["db", "pt"], default="db",
                    help="db = database unificato (data/coupdb), pt = solo Powell & Thyne")
    args = ap.parse_args()
    H = args.horizon

    base = ROOT / "data" / ("demo" if args.demo else "raw")
    acled_dir = base / "acled"
    coup_files = sorted(p for p in (base / "coups").glob("*") if p.suffix in (".csv", ".txt"))
    problems = []
    if not list(acled_dir.glob("*.csv")):
        problems.append(f"- nessun CSV ACLED in {acled_dir}  ->  python pipeline/fetch_acled.py")
    if not coup_files:
        problems.append(f"- nessun file dei golpe in {base / 'coups'}  ->  python pipeline/fetch_coups.py")
    if problems:
        sys.exit("Dati mancanti:\n" + "\n".join(problems) + "\nVedi README.md (oppure usa --demo).")
    coup_file = coup_files[-1]

    print("Carico ACLED...")
    ev = load_acled(acled_dir)
    panel, meta = monthly_panel(ev)
    countries = sorted(panel["country"].unique())
    coupdb = ROOT / "data" / "coupdb" / "coups.csv"
    use_db = args.coups == "db" and coupdb.exists() and not args.demo
    if use_db:
        coups, unmatched = load_coupdb(coupdb, countries, "A")
        coups_hist, _ = load_coupdb(coupdb, countries, "ABC")      # per i grafici storici, dal 1900
    else:
        coups, unmatched = load_coups(coup_file, countries)
        coups_hist = coups
    print("Golpe:", "database unificato" if use_db else "Powell & Thyne", f"({len(coups)} eventi)")
    panel = add_coup_features(panel, coups, H)
    panel, acled_feats = add_acled_features(panel)
    panel.attrs["horizon"] = H
    feats = acled_feats + HIST_FEATURES
    t_end = meta["t_end"]

    coups_in = coups.merge(panel[["country", "t"]], on=["country", "t"])   # golpe in copertura ACLED
    print(f"Panel: {len(panel):,} paese-mesi, {len(countries)} paesi, fino a {ord_label(t_end)}; "
          f"golpe in copertura ACLED: {len(coups_in)}")
    if unmatched:
        print("ATTENZIONE - golpe dal 1997 in paesi non trovati in ACLED (controlla i nomi):",
              ", ".join(unmatched))
    if len(coups_in) < 10:
        sys.exit("Troppo pochi golpe nel periodo coperto da ACLED per stimare un modello.")

    # ---------------- validazione fuori campione
    sets = {"logit": (logit, feats), "storia": (logit, HIST_FEATURES), "acled": (logit, acled_feats)}
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        preds, first_test = walk_forward(panel, sets)
    ok = panel["y_known"] & preds["logit"].notna()
    metrics = {k: score(panel.loc[ok, "y"], preds[k][ok], panel.loc[ok, "t"]) for k in sets}
    print("Validazione fuori campione:", json.dumps(metrics, indent=1))

    # ---------------- modello finale e previsione
    train = panel[(panel["age"] >= BURN_IN) & panel["y_known"]]
    final = logit().fit(train[feats], train["y"])
    scaler, lr = final.named_steps["standardscaler"], final.named_steps["logisticregression"]
    latest = panel[panel["t"] == t_end].copy()
    latest["risk"] = final.predict_proba(latest[feats])[:, 1]
    contrib = (scaler.transform(latest[feats]) * lr.coef_[0])
    latest["rank"] = latest["risk"].rank(ascending=False, method="first").astype(int)

    hist = preds["logit"].copy()
    hist.loc[latest.index] = latest["risk"]
    # mesi recenti senza previsione di validazione: si usa il modello finale (non li ha visti)
    gap = hist.isna() & ~panel["y_known"] & (panel["age"] >= BURN_IN)
    if gap.any():
        hist.loc[gap] = final.predict_proba(panel.loc[gap, feats])[:, 1]
    panel["risk_hist"] = hist

    def r(v, nd=4):
        return None if pd.isna(v) else round(float(v), nd)

    out_countries = []
    for i, (idx, row) in enumerate(latest.iterrows()):
        g = panel[panel["country"] == row["country"]]
        cc = coups[coups["country"] == row["country"]]
        order = np.argsort(-np.abs(contrib[i]))[:6]
        hstart = g["risk_hist"].first_valid_index()
        gh = g.loc[hstart:] if hstart is not None else g.iloc[0:0]
        prev = g.loc[g["t"] == t_end - 3, "risk_hist"]
        out_countries.append({
            "name": row["country"],
            "iso": None if pd.isna(row["iso"]) else f"{int(row['iso']):03d}",
            "region": row["region"],
            "risk": r(row["risk"], 5), "rank": int(row["rank"]),
            "risk_3m_ago": r(prev.iat[0], 5) if len(prev) else None,
            "drivers": [{"label": LABELS[feats[j]], "contrib": r(contrib[i][j], 3)} for j in order],
            "risk_hist": {"start": ord_label(int(gh["t"].iat[0])) if len(gh) else None,
                          "values": [r(v, 5) for v in gh["risk_hist"]]},
            "series": {"start": ord_label(int(g["t"].iat[0])),
                       "unrest": g["unrest"].astype(int).tolist(),
                       "violence": g["violence"].astype(int).tolist(),
                       "fatalities": g["fatalities"].astype(int).tolist(),
                       "infighting": g["infighting"].astype(int).tolist()},
            "coups": [{"date": ord_label(int(t)), "success": bool(s)}
                      for t, s in zip(cc["t"], cc["success"])],
        })
    out_countries.sort(key=lambda c: c["rank"])

    # ---------------- analisi storica
    per_year = (coups_hist.assign(year=coups_hist["year"].astype(int))
                .groupby(["year", "success"]).size().unstack(fill_value=0)
                .reindex(columns=[True, False], fill_value=0))
    yrs = range(int(coups_hist["year"].min()), t_end // 12 + 1)
    per_year = per_year.reindex(yrs, fill_value=0)
    top = (coups_hist.assign(name=coups_hist["country"].fillna(coups_hist["pt_name"]))
           .groupby("name").agg(attempts=("success", "size"), success=("success", "sum"))
           .sort_values(["attempts", "success"], ascending=False).head(15))
    by_region = (coups_in.merge(panel.groupby("country")["region"].first(), on="country")
                 .groupby("region").agg(attempts=("success", "size"), success=("success", "sum"))
                 .sort_values("attempts", ascending=False))
    factors = sorted(({"label": LABELS[f], "odds_ratio": round(float(np.exp(c)), 3)}
                      for f, c in zip(feats, lr.coef_[0])), key=lambda d: -abs(np.log(d["odds_ratio"])))

    result = {
        "meta": {
            "generated": date.today().isoformat(), "demo": bool(args.demo), "horizon": H,
            "data_start": meta["date_min"], "data_end": ord_label(t_end),
            "forecast_from": ord_label(t_end + 1), "forecast_to": ord_label(t_end + H),
            "n_events": meta["n_events"], "n_countries": len(countries),
            "n_coups_total": int(len(coups)), "n_coups_acled": int(len(coups_in)),
            "n_success_acled": int(coups_in["success"].sum()),
            "base_rate": r(train["y"].mean(), 5), "first_test_year": first_test,
            "n_oos": int(ok.sum()), "n_oos_pos": int(panel.loc[ok, "y"].sum()),
            "unmatched": unmatched, "coup_source": "db" if use_db else "pt",
            "history_from": int(coups_hist["year"].min()), "n_coups_history": int(len(coups_hist)),
        },
        "metrics": metrics,
        "countries": out_countries,
        "history": {
            "per_year": [{"year": int(y), "success": int(v[True]), "failed": int(v[False])}
                         for y, v in per_year.iterrows()],
            "top_countries": [{"name": n, "attempts": int(v.attempts), "success": int(v.success)}
                              for n, v in top.iterrows()],
            "by_region": [{"name": n, "attempts": int(v.attempts), "success": int(v.success)}
                          for n, v in by_region.iterrows()],
            "event_study": event_study(panel, coups_in, ["unrest", "violence", "fatalities", "infighting"]),
            "factors": factors,
        },
    }
    export_web(result, coupdb if use_db else None, ROOT / "webdata")
    print("Top 10 rischio:", ", ".join(f"{c['name']} {c['risk']:.1%}" for c in out_countries[:10]))


if __name__ == "__main__":
    main()
