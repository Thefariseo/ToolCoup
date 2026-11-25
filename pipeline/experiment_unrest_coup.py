"""Esperimento: la lettura del disordine politico migliora il modello dei golpe fuori campione?

Il modello dei golpe (pipeline/model.py) vede gia' i conteggi ACLED grezzi; qui si chiede se aggiungere la *previsione* di pipeline/unrest.py (probabilita' di
ondata di proteste e di escalation di violenza nei tre mesi seguenti, entrambe fuori campione dal 2019) ne migliora le probabilita' a sei mesi.

Il test e' uno stacking con pochi parametri, perche' i casi sono pochi (una cinquantina di mesi-evento dal 2019):

    p_ricalibrata = expit(a + b * z_golpe)                                   z_golpe = logit della probabilita' pubblicata dei golpe
    p_con_disordine = expit(a + b * z_golpe + w1 * z_ondata + w2 * z_escalation)      (z standardizzati sul solo periodo di addestramento)

a e b sono stimati senza penalita' (come la calibrazione di Platt del modello), w1 e w2 con una penalita' ridge fissa (lambda = 5) scelta prima di guardare i
risultati. Il confronto giusto e' con `p_ricalibrata`, non con la probabilita' pubblicata: cosi' l'eventuale guadagno non dipende dalla sola ricalibrazione.

Due schemi:
  forward   per l'anno Y si addestra sugli anni dal 2019 a Y-1 con esiti maturati prima di gennaio di Y (come in produzione); anni di prova 2022-2026
  loyo      leave-one-year-out sugli anni 2019-2026 (usa anche il futuro per addestrare: ottimistico, e' un limite superiore del guadagno)
Piu' un test di permutazione: gli stessi valori di disordine rimescolati tra paesi nello stesso mese, per vedere quanto "guadagno" nasce dal caso.

Regola (docs/unrest.md): lo stato del disordine entra nel modello dei golpe solo se, nello schema forward, il Brier e la perdita logaritmica migliorano
e l'AUC-PR non peggiora, con P(meglio) >= 0.9 sul ricampionamento dei paesi. L'esito va in data/experiments/unrest_coup.json.

Uso:  python pipeline/experiment_unrest_coup.py [--perms 100]
Non ricalcola la validazione dei golpe: usa la cache data/raw/walk_forward.pkl e si ferma se non corrisponde al panel.
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
from scipy.optimize import minimize
from scipy.special import expit

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as M  # noqa: E402
import run as R  # noqa: E402
import unrest as U  # noqa: E402
from countries import code_from_name  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "experiments" / "unrest_coup.json"
H, LAM = 6, 5.0
FIRST = U.FIRST_TEST_YEAR


def fit_stack(zb: np.ndarray, Z: np.ndarray, y: np.ndarray, lam: float = LAM) -> np.ndarray:
    """a + b * zb + Z w per massima verosimiglianza, ridge solo su w. Restituisce (a, b, w...)."""
    k = Z.shape[1]

    def f(th):
        a, b, w = th[0], th[1], th[2:]
        eta = a + b * zb + (Z @ w if k else 0.0)
        loss = np.logaddexp(0, eta).sum() - (y * eta).sum() + 0.5 * lam * float(w @ w)
        g = expit(eta) - y
        grad = np.concatenate([[g.sum(), (g * zb).sum()], (Z.T @ g + lam * w) if k else np.empty(0)])
        return loss, grad

    return minimize(f, np.concatenate([[0.0, 1.0], np.zeros(k)]), jac=True, method="L-BFGS-B").x


def predict(th: np.ndarray, zb: np.ndarray, Z: np.ndarray) -> np.ndarray:
    return expit(th[0] + th[1] * zb + (Z @ th[2:] if Z.shape[1] else 0.0))


def folds(d: pd.DataFrame, years: list[int], mode: str, permute: np.random.Generator | None = None) -> pd.DataFrame:
    """Previsioni fuori campione per gli anni di prova: pubblicata, ricalibrata, con disordine."""
    zcols = ["zw", "ze"]
    if permute is not None:                                    # rimescola il disordine tra paesi dello stesso mese (le due letture insieme): stessa distribuzione, nessuna informazione
        d = d.copy()
        idx = np.arange(len(d))
        for rows in d.groupby("t").indices.values():
            idx[rows] = rows[permute.permutation(len(rows))]
        d[zcols] = d[zcols].to_numpy()[idx]
    out = []
    for yr in years:
        te = d[d["year"] == yr]
        if mode == "forward":
            tr = d[(d["year"] < yr) & (d["t"] + H < yr * 12)]
        else:
            tr = d[(d["year"] != yr) & ~((d["year"] < yr) & (d["t"] + H >= yr * 12))]
        if te.empty or tr["y"].sum() < 10 or te["y"].sum() < 1:
            continue
        mu, sd = tr[zcols].mean().to_numpy(), tr[zcols].std().to_numpy()
        Ztr, Zte = ((tr[zcols].to_numpy() - mu) / sd), ((te[zcols].to_numpy() - mu) / sd)
        t0 = fit_stack(tr["zb"].to_numpy(), Ztr[:, :0], tr["y"].to_numpy())
        t1 = fit_stack(tr["zb"].to_numpy(), Ztr, tr["y"].to_numpy())
        r = te.assign(p_recal=predict(t0, te["zb"].to_numpy(), Zte[:, :0]), p_stack=predict(t1, te["zb"].to_numpy(), Zte), fold=yr)
        out.append(r.assign(w_wave=t1[2], w_esc=t1[3], n_train=len(tr), pos_train=int(tr["y"].sum())))
    return pd.concat(out) if out else pd.DataFrame()


def ll(y: np.ndarray, p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-9, 1 - 1e-9)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def country_bootstrap(r: pd.DataFrame, a: str, b: str, reps: int = 400, seed: int = 0) -> dict:
    """Differenza a - b di perdita logaritmica e Brier, ricampionando i paesi; negativo = a migliora."""
    rng = np.random.default_rng(seed)
    y, pa, pb = r["y"].to_numpy(), r[a].to_numpy(), r[b].to_numpy()
    ids = pd.Series(np.arange(len(r))).groupby(r["unit"].to_numpy()).apply(lambda s: s.to_numpy())
    keys = ids.index.to_numpy()
    dl, db = [], []
    for _ in range(reps):
        idx = np.concatenate([ids[k] for k in rng.choice(keys, len(keys))])
        dl.append(float(np.mean(ll(y[idx], pa[idx]) - ll(y[idx], pb[idx]))))
        db.append(float(np.mean((pa[idx] - y[idx]) ** 2 - (pb[idx] - y[idx]) ** 2)))
    q = lambda v: [float(np.quantile(v, k)) for k in (0.05, 0.95)]
    return {"d_logloss": float(np.mean(ll(y, pa) - ll(y, pb))), "d_logloss_ci": q(dl), "p_logloss_better": float(np.mean(np.array(dl) < 0)),
            "d_brier": float(np.mean((pa - y) ** 2 - (pb - y) ** 2)), "d_brier_ci": q(db), "p_brier_better": float(np.mean(np.array(db) < 0))}


def summarise(r: pd.DataFrame) -> dict:
    y = r["y"].to_numpy()
    s = {k: M.score(y, r[k], r["t"]) for k in ("base", "p_recal", "p_stack")}
    cmp_ = country_bootstrap(r, "p_stack", "p_recal")
    cmp_.update({k: v for k, v in M.bootstrap_diff(y, r["p_stack"], r["p_recal"], r["unit"], reps=300).items() if k in ("d_auc", "d_auc_ci", "d_pr", "d_pr_ci", "p_better")})
    return {"n": int(len(r)), "positives": int(y.sum()), "years": sorted(int(v) for v in r["fold"].unique()), "scores": s, "stack_vs_recal": cmp_,
            "mean_weights": {"wave": round(float(r.groupby("fold")["w_wave"].first().mean()), 3), "escalation": round(float(r.groupby("fold")["w_esc"].first().mean()), 3)},
            "weights_by_year": {int(k): [round(float(a), 3), round(float(b), 3)] for k, (a, b) in r.groupby("fold")[["w_wave", "w_esc"]].first().iterrows()}}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--perms", type=int, default=100)
    args = ap.parse_args()
    warnings.simplefilter("ignore")

    # ---- coup model: panel, cached walk-forward predictions, published (calibrated) ensemble
    am, ameta, info, t_end, panel, pinfo = R.build_inputs(H)
    cache = pd.read_pickle(R.WF_CACHE)
    if not cache["preds"].index.equals(panel.index):
        sys.exit("La cache della validazione dei golpe non corrisponde al panel: eseguire prima pipeline/run.py")
    base, _ = M.calibrate_forward(panel, M.combine(cache["preds"], M.ENSEMBLE), H)

    # ---- unrest model: out-of-sample log-odds of the two events, by country and month
    mats, region, _ = U.monthly_matrices()
    cols = list(mats["u"].columns)
    ccodes = pd.Series({c: code_from_name(c) for c in cols})
    F, _G = U.features(mats, region, U.neighbours(U.centroids(cols)), U.country_years(), ccodes)
    df = U.long_frame(F, U.targets(mats), mats)
    zs = {}
    for name in ("wave", "escalation"):
        p = U.run_validation(df, list(F), name, log=lambda *a, **k: None)
        zs[name] = M.logit_(p["ensemble_raw"].to_numpy())       # il logaritmo dell'odds della media non calibrata: niente salto di livello quando parte la calibrazione
    u = pd.DataFrame({"unit": df["country"].map(pinfo["unit_of_acled"]).to_numpy(), "t": df["t"].to_numpy(), "zw": zs["wave"], "ze": zs["escalation"]})
    u = u.dropna(subset=["unit"]).drop_duplicates(["unit", "t"]).set_index(["unit", "t"])
    zz = u.reindex(pd.MultiIndex.from_arrays([panel["unit"].to_numpy(), panel["t"].to_numpy()]))

    d = pd.DataFrame({"unit": panel["unit"].to_numpy(), "t": panel["t"].to_numpy(), "year": panel["year"].to_numpy(), "y": panel["y"].to_numpy(),
                      "known": panel["y_known"].to_numpy(), "base": base.to_numpy(), "zw": zz["zw"].to_numpy(), "ze": zz["ze"].to_numpy()})
    d = d[d["known"] & d["base"].notna() & d["zw"].notna() & d["ze"].notna() & (d["year"] >= FIRST)].copy()
    d["zb"] = M.logit_(d["base"].to_numpy())
    last = int(d["year"].max())
    print(f"Paese-mesi con tutte le letture: {len(d):,}, mesi con un tentativo nei sei mesi seguenti: {int(d['y'].sum())}, anni {FIRST}-{last}")

    result = {"generated": date.today().isoformat(), "horizon_months": H, "ridge_lambda": LAM, "rows": int(len(d)), "positives": int(d["y"].sum()),
              "rule": "adopt only if, in the forward scheme, Brier and log loss improve over the recalibrated model, AUC-PR does not worsen, and P(better) >= 0.9 over country resamples"}
    for mode, years in (("forward", list(range(2022, last + 1))), ("loyo", list(range(FIRST, last + 1)))):
        r = folds(d, years, mode)
        if r.empty:
            continue
        s = summarise(r)
        result[mode] = s
        c = s["stack_vs_recal"]
        print(f"[{mode}] n={s['n']:,} eventi={s['positives']}: "
              f"Brier {c['d_brier'] * 1e3:+.4f}e-3 [{c['d_brier_ci'][0] * 1e3:+.4f}, {c['d_brier_ci'][1] * 1e3:+.4f}] P={c['p_brier_better']:.2f}; "
              f"log loss {c['d_logloss'] * 1e3:+.4f}e-3 P={c['p_logloss_better']:.2f}; dAUC-PR {c['d_pr']:+.3f} dAUC {c['d_auc']:+.3f}; pesi medi {s['mean_weights']}")
        if mode == "forward":
            obs = c["d_logloss"]
            rng = np.random.default_rng(1)
            null = []
            for _ in range(args.perms):
                rp = folds(d, years, mode, permute=rng)
                null.append(float(np.mean(ll(rp["y"].to_numpy(), rp["p_stack"].to_numpy()) - ll(rp["y"].to_numpy(), rp["p_recal"].to_numpy()))))
            result["forward"]["permutation"] = {"perms": args.perms, "observed_d_logloss": obs, "null_mean": float(np.mean(null)), "null_q05": float(np.quantile(null, .05)),
                                               "p_value": float(np.mean(np.array(null) <= obs))}
            print(f"  permutazione: osservato {obs * 1e3:+.4f}e-3, nullo medio {np.mean(null) * 1e3:+.4f}e-3, p = {result['forward']['permutation']['p_value']:.2f}")

    f = result.get("forward")
    if f:
        c = f["stack_vs_recal"]
        result["adopt"] = bool(c["d_brier"] < 0 and c["d_logloss"] < 0 and c["d_pr"] >= 0 and c["p_brier_better"] >= 0.9 and c["p_logloss_better"] >= 0.9)
        print("Adozione nel modello dei golpe:", "SI" if result["adopt"] else "NO")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Scritto {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
