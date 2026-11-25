"""Insieme di modelli per il rischio di golpe, con validazione fuori campione.

Impostazione ripresa dalla letteratura sulla previsione di eventi politici rari:
  - piu' modelli diversi combinati in un insieme (Ward & Beger; ViEWS), invece di un solo modello;
  - validazione a finestra espandibile: ogni anno e' previsto con modelli addestrati solo sul passato;
  - valutazione con AUC-PR e Brier oltre all'AUC-ROC, perche' l'evento e' raro;
  - calibrazione delle probabilita' stimata anch'essa solo sul passato;
  - confronti per sottrazione: quanto aggiunge ogni gruppo di variabili rispetto alla sola storia.

Componenti dell'insieme:
  logit   regressione logistica regolarizzata (lineare, leggibile)
  gbm     gradient boosting su alberi (non linearita' e interazioni)
  rf      foresta casuale
  lgbm    LightGBM: alberi a crescita per foglia, valori mancanti nativi (pipeline/lgbm.py); dall'edizione 2026-12
  storia_contagio  regressione logistica sulla sola storia golpista del paese e sul contagio (14 variabili); dall'edizione 2026-12.
          Non porta informazione nuova ma poca varianza: nelle prove fuori campione i modelli con tutte le variabili non battono
          chiaramente questo (docs/extensions.md, sezione "Quinto membro"), e mescolarli migliora il rango dei casi piu' rischiosi.
"""
from __future__ import annotations

import warnings
import hashlib
import inspect
import json

import numpy as np
import pandas as pd
import sklearn
from scipy.optimize import minimize
from scipy.special import expit
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from lgbm import make_lgbm
from panel import ALL_FEATURES, FEATURE_LABELS, GROUP_LABELS, GROUPS

FIRST_TEST_YEAR = 1975
MIN_CAL_YEARS = 8          # anni di previsioni fuori campione necessari prima di calibrare
EPS = 1e-6


def make_logit():
    return make_pipeline(SimpleImputer(strategy="median", add_indicator=True), StandardScaler(),
                         LogisticRegression(C=0.05, max_iter=1000))


def make_gbm():
    return HistGradientBoostingClassifier(max_iter=220, learning_rate=0.05, max_depth=3, min_samples_leaf=80,
                                          l2_regularization=1.0, random_state=0)


def make_rf(n_estimators=200):
    return make_pipeline(SimpleImputer(strategy="median"),
                         RandomForestClassifier(n_estimators=n_estimators, min_samples_leaf=25, max_features=0.25,
                                                max_samples=0.3, n_jobs=-1, random_state=0))


def feats(*groups: str) -> list[str]:
    return [f for g in groups for f in GROUPS[g]]


NO_ACLED = [g for g in GROUPS if g != "acled"]
# nome -> (costruttore, variabili). I primi quattro e `storia_contagio` formano l'insieme pubblicato (dall'edizione 2026-12; prima erano tre).
SPECS = {
    "logit": (make_logit, ALL_FEATURES),
    "gbm": (make_gbm, ALL_FEATURES),
    "rf": (make_rf, ALL_FEATURES),
    "lgbm": (make_lgbm, ALL_FEATURES),
    # confronti
    "storia": (make_logit, feats("storia")),
    "storia_contagio": (make_logit, feats("storia", "contagio", "tempo")),
    "logit_noacled": (make_logit, feats(*NO_ACLED)),
    "gbm_noacled": (make_gbm, feats(*NO_ACLED)),
    "rf_noacled": (make_rf, feats(*NO_ACLED)),
    "lgbm_noacled": (make_lgbm, feats(*NO_ACLED)),      # stessa composizione dell'insieme, senza ACLED: il confronto isola i segnali ACLED
}
ENSEMBLE = ["logit", "gbm", "rf", "lgbm", "storia_contagio"]
ENSEMBLE_NOACLED = ["logit_noacled", "gbm_noacled", "rf_noacled", "lgbm_noacled", "storia_contagio"]     # il quinto membro non usa ACLED
ENSEMBLE_FOUR = ["logit", "gbm", "rf", "lgbm"]          # l'insieme con LightGBM ma senza il modello della storia, per il confronto
ENSEMBLE_THREE = ["logit", "gbm", "rf"]                 # l'insieme delle edizioni fino al 2026-11, per il confronto con e senza LightGBM


