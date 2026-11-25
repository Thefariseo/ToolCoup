"""Sistema di allerta sulla violenza politica, sul modello della metodologia pubblicata da ACLED CAST (Conflict Alert System).

Previsione, per ogni paese e provincia (admin1), del numero di eventi di violenza organizzata nei prossimi sei periodi di
quattro settimane (Battles, Explosions/remote violence, Violence against civilians e il loro totale).

  1. Unita' di tempo: periodi di 28 giorni che finiscono l'ultimo venerdi' completo; dati dal 2018.
  2. Livello paese (quello che il sito pubblica con le bande): per ciascun tipo di evento e per il totale, UN modello LightGBM per tutti e sei
     gli orizzonti (l'orizzonte e' una variabile), addestrato a prevedere il logaritmo del rapporto tra i conteggi futuri e la media mobile a 6
     periodi, con errore assoluto (L1). Ragioni, misurate in experiment_cast.py su 24 origini: la metrica pubblicata (WAPE, errore relativo) e' un
     errore assoluto, che si minimizza con la mediana e non con la media (Tweedie); sei volte piu' righe per modello riducono la varianza ai
     lunghi orizzonti; il peso delle osservazioni recenti segue il cambio di regime (Ucraina, Sudan, Sahel). Variabili: ritardi fino a sei periodi,
     medie a 3/6/13/26, pendenza, massimo, EWMA, quota degli attori, paesi vicini, totale mondiale, eta' della copertura, V-Dem e dati nazionali.
  3. Combinazione: la previsione pubblicata e' una media pesata di modello, media a 6 periodi e ultimo periodo, con pesi per orizzonte stimati
     (WAPE + errore relativo) sulle origini del backtest il cui esito era gia' noto, con riduzione verso i pesi uguali. Niente informazione dal futuro.
  4. Province: un modello analogo per il totale di ogni provincia, poi ridimensionato perche' le province sommino al paese (e i tipi al totale).
     E' piu' semplice della riconciliazione MinT di CAST: il totale paese e' piu' preciso della somma delle province.
  5. Incertezza: residui del backtest a finestra mobile (24 origini a passo di due periodi), scalati con sqrt(previsione + 1), quantili per tipo,
     orizzonte e classe di dimensione della previsione; la copertura e' misurata leave-one-origin-out.
  6. Confronto con la media mobile (6 e 13 periodi) e con l'ultimo periodo, per dare un termine di paragone.

Non si usano WorldPop ne' la mortalita' infantile subnazionale CIESIN: restano V-Dem e popolazione/mortalita' infantile nazionali.
Uso:  python pipeline/cast.py [--origins 24] [--stride 2] [--quick] [--reuse] [--out file]
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from countries import code_from_name  # noqa: E402
from export_web import slugify  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
ACLED = ROOT / "data" / "raw" / "acled"
OUT = ROOT / "webdata" / "violence.json"
TYPES = ["b", "e", "v"]
NAMES = {"b": "Battles", "e": "Explosions/remote violence", "v": "Violence against civilians", "o": "Organized violence"}
# Il disordine (proteste e disordini) si prevede con lo stesso metodo: le variabili restano quelle di sempre (la violenza organizzata e' un buon
# indizio del disordine), cambiano i bersagli. Le chiavi b, e, v, o dei risultati diventano: protesta pacifica, protesta con intervento delle forze
# dell'ordine (compreso l'uso eccessivo della forza), disordini (violent demonstration e mob violence), totale.
KINDS_CFG = {
    "violence": {"targets": {"b": "b", "e": "e", "v": "v", "o": "o"}, "names": NAMES, "out": "violence.json", "cache": "cast_backtest.pkl"},
    "unrest": {"targets": {"b": "pp", "e": "pi", "v": "rv", "o": "u"},
               "names": {"b": "Peaceful protest", "e": "Protest with intervention", "v": "Riots", "o": "Protests and riots"},
               "out": "unrest_counts.json", "cache": "cast_backtest_unrest.pkl"},
}
ETYPE = {"Battles": "b", "Explosions/Remote violence": "e", "Violence against civilians": "v"}
PERIOD, HORIZONS, START_YEAR = 28, 6, 2018
ALPHA = 0.2                                    # intervalli all'80%
BURN = 6                                       # periodi iniziali senza media a 6 periodi


# ------------------------------------------------------------------ dati
def load() -> tuple[pd.DataFrame, date]:
    frames = []
    for y in range(START_YEAR, date.today().year + 1):
        f = ACLED / f"acled_{y}.csv"
        if f.exists():
            d = pd.read_csv(f, usecols=lambda c: c in {"event_date", "event_type", "sub_event_type", "inter1", "inter2", "country", "admin1", "latitude", "longitude", "fatalities"})
            if "admin1" not in d:
                sys.exit(f"{f.name} non ha admin1: riscarica con pipeline/fetch_acled.py --from {START_YEAR}")
            frames.append(d)
    ev = pd.concat(frames, ignore_index=True)
    ev["date"] = pd.to_datetime(ev["event_date"]).dt.date
    ev["admin1"] = ev["admin1"].fillna("(unknown)").replace("", "(unknown)")
    last = ev["date"].max()
    # ultimo venerdi' (incluso) non oltre l'ultima data; i dati dell'ultima settimana possono essere incompleti: si scarta l'ultimo periodo incompleto
    end = last - timedelta(days=(last.weekday() - 4) % 7)
    return ev, end


def periods(end: date) -> tuple[list[date], int]:
    n = (end - date(START_YEAR, 1, 1)).days // PERIOD
    return [end - timedelta(days=PERIOD * (n - 1 - i)) for i in range(n)], n


def build_arrays(ev: pd.DataFrame, end: date, n: int) -> dict:
    ev = ev.copy()
    ev["p"] = n - 1 - ((pd.Timestamp(end) - pd.to_datetime(ev["date"])).dt.days // PERIOD)
    ev = ev[(ev["p"] >= 0) & (ev["p"] < n) & (pd.to_datetime(ev["date"]) <= pd.Timestamp(end))]
    ev["uid"] = ev["country"] + "|" + ev["admin1"]
    units = ev.drop_duplicates("uid")[["uid", "country", "admin1"]].sort_values("uid").reset_index(drop=True)
    uix = {u: i for i, u in enumerate(units["uid"])}
    ev["u"] = ev["uid"].map(uix)
    U = len(units)
    def mat(mask, weight=None):
        d = ev[mask]
        w = d[weight].fillna(0).to_numpy(float) if weight else np.ones(len(d))
        m = np.zeros((U, n), dtype=np.float32)
        np.add.at(m, (d["u"].to_numpy(), d["p"].to_numpy()), w)
        return m
    A = {t: mat(ev["event_type"].map(ETYPE).eq(t)) for t in TYPES}
    A["o"] = A["b"] + A["e"] + A["v"]
    A["fat"] = mat(ev["event_type"].isin(ETYPE), "fatalities")
    A["prot"] = mat(ev["event_type"].eq("Protests")); A["riot"] = mat(ev["event_type"].eq("Riots"))
    A["excess"] = mat(ev["sub_event_type"].eq("Excessive force against protesters"))
    A["pi"] = mat(ev["sub_event_type"].isin(["Protest with intervention", "Excessive force against protesters"]))
    A["pp"] = np.maximum(A["prot"] - A["pi"], 0); A["rv"] = A["riot"]; A["u"] = A["prot"] + A["riot"]
    A["strat"] = mat(ev["event_type"].eq("Strategic developments")); A["agree"] = mat(ev["sub_event_type"].eq("Agreement"))
    # l'API restituisce etichette di testo, i vecchi file i codici 1-8 (stesso ordine)
    ACTORS = ["State forces", "Rebel group", "Political militia", "Identity militia", "Rioters", "Protesters", "Civilians", "External/Other forces"]
    i1, i2 = ev["inter1"].astype(str), ev["inter2"].astype(str)
    for k, label in enumerate(ACTORS, start=1):
        A[f"i{k}"] = mat(ev["event_type"].isin(ETYPE) & (i1.isin([label, str(k), f"{k}.0"]) | i2.isin([label, str(k), f"{k}.0"])))
    geo = ev.groupby("u")[["latitude", "longitude"]].mean().reindex(range(U))
    return {"units": units, "A": A, "geo": geo, "n": n}


def lag(m: np.ndarray, k: int) -> np.ndarray:
    out = np.full_like(m, np.nan); out[:, k:] = m[:, :-k] if k else m
    return out


def roll(m: np.ndarray, w: int, fn) -> np.ndarray:
    out = np.full_like(m, np.nan, dtype=np.float32)
    for p in range(w - 1, m.shape[1]):
        out[:, p] = fn(m[:, p - w + 1:p + 1], axis=1)
    return out


def ewma(x: np.ndarray, a: float) -> np.ndarray:
    out = np.full_like(x, np.nan)
    out[:, 0] = x[:, 0]
    for p in range(1, x.shape[1]):
        out[:, p] = a * x[:, p] + (1 - a) * out[:, p - 1]
    return out


def slope(x: np.ndarray, w: int = 6) -> np.ndarray:
    out = np.full_like(x, np.nan)
    t = np.arange(w) - (w - 1) / 2
    out[:, w - 1:] = np.lib.stride_tricks.sliding_window_view(x, w, axis=1) @ t / (t @ t)
    return out


# ------------------------------------------------------------------ variabili
def features(A: dict, units: pd.DataFrame, geo: pd.DataFrame, ends: list[date], cy: pd.DataFrame, level: str, extra: dict | None = None) -> tuple[np.ndarray, list[str]]:
    """Matrice (U*P, F) per il livello 'admin1' o 'country'. A contiene gia' le matrici del livello."""
    U, P = A["o"].shape
    cols, names = [], []
    def add(name, m):
        cols.append(m.reshape(-1)); names.append(name)
    for k in ("b", "e", "v", "o", "fat", "prot", "riot", "excess", "strat", "agree"):
        add(f"{k}_t0", lag(A[k], 0))
    for k in ("b", "e", "v", "o"):
        add(f"{k}_t1", lag(A[k], 1)); add(f"{k}_t2", lag(A[k], 2))
    add("o_mean6", roll(A["o"], 6, np.mean)); add("o_std6", roll(A["o"], 6, np.std)); add("o_mean13", roll(A["o"], 13, np.mean))
    add("fat_mean6", roll(A["fat"], 6, np.mean))
    for name, m in (extra or {}).items():
        add(name, m)
    for k in range(1, 9):
        add(f"inter{k}_t0", lag(A[f"i{k}"], 0))
    if level == "admin1":
        from scipy.spatial import cKDTree
        lat, lon = np.radians(geo["latitude"].fillna(0).to_numpy()), np.radians(geo["longitude"].fillna(0).to_numpy())
        xyz = np.c_[np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)]
        _, nb = cKDTree(xyz).query(xyz, k=min(7, U))
        nb = nb[:, 1:]
        for k in ("b", "e", "v"):
            add(f"nb_{k}_t0", lag(A[k][nb].mean(axis=1), 0))
    pe = np.array([d.toordinal() for d in ends], dtype=np.float32)
    add("period_idx", np.tile(pe, (U, 1))); add("month", np.tile(np.array([d.month for d in ends], dtype=np.float32), (U, 1)))
    add("quarter", np.tile(np.array([(d.month - 1) // 3 for d in ends], dtype=np.float32), (U, 1)))
    cc = units["country"].map(lambda n: code_from_name(n)).to_numpy()
    have = set(cy.index.get_level_values(0))
    for v in ("v2x_polyarchy", "v2x_libdem", "v2x_civlib", "e_log_infmort", "e_log_pop"):
        m = np.full((U, P), np.nan, dtype=np.float32)
        for i, c in enumerate(cc):
            if c is not None and c == c and int(c) in have:
                s = cy.loc[int(c), v] if v in cy else None
                if s is not None:
                    yrs = np.array([d.year - 1 for d in ends])
                    m[i] = s.reindex(yrs).to_numpy(dtype=np.float32)
        add(v, m)
    return np.column_stack(cols).astype(np.float32), names


def rich_features(Ac: dict, names: list[str], geo: pd.DataFrame, ends: list[date], cy: pd.DataFrame):
    """Variabili per il livello paese, (n, P, nf): ritardi, medie, pendenza, massimo, EWMA, attori, paesi vicini, mondo, eta' della copertura."""
    n, P = Ac["o"].shape
    F, fn = [], []
    def add(name, m):
        F.append(np.asarray(m, dtype=np.float32)); fn.append(name)
    for k in ("o", "b", "e", "v", "fat", "prot", "riot"):
        lk = np.log1p(Ac[k])
        for j in range(6):
            add(f"{k}_l{j}", lag(lk, j))
        for w in (3, 6, 13, 26):
            add(f"{k}_m{w}", roll(lk, w, np.mean))
        add(f"{k}_sd6", roll(lk, 6, np.std)); add(f"{k}_max6", roll(lk, 6, np.max))
        add(f"{k}_slope6", slope(lk)); add(f"{k}_ew3", ewma(lk, 0.3)); add(f"{k}_ew6", ewma(lk, 0.6))
    lo = np.log1p(Ac["o"])
    add("o_last_vs_m6", lag(lo, 0) - roll(lo, 6, np.mean))
    add("o_m3_vs_m13", roll(lo, 3, np.mean) - roll(lo, 13, np.mean))
    for k in range(1, 9):
        add(f"inter{k}", np.log1p(lag(Ac[f"i{k}"], 0)))
    for k in ("excess", "strat", "agree"):
        add(k, np.log1p(lag(Ac[k], 0)))
    from scipy.spatial import cKDTree
    lat, lon = np.radians(geo["latitude"].fillna(0).to_numpy()), np.radians(geo["longitude"].fillna(0).to_numpy())
    xyz = np.c_[np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)]
    nb = cKDTree(xyz).query(xyz, k=min(7, n))[1][:, 1:]
    add("nb_o_l0", lo[nb].mean(axis=1)); add("nb_o_m6", roll(lo[nb].mean(axis=1), 6, np.mean))
    tot = np.log1p(Ac["o"].sum(axis=0, keepdims=True)).repeat(n, axis=0)
    add("glob_o", tot); add("glob_o_m6", roll(tot, 6, np.mean))
    first = np.array([np.argmax(r > 0) if (r > 0).any() else P for r in Ac["o"]])
    add("age", np.arange(P)[None, :] - first[:, None])
    add("period_idx", np.tile(np.array([d.toordinal() for d in ends], dtype=np.float32), (n, 1)))
    mo = np.array([d.month for d in ends], dtype=np.float32)
    add("month_sin", np.tile(np.sin(2 * np.pi * mo / 12), (n, 1))); add("month_cos", np.tile(np.cos(2 * np.pi * mo / 12), (n, 1)))
    cc = pd.Series(names).map(lambda s: code_from_name(s)).to_numpy()
    have = set(cy.index.get_level_values(0))
    for v in ("v2x_polyarchy", "v2x_libdem", "v2x_civlib", "e_log_infmort", "e_log_pop"):
        m = np.full((n, P), np.nan, dtype=np.float32)
        for i, c in enumerate(cc):
            if c is not None and c == c and int(c) in have and v in cy:
                m[i] = cy.loc[int(c), v].reindex(np.array([d.year - 1 for d in ends])).to_numpy(dtype=np.float32)
        add(v, m)
    return np.stack(F, axis=2), fn


def target(A: np.ndarray, h: int) -> np.ndarray:
    out = np.full_like(A, np.nan); out[:, :-h] = A[:, h:]
    return out.reshape(-1)


# ------------------------------------------------------------------ modelli
def lgbm(n_trees: int):
    """Tweedie con un modello per orizzonte: il modello delle prime versioni, tenuto come riferimento negli esperimenti."""
    import lightgbm as lgb
    return lgb.LGBMRegressor(objective="tweedie", tweedie_variance_power=1.4, n_estimators=n_trees, learning_rate=0.05, num_leaves=31, min_child_samples=40,
                             subsample=0.8, subsample_freq=1, colsample_bytree=0.7, reg_lambda=2.0, verbose=-1, n_jobs=-1, random_state=0)


def lgb_l1(n_trees: int, **kw):
    import lightgbm as lgb
    p = dict(objective="l1", n_estimators=n_trees, learning_rate=0.05, num_leaves=31, min_child_samples=60, subsample=0.8, subsample_freq=1,
             colsample_bytree=0.6, reg_lambda=3.0, verbose=-1, n_jobs=-1, random_state=0, deterministic=True, force_row_wise=True)
    p.update(kw)
    return lgb.LGBMRegressor(**p)


def pooled_country(F: np.ndarray, Y: np.ndarray, ma6: np.ndarray, T: int, trees: int, halflife: float = 40.0) -> dict[int, np.ndarray]:
    """Un solo modello per tutti gli orizzonti, alla data T. Bersaglio: log1p(y[p+h]) - log1p(ma6[p]); errore assoluto; peso che decade con l'eta'."""
    n, P, nf = F.shape
    Xs, ys, ws = [], [], []
    for h in range(1, HORIZONS + 1):
        p0, p1 = BURN, T - h
        if p1 < p0:
            continue
        X = F[:, p0:p1 + 1, :].reshape(-1, nf)
        z = (np.log1p(Y[:, p0 + h:p1 + h + 1]) - np.log1p(ma6[:, p0:p1 + 1])).reshape(-1)
        ok = np.isfinite(z)
        Xs.append(np.column_stack([X[ok], np.full(ok.sum(), h, dtype=np.float32)])); ys.append(z[ok])
        age = np.broadcast_to(np.arange(p0, p1 + 1)[None, :], (n, p1 - p0 + 1)).reshape(-1)[ok]
        ws.append(0.5 ** ((T - h - age) / halflife))
    m = lgb_l1(trees).fit(np.vstack(Xs), np.concatenate(ys), sample_weight=np.concatenate(ws))
    return {h: np.maximum(np.expm1(np.log1p(ma6[:, T]) + m.predict(np.column_stack([F[:, T, :], np.full(n, h, dtype=np.float32)]))), 0) for h in range(1, HORIZONS + 1)}


def pooled_admin1(X3: np.ndarray, fnames: list[str], Yo: np.ndarray, ma6: np.ndarray, T: int, trees: int, halflife: float = 40.0, active: str = "o_mean13") -> dict[int, np.ndarray]:
    """Come pooled_country, per il totale di ogni provincia. Solo le province con eventi nelle ultime 13 periodi entrano nell'addestramento; le altre prevedono zero."""
    U, P, nf = X3.shape
    i13 = fnames.index(active)
    Xs, ys, ws = [], [], []
    for h in range(1, HORIZONS + 1):
        p0, p1 = BURN, T - h
        if p1 < p0:
            continue
        X = X3[:, p0:p1 + 1, :]
        z = np.log1p(Yo[:, p0 + h:p1 + h + 1]) - np.log1p(ma6[:, p0:p1 + 1])
        sel = np.isfinite(z) & (X[..., i13] > 0)
        Xh = X[sel]
        Xs.append(np.column_stack([Xh, np.full(len(Xh), h, dtype=np.float32)])); ys.append(z[sel])
        age = np.broadcast_to(np.arange(p0, p1 + 1)[None, :], z.shape)[sel]
        ws.append(0.5 ** ((T - h - age) / halflife))
    m = lgb_l1(trees, subsample=0.5).fit(np.vstack(Xs), np.concatenate(ys), sample_weight=np.concatenate(ws))
    live = X3[:, T, i13] > 0
    out = {}
    for h in range(1, HORIZONS + 1):
        v = np.zeros(U)
        xt = np.column_stack([X3[live, T, :], np.full(live.sum(), h, dtype=np.float32)])
        v[live] = np.maximum(np.expm1(np.log1p(ma6[live, T]) + m.predict(xt)), 0)
        out[h] = v
    return out


def blend_weights(model: np.ndarray, ma6: np.ndarray, last: np.ndarray, truth: np.ndarray) -> np.ndarray:
    """Pesi (modello, media a 6 periodi, ultimo periodo) che minimizzano WAPE + errore relativo, ridotti verso i pesi uguali."""
    from scipy.optimize import minimize
    X = np.stack([model, ma6, last], axis=1)
    def loss(w):
        w = np.abs(w) / np.abs(w).sum()
        f = X @ w
        return np.abs(f - truth).sum() / max(truth.sum(), 1) + np.mean(np.abs(f - truth) / (ma6 + 1)) + 0.02 * np.sum((w - 1 / 3) ** 2)
    w = minimize(loss, np.ones(3) / 3, method="Nelder-Mead", options={"xatol": 1e-3, "fatol": 1e-6, "maxiter": 400}).x
    return np.abs(w) / np.abs(w).sum()


# ------------------------------------------------------------------ punteggio con intervalli
# Il Weighted Interval Score (Bracher et al. 2021) e' una regola di punteggio propria per previsioni a intervalli: con molti intervalli tende al CRPS,
# l'errore di una previsione probabilistica di un conteggio. Qui 3 intervalli (50%, 80%, 95%) e la mediana. Vale la stessa disciplina del resto:
# i quantili dei residui di ogni origine si stimano sulle ALTRE origini (leave-one-origin-out), con la stessa regola per il modello, le medie e l'ultimo periodo.
WIS_ALPHAS = (0.5, 0.2, 0.05)
_EDGES = np.array([1, 3, 10, 30, 100, 300])


def _residual_quantiles(vecs: list, truths: list, alpha: float) -> np.ndarray:
    """Quantili (basso, alto) dei residui scalati per classe di dimensione della previsione; (len(_EDGES)+1, 2)."""
    bl, tr = np.concatenate(vecs), np.concatenate(truths)
    r = (tr - bl) / np.sqrt(bl + 1)
    bk, live = np.digitize(bl, _EDGES), bl >= 1
    pool = (np.quantile(r[live], alpha / 2), np.quantile(r[live], 1 - alpha / 2)) if live.sum() > 50 else (-1.0, 1.0)
    Q = np.empty((len(_EDGES) + 1, 2))
    for k in range(len(_EDGES) + 1):
        m = bk == k
        Q[k] = (np.quantile(r[m], alpha / 2), np.quantile(r[m], 1 - alpha / 2)) if m.sum() >= 40 else pool
    return Q


def weighted_interval_score(truth: np.ndarray, mid: np.ndarray, Qs: dict, alphas=WIS_ALPHAS) -> np.ndarray:
    """WIS di ogni previsione: (0.5 |y - mediana| + somma_k (alpha_k / 2) * IS_k) / (K + 0.5)."""
    k, sd = np.digitize(mid, _EDGES), np.sqrt(mid + 1)
    total = 0.5 * np.abs(truth - mid)
    for a in alphas:
        lo, hi = np.maximum(0.0, mid + Qs[a][k, 0] * sd), mid + Qs[a][k, 1] * sd
        total = total + (a / 2) * ((hi - lo) + (2 / a) * np.maximum(lo - truth, 0) + (2 / a) * np.maximum(truth - hi, 0))
    return total / (len(alphas) + 0.5)


def wis_by_origin(series: dict, truths: list, keeps: list, alphas=WIS_ALPHAS) -> dict:
    """WIS medio per previsione, per ciascuna serie ('mix', 'model', 'ma6', 'last'); `series[nome][i]` e' il vettore dell'origine i."""
    out = {}
    for name, vecs in series.items():
        parts = []
        for j in range(len(truths)):
            rest = [i for i in range(len(truths)) if i != j]
            Qs = {a: _residual_quantiles([vecs[i] for i in rest], [truths[i] for i in rest], a) for a in alphas}
            parts.append(weighted_interval_score(truths[j][keeps[j]], vecs[j][keeps[j]], Qs, alphas))
        out[name] = round(float(np.concatenate(parts).mean()), 2)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--origins", type=int, default=24, help="origini del backtest per i pesi e gli intervalli")
    ap.add_argument("--stride", type=int, default=2, help="periodi tra due origini")
    ap.add_argument("--quick", action="store_true", help="meno alberi, per provare")
    ap.add_argument("--reuse", action="store_true", help="riusa il backtest salvato se i dati non sono cambiati")
    ap.add_argument("--out", default=None, help="file di uscita (default: webdata/violence.json, o unrest_counts.json con --kind unrest)")
    ap.add_argument("--kind", choices=list(KINDS_CFG), default="violence", help="violence: violenza organizzata; unrest: proteste e disordini")
    args = ap.parse_args()
    warnings.simplefilter("ignore")
    cfg = KINDS_CFG[args.kind]
    trees = 80 if args.quick else 250
    ev, end = load()
    ends, P = periods(end)
    D = build_arrays(ev, end, P)
    units, A, geo = D["units"], D["A"], D["geo"]
    U = len(units)
    cty = units["country"].astype("category"); names = list(cty.cat.categories); C = len(names); ci = cty.cat.codes.to_numpy()
    print(f"{U} unita' admin1 in {C} paesi, {P} periodi di {PERIOD} giorni fino al {end}", flush=True)
    from panel import load_country_years
    cy = load_country_years().set_index(["ccode", "year"])
    Acty = {}
    for k, m in A.items():
        g = np.zeros((C, P), dtype=np.float32); np.add.at(g, ci, m); Acty[k] = g
    geoc = geo.groupby(ci)[["latitude", "longitude"]].mean().reindex(range(C))
    F, _ = rich_features(Acty, names, geoc, ends, cy)
    KINDS = ["o"] + TYPES
    AT = {t: A[cfg["targets"][t]] for t in KINDS}                              # bersagli a livello admin1
    Y = {t: Acty[cfg["targets"][t]] for t in KINDS}                            # bersagli a livello paese
    MA = {t: roll(Y[t], 6, np.mean) for t in KINDS}
    origins = [P - 1 - HORIZONS - args.stride * k for k in range(args.origins)][::-1]

    # --- backtest: il modello alle origini passate (salvato: cambiare pesi e intervalli non lo rifa)
    cache = ROOT / "data" / "raw" / cfg["cache"]
    key = (P, end.isoformat(), args.origins, args.stride, trees, "pooled-l1-v2")
    bt = {}
    if args.reuse and cache.exists():
        saved = pd.read_pickle(cache)
        if saved["key"] == key:
            bt = saved["bt"]; print("riuso il backtest salvato")
    if not bt:
        for i, T in enumerate(origins):
            for t in KINDS:
                fc_t = pooled_country(F, Y[t], MA[t], T, trees)
                for h in range(1, HORIZONS + 1):
                    bt[(T, h, t)] = fc_t[h].astype(np.float32)
            print(f"backtest origine {i + 1}/{len(origins)} (periodo {T}, {ends[T]})", flush=True)
        pd.to_pickle({"key": key, "bt": bt}, cache)

    def parts(T, h, t):
        return bt[(T, h, t)], MA[t][:, T], Y[t][:, T], Y[t][:, T + h]

    def weights_at(T, h):
        """Pesi stimati con le sole origini il cui esito era noto in T."""
        past = [o for o in origins if o + h <= T]
        if len(past) < 4:
            return np.ones(3) / 3
        cols = [np.concatenate([parts(o, h, "o")[k] for o in past]) for k in range(4)]
        return blend_weights(*cols)

    def blended(T, h, w):
        """Totale, poi tipi ridimensionati perche' sommino al totale."""
        out = {}
        for t in KINDS:
            m, a, l, _ = parts(T, h, t)
            out[t] = w[0] * m + w[1] * a + w[2] * l
        s = sum(out[t] for t in TYPES)
        scale = np.where(s > 0, out["o"] / np.maximum(s, 1e-9), 0)
        for t in TYPES:
            out[t] = np.where(s > 0, out[t] * scale, out["o"] / 3)
        return out

    W_at = {(T, h): weights_at(T, h) for T in origins for h in range(1, HORIZONS + 1)}
    store = {h: [] for h in range(1, HORIZONS + 1)}                 # per orizzonte: (origine, previsioni, residui scalati) su totali e tipi del paese
    pooled = {h: [] for h in range(1, HORIZONS + 1)}                # per orizzonte: (pubblicata, modello, media a 6, ultimo, esito) sul totale del paese
    for T in origins:
        for h in range(1, HORIZONS + 1):
            b = blended(T, h, W_at[(T, h)])
            vec = np.concatenate([b[t] for t in KINDS]); truth = np.concatenate([Y[t][:, T + h] for t in KINDS])
            store[h].append((T, vec, (truth - vec) / np.sqrt(vec + 1)))
            m, a, l, tr = parts(T, h, "o")
            pooled[h].append((b["o"], m, a, l, tr))

    # Intervalli: quantili dei residui scalati, separati per classe di dimensione della previsione (la dispersione dei conteggi cresce piu' di sqrt(media):
    # mescolare paesi quasi senza eventi e grandi conflitti rende le bande troppo strette per i secondi) e lisciati sull'orizzonte.
    EDGES = np.array([1, 3, 10, 30, 100, 300])
    NB = len(EDGES) + 1
    bucket = lambda x: np.digitize(x, EDGES)

    def fit_Q(use: list[int]) -> np.ndarray:
        Q = np.full((HORIZONS, NB, 2), np.nan)
        for h in range(1, HORIZONS + 1):
            bl = np.concatenate([v for (o, v, r) in store[h] if o in use]); r = np.concatenate([r for (o, v, r) in store[h] if o in use]); bk = bucket(bl)
            live = bl >= 1
            pool = (np.quantile(r[live], ALPHA / 2), np.quantile(r[live], 1 - ALPHA / 2)) if live.sum() > 50 else (-1.0, 1.0)
            for k in range(NB):
                m = bk == k
                Q[h - 1, k] = (np.quantile(r[m], ALPHA / 2), np.quantile(r[m], 1 - ALPHA / 2)) if m.sum() >= 40 else pool
        sm = np.empty_like(Q)
        for k in range(NB):
            for j in range(2):
                sm[:, k, j] = np.convolve(np.pad(Q[:, k, j], 1, mode="edge"), np.ones(3) / 3, mode="valid")
        return sm

    def band(v: np.ndarray, h: int, Q: np.ndarray):
        k = bucket(v)
        return np.maximum(0.0, v + Q[h - 1, k, 0] * np.sqrt(v + 1)), v + Q[h - 1, k, 1] * np.sqrt(v + 1)

    Q_all = fit_Q(origins)
    Q_loo = {o: fit_Q([x for x in origins if x != o]) for o in origins} if len(origins) > 1 else {o: Q_all for o in origins}

    # accuratezza (livello paese, totale). WAPE: errore assoluto totale / eventi totali (pesa i paesi grandi). Errore relativo: |errore| / (media a 6 periodi + 1),
    # medio sui paesi (ogni paese conta uguale). RMSLE: errore quadratico medio in scala logaritmica. Copertura: leave-one-origin-out (le bande di ogni origine
    # usano quantili stimati sulle altre), sui paesi con previsione di almeno un evento e su tutti.
    acc = []
    for h in range(1, HORIZONS + 1):
        rows = pooled[h]
        bl, mo, m6, la, tr = (np.concatenate([r[i] for r in rows]) for i in range(5))
        lo_, hi_ = (np.concatenate(x) for x in zip(*[band(r[0], h, Q_loo[o]) for o, r in zip(origins, rows)]))
        keep = (m6 + la + tr) > 0
        met = lambda f: {"wape": round(float(np.abs(f[keep] - tr[keep]).sum() / max(tr[keep].sum(), 1)), 3), "rel": round(float(np.mean(np.abs(f[keep] - tr[keep]) / (m6[keep] + 1))), 3),
                         "rmsle": round(float(np.sqrt(np.mean((np.log1p(f[keep]) - np.log1p(tr[keep])) ** 2))), 3)}
        inside = (tr >= lo_) & (tr <= hi_); live = bl >= 1
        wis = wis_by_origin({"mix": [r[0] for r in rows], "model": [r[1] for r in rows], "ma6": [r[2] for r in rows], "last": [r[3] for r in rows]},
                            [r[4] for r in rows], [(r[2] + r[3] + r[4]) > 0 for r in rows])
        acc.append({"h": h, "n": int(keep.sum()), "mix": met(bl), "model": met(mo), "ma6": met(m6), "last": met(la), "wis": wis,
                    "coverage": round(float(inside[live].mean()), 3), "coverage_all": round(float(inside.mean()), 3), "n_live": int(live.sum())})
        print("  accuratezza paese h=%d:" % h, acc[-1], flush=True)

    # --- previsione dall'ultimo periodo
    print("previsione finale...", flush=True)
    T0 = P - 1
    W_live = {h: blend_weights(*[np.concatenate([parts(o, h, "o")[k] for o in origins if o + h <= T0]) for k in range(4)]) for h in range(1, HORIZONS + 1)}
    live_fc = {t: pooled_country(F, Y[t], MA[t], T0, trees) for t in KINDS}
    fc = {}                                                                 # h -> {tipo: previsioni dei paesi}
    for h in range(1, HORIZONS + 1):
        w = W_live[h]
        out = {t: w[0] * live_fc[t][h] + w[1] * MA[t][:, T0] + w[2] * Y[t][:, T0] for t in KINDS}
        s = sum(out[t] for t in TYPES)
        for t in TYPES:
            out[t] = np.where(s > 0, out[t] * out["o"] / np.maximum(s, 1e-9), out["o"] / 3)
        fc[h] = out

    # province: stesso metodo sul totale della provincia, poi ridimensionato perche' le province sommino al paese
    extra = {"t_mean13": roll(AT["o"], 13, np.mean)} if args.kind != "violence" else None      # le province attive sono quelle con proteste, non con violenza
    Xa, na = features(A, units, geo, ends, cy, "admin1", extra)
    ma6_a = roll(AT["o"], 6, np.mean)
    adm = pooled_admin1(Xa.reshape(U, P, -1), na, AT["o"], ma6_a, T0, trees, active="t_mean13" if extra else "o_mean13")
    for h in range(1, HORIZONS + 1):
        for c in range(C):
            idx = np.flatnonzero(ci == c)
            s = adm[h][idx].sum()
            if s > 0:
                adm[h][idx] *= fc[h]["o"][c] / s
            else:
                share = ma6_a[idx, T0]; share = share / share.sum() if share.sum() > 0 else np.ones(len(idx)) / len(idx)
                adm[h][idx] = fc[h]["o"][c] * share

    next_ends = [end + timedelta(days=PERIOD * h) for h in range(1, HORIZONS + 1)]
    cm = json.loads((ROOT / "webdata" / "countries.json").read_text())
    slug_by_name = {c["name"]: c["slug"] for c in cm}
    out_c, out_a = {}, {}
    for i, nm in enumerate(names):
        slug = slug_by_name.get(nm) or slugify(nm)
        rec = {"name": nm, "hist": {t: [int(v) for v in Y[t][i, -26:]] for t in KINDS},
               "ma6": round(float(Y["o"][i, -6:].mean()), 1), "ma13": round(float(Y["o"][i, -13:].mean()), 1), "fc": {}}
        for t in KINDS:
            seq = []
            for h in range(1, HORIZONS + 1):
                v = fc[h][t][i:i + 1]
                lo, hi = band(v, h, Q_all)
                seq.append([round(float(v[0]), 1), round(float(lo[0]), 1), round(float(hi[0]), 1)])
            rec["fc"][t] = seq
        out_c[slug] = rec
    # admin1: i 12 piu' violenti previsti per paese
    for ci_, nm in enumerate(names):
        idx = np.flatnonzero(ci == ci_)
        idx = idx[np.argsort(-np.sum([adm[h][idx] for h in adm], axis=0))][:12]
        out_a[slug_by_name.get(nm) or slugify(nm)] = [{"name": units.loc[j, "admin1"], "lat": None if np.isnan(geo.loc[j, "latitude"]) else round(float(geo.loc[j, "latitude"]), 2),
                                                        "lon": None if np.isnan(geo.loc[j, "longitude"]) else round(float(geo.loc[j, "longitude"]), 2),
                                                        "ma6": round(float(AT["o"][j, -6:].mean()), 1), "fc": [round(float(adm[h][j]), 1) for h in adm]} for j in idx]
    gl = {"hist": {t: [int(v) for v in AT[t].sum(axis=0)[-26:]] for t in KINDS}, "fc": {t: [[round(float(fc[h][t].sum()), 1)] for h in range(1, HORIZONS + 1)] for t in KINDS}}
    result = {"meta": {"generated": date.today().isoformat(), "last_period_end": end.isoformat(), "period_days": PERIOD, "horizons": [e.isoformat() for e in next_ends],
                       "history_ends": [e.isoformat() for e in ends[-26:]], "interval": f"{int((1 - ALPHA) * 100)}%", "scoring": "wis: weighted interval score with 50/80/95% intervals and the median (a proper score that approaches CRPS); quantiles of each origin estimated on the other origins", "types": cfg["names"], "kind": args.kind, "accuracy_country_total": acc,
                       "units": int(U), "countries": len(names), "backtest_origins": len(origins), "backtest_stride": args.stride,
                       "method": ("Targets are protests and riots (ACLED), with the same features as the violence model. " if args.kind == "unrest" else "") + "one LightGBM model for all six horizons, trained with absolute error on the log ratio to the 6-period average, blended with the 6-period average and the last period (weights fitted on past backtest origins); provinces scaled to the country total; scaled-residual intervals from a rolling backtest",
                       "mix_weights": {f"h{h}": {"model": round(float(W_live[h][0]), 3), "avg6": round(float(W_live[h][1]), 3), "last": round(float(W_live[h][2]), 3)} for h in range(1, HORIZONS + 1)}},
              "global": gl, "countries": out_c, "admin1": out_a}
    dest = Path(args.out) if args.out else ROOT / "webdata" / cfg["out"]
    dest.write_text(json.dumps(result, separators=(",", ":"), ensure_ascii=False))
    print(f"Scritto {dest} ({dest.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
