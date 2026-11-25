"""Esperimento: un Temporal Fusion Transformer batte LightGBM sul disordine politico?

Stessa disciplina del resto della validazione: ogni anno e' previsto da modelli addestrati sui soli mesi il cui esito era noto prima di gennaio,
standardizzazione stimata sul solo passato, calibrazione di Platt a finestra espandibile, intervalli al 90% da ricampionamento dei paesi.

Confronta, sui due eventi di pipeline/unrest.py (ondata di proteste, escalation di violenza a tre mesi), dal 2019:
    persistence   il rapporto tra l'ultimo trimestre e l'anno (linea di base)
    logit, lgbm   i due modelli del flusso mensile, e la loro media calibrata (`ensemble`, il modello pubblicato)
    tft           Temporal Fusion Transformer (pipeline/tft.py), media di piu' semi
    ensemble+tft  media dei log-odds dell'insieme pubblicato e del TFT
Piu' le previsioni probabilistiche dei conteggi a 3 mesi: TFT contro LightGBM a quantili (pinball sui quantili 10/50/90 del logaritmo).

Regola di adozione (docs/unrest.md): il TFT entra nel flusso mensile solo se `ensemble+tft` migliora `ensemble` su entrambi gli eventi in AUC-PR e in Brier
(punto stimato) con P(meglio) >= 0.9 (la quota dei ricampionamenti dei paesi in cui l'AUC migliora). Altrimenti resta qui, documentato. L'esito va in data/experiments/unrest.json.

Uso:  python pipeline/experiment_unrest.py [--seeds 3] [--epochs 12] [--only-year 2024]
Richiede PyTorch (pip install -r pipeline/requirements-experiments.txt).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import warnings
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.special import expit

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as M  # noqa: E402
import unrest as U  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "experiments" / "unrest.json"
CACHE = ROOT / "data" / "raw" / "tft_cache.pkl"          # uscite del TFT per anno di prova (data/raw non e' nel repository)
W, H6 = 12, 6
PAST = ["l_u1", "l_u3", "l_u6", "l_u12", "l_u24", "l_riots3", "riot_share3", "sd_u6", "l_v3", "l_v6", "l_v12", "l_f3", "repress_share6", "l_arrests3",
        "l_strategic3", "l_state_vs_civ3", "l_infight6", "nb_l_u3", "nb_surge", "reg_surge", "glob_surge", "surge_now", "v_surge_now"]
STATIC = ["v2x_polyarchy", "v2x_libdem", "v2x_civlib", "e_log_pop", "e_log_gdppc", "e_log_infmort"]


def tensors_for(df, F, mats, region, rows, mean_std, t_known_until):
    """Tensori per le righe `rows` di `df`. Esiti noti solo fino al mese t_known_until (escluso): niente futuro nell'addestramento."""
    import torch
    t = df.loc[rows, "t"].to_numpy(); c = df.loc[rows, "country"].map({k: i for i, k in enumerate(mats["u"].columns)}).to_numpy()
    ts0 = int(mats["u"].index[0])
    cube = np.stack([F[k].to_numpy() for k in PAST], axis=-1).astype(np.float32)          # (T, C, D)
    mu, sd = mean_std
    win = (t[:, None] - ts0) - np.arange(W - 1, -1, -1)[None, :]
    past = np.nan_to_num((cube[win, c[:, None], :] - mu) / sd, nan=0.0).astype(np.float32)
    mo = (t[:, None] + np.arange(1, H6 + 1)[None, :]) % 12
    known = np.stack([np.sin(2 * np.pi * mo / 12), np.cos(2 * np.pi * mo / 12)], axis=-1).astype(np.float32)
    stat = np.stack([F[k].to_numpy()[t - ts0, c] for k in STATIC], axis=-1).astype(np.float32)
    smu, ssd = mean_std_static
    stat = np.nan_to_num((stat - smu) / ssd, nan=0.0).astype(np.float32)
    reg = region.reindex(mats["u"].columns).fillna("?"); codes = {r: i for i, r in enumerate(sorted(reg.unique()))}
    region_idx = reg.map(codes).to_numpy()[c]
    out = {"past": torch.tensor(past), "known": torch.tensor(known), "static": torch.tensor(stat), "region": torch.tensor(region_idx, dtype=torch.long)}
    # esiti: log1p(conteggio a t+h) - log1p(media a 12 mesi), per proteste (0) e violenza (1)
    y_q = np.zeros((len(rows), H6, 2), dtype=np.float32); m_q = np.zeros_like(y_q)
    base = np.stack([np.log1p(np.nan_to_num(np.exp(F["l_u12"].to_numpy()[t - ts0, c]) - 1)), np.log1p(np.nan_to_num(np.exp(F["l_v12"].to_numpy()[t - ts0, c]) - 1))], axis=-1)
    for h in range(1, H6 + 1):
        ok = (t + h) < t_known_until
        for s, key in enumerate(("u", "v")):
            arr = mats[key].to_numpy()
            idx = np.clip(t + h - ts0, 0, arr.shape[0] - 1)
            val = arr[idx, c]
            good = ok & np.isfinite(val)
            y_q[:, h - 1, s] = np.where(good, np.log1p(np.nan_to_num(val)) - base[:, s], 0.0)
            m_q[:, h - 1, s] = good
    y_e = np.stack([df.loc[rows, "y_wave"].to_numpy(), df.loc[rows, "y_escalation"].to_numpy()], axis=-1)
    m_e = np.isfinite(y_e) & ((t[:, None] + U.HORIZON) < t_known_until)
    out.update({"y_q": torch.tensor(y_q), "m_q": torch.tensor(m_q), "y_e": torch.tensor(np.nan_to_num(y_e).astype(np.float32)), "m_e": torch.tensor(m_e.astype(np.float32))})
    return out