def logit_(p):
    p = np.clip(p, EPS, 1 - EPS)
    return np.log(p / (1 - p))


def combine(preds: pd.DataFrame, members: list[str], weights=None) -> pd.Series:
    """Media dei log-odds dei modelli componenti."""
    return pd.Series(expit(np.average([logit_(preds[m].to_numpy()) for m in members], axis=0, weights=weights)), index=preds.index)


def validation_signature(panel, horizon, specs=None):
    """Fingerprint all input values, estimator parameters and core library versions."""
    specs = SPECS if specs is None else specs
    cols = list(dict.fromkeys(["unit", "t", "year", "y", "y_known"] + [c for _, fs in specs.values() for c in fs]))
    digest = hashlib.sha256(pd.util.hash_pandas_object(panel[cols], index=True).values.tobytes())
    config = {name: {"features": fs, "params": make().get_params(deep=True)} for name, (make, fs) in specs.items()}
    digest.update(json.dumps(config, sort_keys=True, default=str).encode())
    digest.update(inspect.getsource(walk_forward).encode())
    versions = [sklearn.__version__, np.__version__, pd.__version__]
    if any(make is make_lgbm for make, _ in specs.values()):
        import lightgbm
        versions.append(lightgbm.__version__)
    digest.update(f"{horizon}:{FIRST_TEST_YEAR}:{':'.join(versions)}".encode())
    return digest.hexdigest()


def fit_weights(y, probabilities):
    """Convex log-loss stacking with shrinkage toward equal weights; no class balancing."""
    z = logit_(np.asarray(probabilities, dtype=float))
    y = np.asarray(y, dtype=float)
    uniform = np.full(z.shape[1], 1 / z.shape[1])
    if len(y) < 500 or y.sum() < 30 or (1 - y).sum() < 30:
        return uniform
    def objective(w):
        eta = z @ w
        loss = np.mean(np.logaddexp(0, eta) - y * eta) + 0.002 * np.sum((w - uniform) ** 2)
        grad = z.T @ (expit(eta) - y) / len(y) + 0.004 * (w - uniform)
        return loss, grad
    fit = minimize(objective, uniform, jac=True, method="SLSQP", bounds=[(0.05, 0.9)] * len(uniform),
                   constraints={"type": "eq", "fun": lambda w: w.sum() - 1, "jac": lambda w: np.ones_like(w)},
                   options={"ftol": 1e-10, "maxiter": 200})
    return fit.x / fit.x.sum() if fit.success and np.isfinite(fit.x).all() else uniform


def combine_forward(panel, preds, horizon, members=ENSEMBLE):
    """Weights for year Y use only matured OOS outcomes before Y, from the last 20 years."""
    valid = np.isfinite(preds[members]).all(axis=1)
    out = combine(preds, members)
    def past(cutoff):
        return valid & panel.y_known & (panel.t + horizon < cutoff) & (panel.t >= cutoff - 240)
    history = []
    for year in sorted(panel.loc[valid, "year"].unique()):
        mask = past(int(year) * 12)
        w = fit_weights(panel.loc[mask, "y"], preds.loc[mask, members])
        now = valid & panel.year.eq(year)
        out.loc[now] = combine(preds.loc[now], members, w)
        history.append({"year": int(year), "weights": [round(float(v), 6) for v in w], "n": int(mask.sum())})
    mask = past(int(panel.t.max()) + 1)
    weights = fit_weights(panel.loc[mask, "y"], preds.loc[mask, members])
    return out, weights, history


