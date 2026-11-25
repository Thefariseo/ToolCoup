"""Disordine politico: la probabilita' di un'ondata di proteste e di un'escalation di violenza organizzata nei prossimi tre mesi, per paese.

Il modello dei golpe risponde a una domanda sola e rara (circa 7 tentativi l'anno nel mondo). Il disordine politico e' piu' frequente e si misura ogni
mese, quindi si puo' prevedere e valutare molto meglio. Due eventi, definiti sui conteggi mensili ACLED del paese:

  wave        ondata di proteste: la media mensile di proteste e disordini (Protests + Riots) dei prossimi 3 mesi e' almeno 1,5 volte la media dei 12 mesi
              appena trascorsi e almeno 25 al mese
  escalation  escalation di violenza organizzata: lo stesso per Battles + Explosions/remote violence + Violence against civilians

Metodo, nello stesso stile del modello dei golpe: regressione logistica e LightGBM sulle stesse variabili, media dei log-odds, calibrazione di Platt
stimata solo sul passato, validazione anno per anno (modelli addestrati sul passato, esiti maturati prima di gennaio), confronto con la persistenza (il
rapporto tra l'ultimo trimestre e l'anno) con intervalli da ricampionamento dei paesi, intervalli di stima da ricampionamento dei paesi.
Varia rispetto ai golpe: i casi sono migliaia, quindi ha senso testare modelli piu' flessibili (pipeline/experiment_unrest.py: LightGBM contro TFT).

Le variabili guardano solo al passato di ciascun mese: livelli e rapporti recenti, composizione (proteste/disordini, repressione, arresti), violenza e vittime,
ondate recenti nel paese, nei vicini (7 paesi piu' vicini per centroide) e nella regione, struttura (V-Dem, popolazione, reddito), stagione, anni di copertura.
La copertura ACLED parte in anni diversi nelle varie regioni: si usano solo mesi con almeno 12 mesi di serie, e la valutazione parte dal 2019.

Uso:  python pipeline/unrest.py [--boot 20] [--no-export]       ->  webdata/unrest.json
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
from scipy.special import expit

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as M  # noqa: E402
from lgbm import make_lgbm  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "webdata" / "unrest.json"
ACLED_MONTHLY = ROOT / "data" / "raw" / "acled_monthly.pkl"
ACLED_DIR = ROOT / "data" / "raw" / "acled"

HORIZON, RATIO, FLOOR = 3, 1.5, 25.0
MIN_AGE = 12                  # mesi di serie necessari per misurare l'anno di riferimento
FIRST_TEST_YEAR = 2019        # la copertura ACLED si allarga fino al 2018: prima non si valuta, ma si addestra
SERIES = {"wave": "u", "escalation": "v"}
TARGET_TEXT = {
    "wave": ("Protest wave", "average monthly protests and riots over the next 3 months at least 1.5 times the average of the last 12 months, and at least 25 a month"),
    "escalation": ("Violence escalation", "average monthly battles, explosions and attacks on civilians over the next 3 months at least 1.5 times the average of the last 12 months, and at least 25 a month"),
}
GROUPS = {
    "momentum": "recent level against the year", "history": "waves already seen in the country", "violence": "armed violence and fatalities",
    "state": "repression, arrests and state-force clashes", "neighbours": "unrest in nearby countries and the region",
    "structure": "regime, income and population", "season": "time of year",
}


# ------------------------------------------------------------------ dati
def monthly_matrices() -> tuple[dict, pd.Series, int]:
    """Matrici (mesi x paesi) dei conteggi mensili; NaN prima dell'inizio della copertura del paese, 0 dopo se non ci sono eventi."""
    d = pd.read_pickle(ACLED_MONTHLY)
    m, t_end = d["monthly"].copy(), int(d["meta"]["t_end"])
    m["u"], m["p"], m["r"] = m["protests"] + m["riots"], m["protests"], m["riots"]
    m["v"] = m["battles"] + m["explosions"] + m["vac"]
    ts = np.arange(int(m["t"].min()), t_end + 1)
    first = m.groupby("country")["t"].min()
    region = m.groupby("country")["region"].first()
    mats = {}
    for col in ("u", "p", "r", "v", "fatalities", "repression", "arrests", "strategic", "state_vs_civ", "infighting"):
        w = m.pivot_table(index="t", columns="country", values=col, aggfunc="sum").reindex(ts).reindex(columns=first.index)
        started = np.array([[t >= first[c] for c in w.columns] for t in ts])
        mats[col] = w.fillna(0.0).where(started)
    return mats, region, t_end


