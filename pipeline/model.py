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
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

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
# nome -> (costruttore, variabili). I primi tre formano l'insieme pubblicato.
SPECS = {
    "logit": (make_logit, ALL_FEATURES),
    "gbm": (make_gbm, ALL_FEATURES),
    "rf": (make_rf, ALL_FEATURES),
    # confronti
    "storia": (make_logit, feats("storia")),
    "storia_contagio": (make_logit, feats("storia", "contagio", "tempo")),
    "logit_noacled": (make_logit, feats(*NO_ACLED)),
    "gbm_noacled": (make_gbm, feats(*NO_ACLED)),
    "rf_noacled": (make_rf, feats(*NO_ACLED)),
}
ENSEMBLE = ["logit", "gbm", "rf"]
ENSEMBLE_NOACLED = ["logit_noacled", "gbm_noacled", "rf_noacled"]


def logit_(p):
    p = np.clip(p, EPS, 1 - EPS)
    return np.log(p / (1 - p))


def expit(z):
    return 1 / (1 + np.exp(-z))


def combine(preds: pd.DataFrame, members: list[str]) -> pd.Series:
    """Media dei log-odds dei modelli componenti."""
    return pd.Series(expit(np.mean([logit_(preds[m].to_numpy()) for m in members], axis=0)), index=preds.index)


def walk_forward(panel: pd.DataFrame, horizon: int, specs=SPECS, log=print) -> pd.DataFrame:
    """Previsioni fuori campione per ogni modello: una colonna per modello, NaN dove non previsto."""
    usable = panel
    years = usable["year"].to_numpy()
    preds = pd.DataFrame(np.nan, index=panel.index, columns=list(specs))
    last = int(years.max())
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for yr in range(FIRST_TEST_YEAR, last + 1):
            train = usable[usable["y_known"] & (usable["t"] + horizon < yr * 12)]
            test = usable[years == yr]
            if test.empty or train["y"].sum() < 20:
                continue
            for name, (make, cols) in specs.items():
                preds.loc[test.index, name] = make().fit(train[cols], train["y"]).predict_proba(test[cols])[:, 1]
            if yr % 10 == 0 or yr == last:
                log(f"  validazione: fatto fino al {yr}")
    return preds


def calibrate_forward(panel: pd.DataFrame, raw: pd.Series, horizon: int) -> tuple[pd.Series, tuple[float, float]]:
    """Calibrazione di Platt a finestra espandibile: per l'anno Y usa solo le previsioni con esito noto prima di Y.

    Restituisce anche i coefficienti stimati su tutto il periodo, da applicare alla previsione corrente.
    """
    out = raw.copy()
    z = logit_(raw.to_numpy())
    ok = raw.notna().to_numpy() & panel["y_known"].to_numpy()
    y, t, years = panel["y"].to_numpy(), panel["t"].to_numpy(), panel["year"].to_numpy()
    first = int(np.nanmin(np.where(raw.notna(), years, np.nan)))

    def fit(mask):
        lr = LogisticRegression(C=1e6, max_iter=1000).fit(z[mask].reshape(-1, 1), y[mask])
        return float(lr.coef_[0, 0]), float(lr.intercept_[0])

    for yr in range(first + MIN_CAL_YEARS, int(years.max()) + 1):
        past = ok & (t + horizon < yr * 12)
        if y[past].sum() < 30:
            continue
        a, b = fit(past)
        now = (years == yr) & raw.notna().to_numpy()
        out.iloc[np.flatnonzero(now)] = expit(a * z[now] + b)
    return out, fit(ok)