def walk_forward(panel: pd.DataFrame, horizon: int, specs=SPECS, log=print, first_year: int | None = None) -> pd.DataFrame:
    """Previsioni fuori campione per ogni modello: una colonna per modello, NaN dove non previsto. `first_year`: primo anno previsto (default FIRST_TEST_YEAR)."""
    usable = panel
    years = usable["year"].to_numpy()
    preds = pd.DataFrame(np.nan, index=panel.index, columns=list(specs))
    last = int(years.max())
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for yr in range(first_year or FIRST_TEST_YEAR, last + 1):
            train = usable[usable["y_known"] & (usable["t"] + horizon < yr * 12)]
            test = usable[years == yr]
            if test.empty or train["y"].sum() < 20:
                continue
            for name, (make, cols) in specs.items():
                preds.loc[test.index, name] = make().fit(train[cols], train["y"]).predict_proba(test[cols])[:, 1]
            if yr % 10 == 0 or yr == last:
                log(f"  validazione: fatto fino al {yr}")
    return preds


def calibrate_forward(panel: pd.DataFrame, raw: pd.Series, horizon: int, window_years=None,
                      regularization=1e6, min_years: int | None = None) -> tuple[pd.Series, tuple[float, float]]:
    """Calibrazione di Platt a finestra espandibile: per l'anno Y usa solo le previsioni con esito noto prima di Y.

    Restituisce anche i coefficienti stimati su tutto il periodo, da applicare alla previsione corrente.
    """
    out = raw.copy()
    z = logit_(raw.to_numpy())
    ok = raw.notna().to_numpy() & panel["y_known"].to_numpy()
    y, t, years = panel["y"].to_numpy(), panel["t"].to_numpy(), panel["year"].to_numpy()
    if not raw.notna().any():
        return out, (1.0, 0.0)
    first = int(years[raw.notna().to_numpy()].min())

    def fit(mask):
        if mask.sum() < 100 or y[mask].sum() < 30 or (1 - y[mask]).sum() < 30:
            return 1.0, 0.0
        lr = LogisticRegression(C=regularization, max_iter=1000).fit(z[mask].reshape(-1, 1), y[mask])
        return (float(lr.coef_[0, 0]), float(lr.intercept_[0])) if lr.coef_[0, 0] > 0 else (1.0, 0.0)

    for yr in range(first + (MIN_CAL_YEARS if min_years is None else min_years), int(years.max()) + 1):
        past = ok & (t + horizon < yr * 12)
        if window_years:
            past &= t >= (yr - window_years) * 12
        if y[past].sum() < 30:
            continue
        a, b = fit(past)
        now = (years == yr) & raw.notna().to_numpy()
        out.iloc[np.flatnonzero(now)] = expit(a * z[now] + b)
    final = ok & (t >= t.max() + 1 - window_years * 12) if window_years else ok
    return out, fit(final)


def base_rate_forward(panel, horizon):
    """A deployable baseline, unlike the retrospectively observed evaluation prevalence."""
    out = pd.Series(np.nan, index=panel.index, dtype=float)
    for year in sorted(panel.year.unique()):
        past = panel.y_known & (panel.t + horizon < year * 12)
        if past.any():
            out.loc[panel.year.eq(year)] = float(panel.loc[past, "y"].mean())
    return out