def centroids(countries) -> pd.DataFrame:
    """Latitudine e longitudine medie degli eventi dell'ultimo anno disponibile per ogni paese (per i vicini)."""
    frames = []
    for y in sorted({date.today().year, date.today().year - 1}):
        f = ACLED_DIR / f"acled_{y}.csv"
        if f.exists():
            frames.append(pd.read_csv(f, usecols=["country", "latitude", "longitude"]))
    if not frames:
        return pd.DataFrame(index=list(countries), columns=["latitude", "longitude"], dtype=float)
    return pd.concat(frames).groupby("country")[["latitude", "longitude"]].mean().reindex(list(countries))


def neighbours(cent: pd.DataFrame, k: int = 7) -> np.ndarray:
    """Indici dei k paesi piu' vicini (centroide), esclusi se stessi; una riga di -1 per i paesi senza coordinate."""
    from scipy.spatial import cKDTree
    ok = cent["latitude"].notna().to_numpy()
    lat, lon = np.radians(cent["latitude"].fillna(0).to_numpy()), np.radians(cent["longitude"].fillna(0).to_numpy())
    xyz = np.c_[np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)]
    idx = np.flatnonzero(ok)
    nb = np.full((len(cent), k), -1)
    if len(idx) > k:
        _, q = cKDTree(xyz[idx]).query(xyz[idx], k=k + 1)
        nb[idx] = idx[q[:, 1:]]
    return nb


def country_years() -> pd.DataFrame:
    from panel import load_country_years
    return load_country_years().set_index(["ccode", "year"])


# ------------------------------------------------------------------ bersagli
def _future_mean(x: pd.DataFrame, h: int) -> pd.DataFrame:
    """Media dei mesi t+1..t+h; NaN se qualcuno non e' osservato."""
    return x[::-1].rolling(h, min_periods=h).mean()[::-1].shift(-1)


def targets(mats: dict, horizon: int = HORIZON, ratio: float = RATIO, floor: float = FLOOR) -> dict[str, pd.DataFrame]:
    """1 se l'evento accade nei prossimi `horizon` mesi, 0 se no, NaN se non e' noto (esito non maturato o meno di 12 mesi di serie)."""
    out = {}
    for name, key in SERIES.items():
        x = mats[key]
        base = x.rolling(MIN_AGE, min_periods=MIN_AGE).mean()
        fut = _future_mean(x, horizon)
        out[name] = ((fut >= ratio * base.clip(lower=1)) & (fut >= floor)).astype(float).where(fut.notna() & base.notna())
    return out