def pinball_np(q, y, mask):
    qs = np.array([0.1, 0.5, 0.9])
    e = y[..., None] - q
    return float((np.maximum(qs * e, (qs - 1) * e) * mask[..., None]).sum() / (mask.sum() * 3))


def main() -> None:
    global mean_std_static
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--dim", type=int, default=24)
    ap.add_argument("--only-year", type=int, default=None, help="prova rapida: solo un anno di test")
    ap.add_argument("--no-write", action="store_true")
    ap.add_argument("--from-cache", action="store_true", help="salta l'addestramento e rifa solo i confronti con le uscite salvate dell'ultima esecuzione")
    args = ap.parse_args()
    warnings.simplefilter("ignore")
    import torch
    import tft as T
    torch.set_num_threads(4)
    from countries import code_from_name
    mats, region, t_end = U.monthly_matrices()
    cols = list(mats["u"].columns)
    F, G = U.features(mats, region, U.neighbours(U.centroids(cols)), U.country_years(), pd.Series({c: code_from_name(c) for c in cols}))
    Y = U.targets(mats)
    df = U.long_frame(F, Y, mats)
    feats = list(F)
    print(f"{len(df):,} paese-mesi, {len(cols)} paesi; esperimento dal {U.FIRST_TEST_YEAR}")

    base_preds = {n: U.run_validation(df, feats, n, log=lambda s: None) for n in U.TARGET_TEXT}
    n_regions = len(set(region.reindex(cols).fillna("?")))
    tft_raw = {n: pd.Series(np.nan, index=df.index) for n in U.TARGET_TEXT}
    quant = {"tft": [], "lgbm": [], "naive": []}
    years = [args.only_year] if args.only_year else list(range(U.FIRST_TEST_YEAR, t_end // 12 + 1))
    ts0 = int(mats["u"].index[0])
    cached = pd.read_pickle(CACHE) if args.from_cache and CACHE.exists() else None
    if cached is not None:
        tft_raw, quant, years = cached["tft_raw"], cached["quant"], []
        print("Riuso le uscite del TFT salvate", CACHE.name)
    for yr in years:
        t0 = time.time()
        train_rows = df.index[(df["t"] + 3 < yr * 12)]
        test_rows = df.index[df["year"] == yr]
        if len(train_rows) < 2000 or not len(test_rows):
            continue
        cube = np.stack([F[k].to_numpy() for k in PAST], axis=-1).astype(np.float32)
        tr_t = df.loc[train_rows, "t"].to_numpy() - ts0
        mu = np.nanmean(cube[:tr_t.max() + 1].reshape(-1, len(PAST)), axis=0); sd = np.nanstd(cube[:tr_t.max() + 1].reshape(-1, len(PAST)), axis=0) + 1e-6
        stc = np.stack([F[k].to_numpy()[:tr_t.max() + 1] for k in STATIC], axis=-1).reshape(-1, len(STATIC))
        mean_std_static = (np.nanmean(stc, axis=0), np.nanstd(stc, axis=0) + 1e-6)
        tr = tensors_for(df, F, mats, region, train_rows, (mu, sd), yr * 12)
        te = tensors_for(df, F, mats, region, test_rows, (mu, sd), 10 ** 9)
        ev_logits, qlist = [], []
        for seed in range(args.seeds):
            net = T.TFT(len(PAST), 2, len(STATIC), n_regions, H6, d=args.dim)
            T.fit(net, tr, epochs=args.epochs, seed=seed)
            q, ev = T.predict(net, te)
            ev_logits.append(ev); qlist.append(q)
        ev = np.mean(ev_logits, axis=0); q = np.mean(qlist, axis=0)
        for k, n in enumerate(U.TARGET_TEXT):
            tft_raw[n].loc[test_rows] = expit(ev[:, k])
        # conteggi a 3 mesi: TFT contro LightGBM a quantili e contro la persistenza, sulle righe con esito noto
        h = 3
        yq, mq = te["y_q"].numpy()[:, h - 1, :], te["m_q"].numpy()[:, h - 1, :]
        arr_u, tt = mats["u"].to_numpy(), df.loc[test_rows, "t"].to_numpy()
        col_of = {c: i for i, c in enumerate(cols)}
        known = np.isfinite(arr_u[np.clip(tt + h - ts0, 0, arr_u.shape[0] - 1), [col_of[c] for c in df.loc[test_rows, "country"]]]) & (tt + h <= t_end)
        mq = mq * known[:, None]
        quant["tft"].append((pinball_np(q[:, h - 1], yq, mq), float(mq.sum())))
        import lightgbm as lgb
        pq = np.zeros(yq.shape + (3,))
        tr_known = tr["m_q"].numpy()[:, h - 1, :]
        for s in range(2):
            ok = tr_known[:, s] > 0
            Xtr = np.column_stack([df.loc[train_rows[ok], feats].to_numpy()])
            Xte = df.loc[test_rows, feats].to_numpy()
            for j, a in enumerate((0.1, 0.5, 0.9)):
                m = lgb.LGBMRegressor(objective="quantile", alpha=a, n_estimators=200, learning_rate=0.05, num_leaves=15, min_child_samples=60, subsample=0.8,
                                      subsample_freq=1, colsample_bytree=0.8, verbose=-1, random_state=0, n_jobs=-1).fit(Xtr, tr["y_q"].numpy()[ok, h - 1, s])
                pq[:, s, j] = m.predict(Xte)
        quant["lgbm"].append((pinball_np(pq, yq, mq), float(mq.sum())))
        naive = np.zeros_like(pq)                               # persistenza: la mediana e' l'ultimo trimestre; i quantili vengono dai residui dello stesso addestramento
        base_tr = tr["y_q"].numpy()[:, h - 1, :]
        for s in range(2):
            ok = tr_known[:, s] > 0
            res = base_tr[ok, s]
            naive[:, s, :] = np.quantile(res, (0.1, 0.5, 0.9))
        quant["naive"].append((pinball_np(naive, yq, mq), float(mq.sum())))
        print(f"  {yr}: TFT {args.seeds} semi in {time.time() - t0:.0f}s; pinball 3 mesi: TFT {quant['tft'][-1][0]:.4f}  LightGBM {quant['lgbm'][-1][0]:.4f}  base {quant['naive'][-1][0]:.4f}", flush=True)

    if cached is None and not args.only_year:
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        pd.to_pickle({"tft_raw": tft_raw, "quant": quant}, CACHE)
    result = {"generated": date.today().isoformat(), "first_test_year": U.FIRST_TEST_YEAR, "seeds": args.seeds, "epochs": args.epochs, "dim": args.dim,
              "window_months": W, "targets": {}, "pinball_3_months": {}}
    for k in quant:
        w = np.array([x[1] for x in quant[k]]); v = np.array([x[0] for x in quant[k]])
        result["pinball_3_months"][k] = round(float((v * w).sum() / w.sum()), 5) if w.sum() else None
    print("Pinball a 3 mesi (log del rapporto con l'anno), minore e' meglio:", result["pinball_3_months"])
    for name in U.TARGET_TEXT:
        df_ = df.copy(); preds = base_preds[name].copy()
        panel = df_.assign(y=df_["y_" + name], unit=df_["country"], y_known=df_["y_" + name].notna())
        preds["tft_raw"] = tft_raw[name]
        preds["tft"], _ = M.calibrate_forward(panel, preds["tft_raw"], U.HORIZON, min_years=3)
        preds["ens_tft_raw"] = M.combine(preds.assign(a=preds["ensemble_raw"], b=preds["tft_raw"]), ["a", "b"])
        preds["ens_tft"], _ = M.calibrate_forward(panel, preds["ens_tft_raw"], U.HORIZON, min_years=3)
        y = df_["y_" + name]
        mask = y.notna() & (df_["year"] >= U.FIRST_TEST_YEAR) & preds["ens_tft"].notna() & preds["tft"].notna() & preds["ensemble"].notna()
        block = {"n": int(mask.sum()), "positives": int(y[mask].sum()), "models": {}, "comparisons": []}
        for key in ("persistence", "logit", "lgbm_cal", "ensemble", "tft", "ens_tft"):
            s = M.score(y[mask], preds.loc[mask, key], df_.loc[mask, "t"])
            if key == "persistence":
                s = {k: v for k, v in s.items() if k in ("auc", "pr_auc", "top10_recall", "top10_lift")}
            block["models"][key] = s
            print(f"  [{name}] {key:12s} AUC {s['auc']:.3f}  PR {s['pr_auc']:.3f}  BrierSk {s.get('brier_skill', float('nan')):+.3f}  top10 {s['top10_recall']:.3f}")
        for a, b in (("ens_tft", "ensemble"), ("tft", "lgbm_cal"), ("tft", "ensemble")):
            d = M.bootstrap_diff(y[mask], preds.loc[mask, a], preds.loc[mask, b], df_.loc[mask, "country"], reps=300)
            d["model"], d["versus"] = a, b
            block["comparisons"].append(d)
            print(f"  [{name}] {a} vs {b}: dAUC {d['d_auc']:+.4f} {d['d_auc_ci']}  dPR {d['d_pr']:+.4f} {d['d_pr_ci']}  dBrier {d['d_brier']:+.6f} {d['d_brier_ci']}  P(meglio) {d['p_better']}")
        c = block["comparisons"][0]
        block["adopt_tft"] = bool(c["d_pr"] is not None and c["d_pr"] > 0 and c["d_brier"] < 0 and c["p_better"] >= 0.9)
        result["targets"][name] = block
    result["adopt_tft"] = all(b["adopt_tft"] for b in result["targets"].values())
    print("TFT adottato:", result["adopt_tft"])
    if not args.no_write:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False))
        print(f"Scritto {OUT.relative_to(ROOT)}")


mean_std_static = None

if __name__ == "__main__":
    main()