# ------------------------------------------------------------------ valutazione
def score(y, p, t) -> dict | None:
    y, p = np.asarray(y, dtype=float), np.asarray(p, dtype=float)
    valid = np.isfinite(y) & np.isfinite(p)
    y, p, t = y[valid], p[valid], np.asarray(t)[valid]
    if y.sum() < 5 or y.sum() == len(y):
        return None
    df = pd.DataFrame({"y": y, "p": p, "t": t})
    # Fractional allocation at ties: exactly ceil(10% of countries) per month,
    # without arbitrary country ordering or silently dropping an entire tied group.
    group = df.groupby("t")["p"]
    size = group.transform("size")
    first = group.rank(method="min", ascending=False)
    ties = df.groupby(["t", "p"])["p"].transform("size")
    df["top"] = ((np.ceil(size * .1) - first + 1) / ties).clip(0, 1)
    base = y.mean()
    brier = brier_score_loss(y, p)
    return {"n": int(len(y)), "pos": int(y.sum()), "auc": round(float(roc_auc_score(y, p)), 3),
            "pr_auc": round(float(average_precision_score(y, p)), 3), "base_rate": round(float(base), 4),
            "brier": round(float(brier), 5), "brier_skill": round(float(1 - brier / (base * (1 - base))), 3),
            "log_loss": round(float(log_loss(y, np.clip(p, EPS, 1 - EPS))), 4),
            "top10_recall": round(float(df.loc[df.y == 1, "top"].mean()), 3),
            "top10_precision": round(float((df.y * df.top).sum() / df.top.sum()), 4),
            "top10_lift": round(float((df.y * df.top).sum() / df.top.sum() / base), 2)}


def bootstrap_diff(y, p_a, p_b, units, reps=300, seed=0) -> dict:
    """Differenza di AUC-ROC e AUC-PR tra due modelli, con ricampionamento per paese."""
    rng = np.random.default_rng(seed)
    y, p_a, p_b = np.asarray(y), np.asarray(p_a), np.asarray(p_b)
    ids = pd.Series(np.arange(len(y))).groupby(np.asarray(units)).apply(lambda s: s.to_numpy())
    keys = ids.index.to_numpy()
    d_auc, d_pr, auc_a, d_brier = [], [], [], []
    for _ in range(reps):
        idx = np.concatenate([ids[k] for k in rng.choice(keys, len(keys))])
        if y[idx].sum() < 5 or y[idx].sum() == len(idx):
            continue
        a1, a2 = roc_auc_score(y[idx], p_a[idx]), roc_auc_score(y[idx], p_b[idx])
        d_auc.append(a1 - a2)
        auc_a.append(a1)
        d_pr.append(average_precision_score(y[idx], p_a[idx]) - average_precision_score(y[idx], p_b[idx]))
        d_brier.append(float(np.mean((p_a[idx] - y[idx]) ** 2 - (p_b[idx] - y[idx]) ** 2)))
    if not d_auc:
        return {"d_auc": None, "d_auc_ci": [None, None], "d_pr": None, "d_pr_ci": [None, None],
                "auc_ci": [None, None], "p_better": None, "d_brier": None, "d_brier_ci": [None, None]}
    q = lambda v: [round(float(np.quantile(v, k)), 3) for k in (0.05, 0.95)]
    return {"d_auc": round(float(np.mean(d_auc)), 3), "d_auc_ci": q(d_auc), "d_pr": round(float(np.mean(d_pr)), 3),
            "d_pr_ci": q(d_pr), "auc_ci": q(auc_a), "p_better": round(float(np.mean(np.array(d_auc) > 0)), 2),
            "d_brier": round(float(np.mean(d_brier)), 7),
            "d_brier_ci": [round(float(v), 7) for v in np.quantile(d_brier, [.05, .95])]}


def calibration_table(y, p, bins=10) -> list[dict]:
    """Probabilita' prevista contro frequenza osservata, per fasce di rischio di uguale numerosita'."""
    df = pd.DataFrame({"y": np.asarray(y, dtype=float), "p": np.asarray(p, dtype=float)})
    df["bin"] = pd.qcut(df["p"].rank(method="first"), bins, labels=False)
    g = df.groupby("bin").agg(predicted=("p", "mean"), observed=("y", "mean"), n=("y", "size"), events=("y", "sum"))
    return [{"predicted": round(float(r.predicted), 5), "observed": round(float(r.observed), 5), "n": int(r.n),
             "events": int(r.events)} for r in g.itertuples()]