# ------------------------------------------------------------------ variabili
def features(mats: dict, region: pd.Series, nb: np.ndarray, cy: pd.DataFrame | None = None, ccodes: pd.Series | None = None) -> tuple[dict, dict]:
    """Variabili (mesi x paesi) che usano soltanto dati fino al mese t compreso, e il gruppo di ciascuna."""
    F, G = {}, {}
    ts = mats["u"].index
    L = lambda x: np.log1p(x)
    def add(name, df, group):
        F[name], G[name] = df, group
    mean = lambda x, w, k=None: x.rolling(w, min_periods=k or max(2, w // 2)).mean()
    u, v, fat = mats["u"], mats["v"], mats["fatalities"]
    u1, u3, u6, u12, u24 = u, mean(u, 3), mean(u, 6), mean(u, 12), mean(u, 24)
    for name, df in (("l_u1", u1), ("l_u3", u3), ("l_u6", u6), ("l_u12", u12), ("l_u24", u24)):
        add(name, L(df), "momentum")
    add("l_u_lag1", L(u.shift(1)), "momentum"); add("l_u_lag2", L(u.shift(2)), "momentum")
    ratio3_12 = (u3 + 1) / (u12 + 1)
    add("r_u3_12", ratio3_12, "momentum"); add("r_u12_24", (u12 + 1) / (u24 + 1), "momentum"); add("r_u3_6", (u3 + 1) / (u6 + 1), "momentum")
    add("sd_u6", L(u).rolling(6, min_periods=4).std(), "momentum")
    add("l_riots3", L(mean(mats["r"], 3)), "momentum"); add("riot_share3", (mean(mats["r"], 3) + 0.5) / (u3 + 1), "momentum")
    v3, v6, v12, v24 = mean(v, 3), mean(v, 6), mean(v, 12), mean(v, 24)
    for name, df in (("l_v3", v3), ("l_v6", v6), ("l_v12", v12)):
        add(name, L(df), "violence")
    add("r_v3_12", (v3 + 1) / (v12 + 1), "violence"); add("r_v12_24", (v12 + 1) / (v24 + 1), "violence")
    add("l_f3", L(mean(fat, 3)), "violence"); add("l_f12", L(mean(fat, 12)), "violence"); add("r_f3_12", (mean(fat, 3) + 1) / (mean(fat, 12) + 1), "violence")
    rep6, arr3, inf6 = mean(mats["repression"], 6), mean(mats["arrests"], 3), mean(mats["infighting"], 6)
    add("repress_share6", rep6 / (u6 + 5), "state"); add("l_arrests3", L(arr3), "state"); add("l_infight6", L(inf6), "state")
    add("l_strategic3", L(mean(mats["strategic"], 3)), "state"); add("l_state_vs_civ3", L(mean(mats["state_vs_civ"], 3)), "state")
    # ondate in corso e passate: una finestra di 3 mesi >= 1,5 volte l'anno che la precede (fine tre mesi prima)
    surge_now = ((u3 >= RATIO * u12.shift(3).clip(lower=1)) & (u3 >= FLOOR)).astype(float).where(u12.shift(3).notna())
    add("surge_now", surge_now, "history"); add("surges_24", surge_now.rolling(24, min_periods=1).sum(), "history")
    since = pd.DataFrame(np.nan, index=ts, columns=u.columns)
    last = pd.Series(np.nan, index=u.columns)
    for i, t in enumerate(ts):
        hit = surge_now.iloc[i].fillna(0).to_numpy() > 0
        last = last.where(~hit, t)
        since.iloc[i] = (t - last).clip(upper=60)
    add("months_since_surge", since.fillna(60), "history")
    v_surge = ((v3 >= RATIO * v12.shift(3).clip(lower=1)) & (v3 >= FLOOR)).astype(float).where(v12.shift(3).notna())
    add("v_surge_now", v_surge, "violence"); add("v_surges_24", v_surge.rolling(24, min_periods=1).sum(), "violence")
    # vicini, regione, mondo: ondate (esclusi i paesi stessi) e livello delle proteste
    cols = list(u.columns)
    ssn, lu3, vs = surge_now.fillna(0).to_numpy(), L(u3).to_numpy(), v_surge.fillna(0).to_numpy()
    nb_surge, nb_lvl, nb_v = np.full(ssn.shape, np.nan), np.full(ssn.shape, np.nan), np.full(ssn.shape, np.nan)
    for j in range(len(cols)):
        n = nb[j][nb[j] >= 0]
        if len(n):
            nb_surge[:, j], nb_lvl[:, j], nb_v[:, j] = ssn[:, n].mean(axis=1), np.nanmean(lu3[:, n], axis=1), vs[:, n].mean(axis=1)
    add("nb_surge", pd.DataFrame(nb_surge, index=ts, columns=cols), "neighbours"); add("nb_l_u3", pd.DataFrame(nb_lvl, index=ts, columns=cols), "neighbours")
    add("nb_v_surge", pd.DataFrame(nb_v, index=ts, columns=cols), "neighbours")
    reg = region.reindex(cols).fillna("?")
    reg_surge = pd.DataFrame(np.nan, index=ts, columns=cols)
    for r_, members in reg.groupby(reg).groups.items():
        idx = [cols.index(c) for c in members]
        tot = ssn[:, idx].sum(axis=1, keepdims=True)
        reg_surge.iloc[:, idx] = (tot - ssn[:, idx]) / max(len(idx) - 1, 1)
    add("reg_surge", reg_surge, "neighbours")
    add("glob_surge", pd.DataFrame(np.tile(ssn.mean(axis=1, keepdims=True), (1, len(cols))), index=ts, columns=cols), "neighbours")
    add("glob_surge_lag3", pd.DataFrame(np.tile(pd.Series(ssn.mean(axis=1), index=ts).shift(3).to_numpy()[:, None], (1, len(cols))), index=ts, columns=cols), "neighbours")
    mo = np.asarray(ts % 12)
    add("month_sin", pd.DataFrame(np.tile(np.sin(2 * np.pi * mo / 12)[:, None], (1, len(cols))), index=ts, columns=cols), "season")
    add("month_cos", pd.DataFrame(np.tile(np.cos(2 * np.pi * mo / 12)[:, None], (1, len(cols))), index=ts, columns=cols), "season")
    age = u.notna().cumsum().where(u.notna())
    add("age", age, "structure")
    if cy is not None and ccodes is not None:
        have = set(cy.index.get_level_values(0))
        for var in ("v2x_polyarchy", "v2x_libdem", "v2x_civlib", "e_log_pop", "e_log_gdppc", "e_log_infmort"):
            m = pd.DataFrame(np.nan, index=ts, columns=cols)
            for c in cols:
                cc = ccodes.get(c)
                if cc is not None and cc == cc and int(cc) in have and var in cy:
                    s = cy.loc[int(cc), var]
                    m[c] = s.reindex(ts // 12 - 1).to_numpy()
            add(var, m, "structure")
    return F, G


def long_frame(F: dict, Y: dict, mats: dict) -> pd.DataFrame:
    """Una riga per paese-mese con almeno MIN_AGE mesi di serie: variabili, bersagli, `y_known` (per ciascun bersaglio) e indici."""
    ts, cols = mats["u"].index, list(mats["u"].columns)
    base = {"t": np.repeat(ts.to_numpy(), len(cols)), "country": np.tile(np.array(cols, dtype=object), len(ts))}
    df = pd.DataFrame(base)
    for k, v in F.items():
        df[k] = v.to_numpy().reshape(-1)
    for k, v in Y.items():
        df["y_" + k] = v.to_numpy().reshape(-1)
    df["year"] = df["t"] // 12
    keep = df["age"].notna() & (df["age"] >= MIN_AGE)
    return df[keep].reset_index(drop=True)


# ------------------------------------------------------------------ modelli
def _logit_pipeline():
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    return make_pipeline(SimpleImputer(strategy="median", add_indicator=True), StandardScaler(), LogisticRegression(C=0.05, max_iter=2000))


def make_lgbm_unrest():
    import lightgbm as lgb
    return lgb.LGBMClassifier(n_estimators=300, learning_rate=0.03, num_leaves=15, min_child_samples=60, subsample=0.8, subsample_freq=1,
                              colsample_bytree=0.8, reg_lambda=5.0, verbose=-1, random_state=0, n_jobs=-1, deterministic=True, force_row_wise=True)


def persistence_score(df: pd.DataFrame, name: str) -> pd.Series:
    """La linea di base da battere: quanto l'ultimo trimestre e' gia' sopra l'anno."""
    r = df["r_u3_12"] if name == "wave" else df["r_v3_12"]
    return r / (1 + r)                                      # trasformazione monotona in (0, 1): conta solo l'ordine


def run_validation(df: pd.DataFrame, feats: list[str], name: str, log=print) -> pd.DataFrame:
    panel = df.assign(y=df["y_" + name], unit=df["country"], y_known=df["y_" + name].notna())
    specs = {"logit": (_logit_pipeline, feats), "lgbm": (make_lgbm_unrest, feats)}
    preds = M.walk_forward(panel, HORIZON, specs, log=log, first_year=FIRST_TEST_YEAR)
    preds["ensemble_raw"] = M.combine(preds, ["logit", "lgbm"])
    preds["ensemble"], coefs = M.calibrate_forward(panel, preds["ensemble_raw"], HORIZON, min_years=3)
    preds["lgbm_cal"], _ = M.calibrate_forward(panel, preds["lgbm"], HORIZON, min_years=3)
    preds["persistence"] = persistence_score(df, name)
    preds.attrs["calibration"] = coefs
    return preds


def metrics(df: pd.DataFrame, preds: pd.DataFrame, name: str, since: int) -> dict:
    y = df["y_" + name]
    mask = y.notna() & (df["year"] >= since) & preds["ensemble"].notna()
    out = {}
    for key in ("persistence", "logit", "lgbm", "lgbm_cal", "ensemble_raw", "ensemble"):
        s = M.score(y[mask], preds.loc[mask, key], df.loc[mask, "t"])
        if key == "persistence":                           # un rapporto, non una probabilita': solo i punteggi di ordinamento hanno senso
            s = {k: v for k, v in s.items() if k in ("n", "pos", "auc", "pr_auc", "base_rate", "top10_recall", "top10_precision", "top10_lift")}
        out[key] = s
    out["n"], out["positives"] = int(mask.sum()), int(y[mask].sum())
    out["comparisons"] = {}
    for a, b in (("ensemble", "persistence"), ("ensemble", "lgbm_cal"), ("lgbm_cal", "logit")):
        out["comparisons"][f"{a}_vs_{b}"] = M.bootstrap_diff(y[mask], preds.loc[mask, a], preds.loc[mask, b], df.loc[mask, "country"], reps=200)
    return out


def explain_groups(model, X: pd.DataFrame, feats: list[str], groups: dict) -> list[list[dict]]:
    """Contributi di LightGBM (log-odds) sommati per gruppo, per ogni riga; i tre piu' grandi in valore assoluto."""
    contrib = model.booster_.predict(X[feats], pred_contrib=True)[:, :-1]
    out = []
    for row in contrib:
        by: dict[str, float] = {}
        for f, c in zip(feats, row):
            by[groups[f]] = by.get(groups[f], 0.0) + float(c)
        top = sorted(by.items(), key=lambda kv: -abs(kv[1]))[:3]
        out.append([{"group": g, "label": GROUPS[g], "contrib": round(c, 3)} for g, c in top])
    return out


def final_forecast(df: pd.DataFrame, feats: list[str], groups: dict, name: str, t_end: int, coefs, boot: int) -> pd.DataFrame:
    """Modello finale su tutti gli esiti maturati e previsione per l'ultimo mese; intervalli da ricampionamento dei paesi."""
    y = df["y_" + name]
    train = df[y.notna()]
    latest = df[df["t"] == t_end].copy()
    models = {k: mk().fit(train[feats], train["y_" + name]) for k, mk in (("logit", _logit_pipeline), ("lgbm", make_lgbm_unrest))}
    raw = lambda m: np.mean([M.logit_(m["logit"].predict_proba(latest[feats])[:, 1]), M.logit_(m["lgbm"].predict_proba(latest[feats])[:, 1])], axis=0)
    z = raw(models)
    latest["p"] = expit(coefs[0] * z + coefs[1])
    if boot > 0:
        rng, groups_idx = np.random.default_rng(1), train.groupby("country").indices
        keys, draws = np.array(list(groups_idx)), []
        for _ in range(boot):
            sample = train.iloc[np.concatenate([groups_idx[k] for k in rng.choice(keys, len(keys))])]
            if sample["y_" + name].nunique() < 2:
                continue
            mm = {k: mk().fit(sample[feats], sample["y_" + name]) for k, mk in (("logit", _logit_pipeline), ("lgbm", make_lgbm_unrest))}
            draws.append(expit(coefs[0] * raw(mm) + coefs[1]))
        if len(draws) >= 2:
            # Ogni ricampionamento vede circa il 63% dei paesi e tende a dare probabilita' meno estreme del modello pieno: i quantili grezzi lascerebbero la stima sul
            # bordo del proprio intervallo per i paesi piu' a rischio. Si tiene la dispersione dei ricampionamenti (in log-odds, rispetto alla loro mediana) e la si
            # centra sulla stima del modello pieno.
            zd = M.logit_(np.asarray(draws))
            spread = zd - np.median(zd, axis=0)
            z0 = M.logit_(latest["p"].to_numpy())
            latest["lo"], latest["hi"] = expit(z0 + np.quantile(spread, 0.1, axis=0)), expit(z0 + np.quantile(spread, 0.9, axis=0))
    latest["why"] = explain_groups(models["lgbm"], latest, feats, groups)
    return latest


# ------------------------------------------------------------------ esecuzione
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--boot", type=int, default=20)
    ap.add_argument("--no-export", action="store_true")
    args = ap.parse_args()
    warnings.simplefilter("ignore")
    from countries import code_from_name
    from export_web import slugify
    mats, region, t_end = monthly_matrices()
    cols = list(mats["u"].columns)
    nb = neighbours(centroids(cols))
    ccodes = pd.Series({c: code_from_name(c) for c in cols})
    F, G = features(mats, region, nb, country_years(), ccodes)
    Y = targets(mats)
    df = long_frame(F, Y, mats)
    feats = list(F)
    print(f"Paese-mesi: {len(df):,}, paesi {df['country'].nunique()}, variabili {len(feats)}, ultimo mese {M_label(t_end)}")
    result = {"generated": date.today().isoformat(), "data_end": M_label(t_end), "horizon_months": HORIZON, "ratio": RATIO, "floor": FLOOR,
              "first_test_year": FIRST_TEST_YEAR, "targets": {}, "groups": GROUPS}
    countries = {}
    cm = json.loads((ROOT / "webdata" / "countries.json").read_text(encoding="utf-8"))
    by_name = {c["name"]: c for c in cm}
    for name, (label, text) in TARGET_TEXT.items():
        print(f"=== {label}")
        preds = run_validation(df, feats, name)
        recent = metrics(df, preds, name, FIRST_TEST_YEAR)
        late = metrics(df, preds, name, 2022)
        for key in ("persistence", "logit", "lgbm_cal", "ensemble"):
            s = recent[key]
            print(f"  {key:12s} AUC {s['auc']:.3f}  PR {s['pr_auc']:.3f}  BrierSk {s.get('brier_skill', float('nan')):+.3f}  top10 {s['top10_recall']:.3f}  (n={recent['n']}, pos={recent['positives']})")
        latest = final_forecast(df, feats, G, name, t_end, preds.attrs["calibration"], args.boot)
        result["targets"][name] = {"label": label, "definition": text, "base_rate": round(float(df.loc[df["y_" + name].notna() & (df["year"] >= FIRST_TEST_YEAR), "y_" + name].mean()), 4),
                                   "metrics": {"since_2019": recent, "since_2022": late}, "calibration": [round(float(c), 3) for c in preds.attrs["calibration"]]}
        for r in latest.itertuples():
            c = by_name.get(r.country)
            slug = c["slug"] if c else slugify(r.country)
            rec = countries.setdefault(slug, {"name": r.country, "iso": c["iso"] if c else None, "region": region.get(r.country)})
            level = {"u": mats["u"], "v": mats["v"]}[SERIES[name]]
            now, ref = float(level[r.country].iloc[-3:].mean()), float(level[r.country].iloc[-12:].mean())
            rec[name] = {"p": round(float(r.p), 4), "lo": round(float(getattr(r, "lo", r.p)), 4), "hi": round(float(getattr(r, "hi", r.p)), 4),
                         "last3": round(now, 1), "last12": round(ref, 1), "why": r.why}
    for name in TARGET_TEXT:
        order = sorted((s for s, c in countries.items() if name in c), key=lambda s: -countries[s][name]["p"])
        for i, s in enumerate(order):
            countries[s][name]["rank"] = i + 1
    result["countries"] = countries
    if not args.no_export:
        OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"Scritto {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e3:.0f} KB)")
        top = sorted(countries.items(), key=lambda kv: -kv[1]["wave"]["p"])[:8]
        print("Ondate di proteste, primi 8:", ", ".join(f"{c['name']} {c['wave']['p']:.0%}" for _, c in top))


def M_label(t: int) -> str:
    return f"{t // 12}-{t % 12 + 1:02d}"


if __name__ == "__main__":
    main()