# ------------------------------------------------------------------ valutazione
def score(y, p, t) -> dict | None:
    y, p = np.asarray(y, dtype=float), np.asarray(p, dtype=float)
    if y.sum() < 5 or y.sum() == len(y):
        return None
    df = pd.DataFrame({"y": y, "p": p, "t": t})
    df["top"] = df.groupby("t")["p"].rank(pct=True, ascending=False) <= 0.10
    base = y.mean()
    brier = brier_score_loss(y, p)
    return {"n": int(len(y)), "pos": int(y.sum()), "auc": round(float(roc_auc_score(y, p)), 3),
            "pr_auc": round(float(average_precision_score(y, p)), 3), "base_rate": round(float(base), 4),
            "brier": round(float(brier), 5), "brier_skill": round(float(1 - brier / (base * (1 - base))), 3),
            "log_loss": round(float(log_loss(y, np.clip(p, EPS, 1 - EPS))), 4),
            "top10_recall": round(float(df.loc[df.y == 1, "top"].mean()), 3)}


def bootstrap_diff(y, p_a, p_b, units, reps=300, seed=0) -> dict:
    """Differenza di AUC-ROC e AUC-PR tra due modelli, con ricampionamento per paese."""
    rng = np.random.default_rng(seed)
    y, p_a, p_b = np.asarray(y), np.asarray(p_a), np.asarray(p_b)
    ids = pd.Series(np.arange(len(y))).groupby(np.asarray(units)).apply(lambda s: s.to_numpy())
    keys = ids.index.to_numpy()
    d_auc, d_pr, auc_a = [], [], []
    for _ in range(reps):
        idx = np.concatenate([ids[k] for k in rng.choice(keys, len(keys))])
        if y[idx].sum() < 5:
            continue
        a1, a2 = roc_auc_score(y[idx], p_a[idx]), roc_auc_score(y[idx], p_b[idx])
        d_auc.append(a1 - a2)
        auc_a.append(a1)
        d_pr.append(average_precision_score(y[idx], p_a[idx]) - average_precision_score(y[idx], p_b[idx]))
    q = lambda v: [round(float(np.quantile(v, k)), 3) for k in (0.05, 0.95)]
    return {"d_auc": round(float(np.mean(d_auc)), 3), "d_auc_ci": q(d_auc), "d_pr": round(float(np.mean(d_pr)), 3),
            "d_pr_ci": q(d_pr), "auc_ci": q(auc_a), "p_better": round(float(np.mean(np.array(d_auc) > 0)), 2)}


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


def predict_ensemble(models: dict, rows: pd.DataFrame, cal: tuple[float, float] | None = None) -> np.ndarray:
    z = np.mean([logit_(m.predict_proba(rows[cols])[:, 1]) for m, cols in models.values()], axis=0)
    if cal:
        z = cal[0] * z + cal[1]
    return expit(z)


def bootstrap_intervals(train: pd.DataFrame, rows: pd.DataFrame, cal, reps=20, seed=1, log=print) -> np.ndarray:
    """Incertezza di stima: il modello viene riaddestrato su paesi ricampionati; restituisce (reps, n)."""
    rng = np.random.default_rng(seed)
    groups = train.groupby("unit").indices
    keys = np.array(list(groups))
    out = []
    for r in range(reps):
        idx = np.concatenate([groups[k] for k in rng.choice(keys, len(keys))])
        models = fit_final(train.iloc[idx], rf_trees=80)
        out.append(predict_ensemble(models, rows, cal))
        if (r + 1) % 10 == 0:
            log(f"  incertezza: {r + 1}/{reps} ricampionamenti")
    return np.array(out)


def explain(models: dict, rows: pd.DataFrame) -> list[dict]:
    """Contributi della componente lineare, per gruppo tematico e per singola variabile."""
    pipe, cols = models["logit"]
    imp, sc, lr = pipe.named_steps["simpleimputer"], pipe.named_steps["standardscaler"], pipe.named_steps["logisticregression"]
    contrib = sc.transform(imp.transform(rows[cols])) * lr.coef_[0]
    names = list(cols) + [cols[i] for i in imp.indicator_.features_]      # gli indicatori di dato mancante
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
    rows = [{"label": FEATURE_LABELS[f], "group": GROUP_LABELS[group_of[f]], "odds_ratio": round(float(np.exp(c)), 3)}
            for f, c in zip(cols, lr.coef_[0][:len(cols)]) if not f.startswith("h_cs")]
    return sorted(rows, key=lambda d: -abs(np.log(d["odds_ratio"])))