# ------------------------------------------------------------------ modello finale
def fit_final(train: pd.DataFrame, members=ENSEMBLE, rf_trees=200) -> dict:
    models = {}
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for name in members:
            make, cols = SPECS[name]
            mdl = make_rf(rf_trees) if name.startswith("rf") else make()
            models[name] = (mdl.fit(train[cols], train["y"]), cols)
    return models


def predict_ensemble(models: dict, rows: pd.DataFrame, cal: tuple[float, float] | None = None, weights=None) -> np.ndarray:
    z = np.average([logit_(m.predict_proba(rows[cols])[:, 1]) for m, cols in models.values()], axis=0, weights=weights)
    if cal:
        z = cal[0] * z + cal[1]
    return expit(z)


def bootstrap_intervals(train: pd.DataFrame, rows: pd.DataFrame, cal, reps=20, seed=1, log=print, weights=None) -> np.ndarray:
    """Incertezza di stima: il modello viene riaddestrato su paesi ricampionati; restituisce (reps, n)."""
    rng = np.random.default_rng(seed)
    groups = train.groupby("unit").indices
    keys = np.array(list(groups))
    out = []
    for r in range(reps):
        idx = np.concatenate([groups[k] for k in rng.choice(keys, len(keys))])
        sample = train.iloc[idx]
        if sample.y.nunique() < 2:
            continue
        models = fit_final(sample)
        out.append(predict_ensemble(models, rows, cal, weights))
        if (r + 1) % 10 == 0:
            log(f"  incertezza: {r + 1}/{reps} ricampionamenti")
    if len(out) < 2:
        raise ValueError("At least two valid bootstrap refits are required for an interval")
    return np.array(out)


def explain(models: dict, rows: pd.DataFrame) -> list[dict]:
    """Contributi della componente lineare, per gruppo tematico e per singola variabile."""
    pipe, cols = models["logit"]
    imp, sc, lr = pipe.named_steps["simpleimputer"], pipe.named_steps["standardscaler"], pipe.named_steps["logisticregression"]
    contrib = sc.transform(imp.transform(rows[cols])) * lr.coef_[0]
    names = [str(n).removeprefix("missingindicator_") for n in imp.get_feature_names_out(cols)]
    group_of = {f: g for g, fs in GROUPS.items() for f in fs}
    out = []
    for i in range(len(rows)):
        by_feature: dict[str, float] = {}
        for name, c in zip(names, contrib[i]):
            by_feature[name] = by_feature.get(name, 0.0) + float(c)
        by_group: dict[str, float] = {}
        for f, c in by_feature.items():
            by_group[group_of[f]] = by_group.get(group_of[f], 0.0) + c
        merged: dict[str, float] = {}
        for f, c in by_feature.items():                                   # le tre curve del tempo contano come una
            merged[FEATURE_LABELS[f]] = merged.get(FEATURE_LABELS[f], 0.0) + c
        top = sorted(merged.items(), key=lambda kv: -abs(kv[1]))[:6]
        out.append({
            "groups": [{"key": g, "label": GROUP_LABELS[g], "contrib": round(c, 3)}
                       for g, c in sorted(by_group.items(), key=lambda kv: -abs(kv[1])) if g != "tempo"],
            "drivers": [{"label": lab, "contrib": round(c, 3)} for lab, c in top],
        })
    return out


def coefficient_table(models: dict) -> list[dict]:
    pipe, cols = models["logit"]
    lr = pipe.named_steps["logisticregression"]
    group_of = {f: g for g, fs in GROUPS.items() for f in fs}
    names = pipe.named_steps["simpleimputer"].get_feature_names_out(cols)
    rows = [{"label": FEATURE_LABELS[f], "group": GROUP_LABELS[group_of[f]], "odds_ratio": round(float(np.exp(c)), 3)}
            for f, c in zip(names, lr.coef_[0]) if not f.startswith(("h_cs", "missingindicator_"))]
    return sorted(rows, key=lambda d: -abs(np.log(d["odds_ratio"])))
