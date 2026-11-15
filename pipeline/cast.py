"""Sistema di allerta sulla violenza politica, sul modello della metodologia pubblicata da ACLED CAST (Conflict Alert System).

Previsione, per ogni paese e provincia (admin1), del numero di eventi di violenza organizzata nei prossimi sei periodi di
quattro settimane (Battles, Explosions/remote violence, Violence against civilians e il loro totale).

  1. Unita' di tempo: periodi di 28 giorni che finiscono l'ultimo venerdi' completo; dati dal 2018.
  2. Gerarchia: globale > paese > admin1, e tipo di evento > totale. Previsioni di base a ogni livello.
  3. Modello: LightGBM con obiettivo Tweedie (conteggi con molti zeri), un modello per livello, tipo e orizzonte.
  4. Riconciliazione: le previsioni di base vengono rese coerenti (le province sommano al paese, i tipi al totale) con
     minimi quadrati ponderati (pesi strutturali, risolti con gradienti coniugati). E' la variante WLS di MinT, piu' semplice di
     MinTraceSparse; dopo di essa i valori negativi sono portati a zero e le somme ricalcolate dal basso.
  5. Incertezza: residui di un backtest a finestra mobile, scalati con sqrt(previsione + 1), quantili per livello, tipo e orizzonte,
     per classe di dimensione della previsione e lisciati sull'orizzonte. E' una versione semplificata dell'approccio conforme; la copertura e' misurata
     leave-one-origin-out (le bande di un'origine usano quantili stimati sulle altre).
  6. Combinazione: la previsione pubblicata e' la media semplice di modello, media a 6 periodi e ultimo periodo. Alle distanze lunghe il modello da solo non batte
     i riferimenti semplici; pesi stimati sul backtest erano instabili con cinque origini, quindi i pesi sono uguali e non stimati.
  7. Confronto con la media mobile (6 e 13 periodi), per dare un termine di paragone.

Non si usano WorldPop ne' la mortalita' infantile subnazionale CIESIN: restano V-Dem e popolazione/mortalita' infantile nazionali.
Uso:  python pipeline/cast.py [--origins 5] [--quick]
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
import scipy.sparse as sp
from scipy.sparse.linalg import cg

sys.path.insert(0, str(Path(__file__).resolve().parent))
from countries import code_from_name  # noqa: E402
from export_web import slugify  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
ACLED = ROOT / "data" / "raw" / "acled"
OUT = ROOT / "webdata" / "violence.json"
TYPES = ["b", "e", "v"]
NAMES = {"b": "Battles", "e": "Explosions/remote violence", "v": "Violence against civilians", "o": "Organized violence"}
ETYPE = {"Battles": "b", "Explosions/Remote violence": "e", "Violence against civilians": "v"}
PERIOD, HORIZONS, START_YEAR = 28, 6, 2018
ALPHA = 0.2                                    # intervalli all'80%


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


# ------------------------------------------------------------------ variabili
def features(A: dict, units: pd.DataFrame, geo: pd.DataFrame, ends: list[date], cy: pd.DataFrame, level: str) -> tuple[np.ndarray, list[str]]:
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


def target(A: np.ndarray, h: int) -> np.ndarray:
    out = np.full_like(A, np.nan); out[:, :-h] = A[:, h:]
    return out.reshape(-1)


# ------------------------------------------------------------------ aggregazione e riconciliazione
def hierarchy(units: pd.DataFrame):
    """Matrice di aggregazione sparsa (righe aggregate, colonne = nodi di base admin1 x tipo)."""
    U = len(units); cty = units["country"].astype("category"); C = len(cty.cat.categories); ci = cty.cat.codes.to_numpy()
    nb = 3 * U
    rows, cols = [], []
    def col(u, k): return k * U + u
    r = 0
    admin_total = r                                    # U righe
    for u in range(U):
        for k in range(3):
            rows.append(r + u); cols.append(col(u, k))
    r += U
    country_type = r                                    # 3C
    for u in range(U):
        for k in range(3):
            rows.append(r + k * C + ci[u]); cols.append(col(u, k))
    r += 3 * C
    country_total = r                                   # C
    for u in range(U):
        for k in range(3):
            rows.append(r + ci[u]); cols.append(col(u, k))
    r += C
    global_type = r                                     # 3
    for u in range(U):
        for k in range(3):
            rows.append(r + k); cols.append(col(u, k))
    r += 3
    for u in range(U):                                  # globale totale
        for k in range(3):
            rows.append(r); cols.append(col(u, k))
    r += 1
    S = sp.csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(r, nb))
    return S, {"admin_total": admin_total, "country_type": country_type, "country_total": country_total, "global_type": global_type, "global_total": r - 1, "C": C, "ci": ci}


def reconcile(base_bottom: np.ndarray, base_agg: np.ndarray, S: sp.csr_matrix) -> np.ndarray:
    """WLS con pesi strutturali: min sum_i (yhat_i - (S b)_i)^2 / w_i, w_i = numero di nodi di base sotto i. Risolto con CG."""
    w = np.asarray(S.sum(axis=1)).ravel(); Wi = sp.diags(1.0 / w)
    A = sp.identity(S.shape[1]) + S.T @ Wi @ S
    rhs = base_bottom + S.T @ (Wi @ base_agg)
    b, info = cg(A, rhs, rtol=1e-6, maxiter=400, M=sp.diags(1.0 / A.diagonal()))
    return np.maximum(b, 0)


# ------------------------------------------------------------------ modelli
def lgbm(n_trees: int):
    import lightgbm as lgb
    return lgb.LGBMRegressor(objective="tweedie", tweedie_variance_power=1.4, n_estimators=n_trees, learning_rate=0.05, num_leaves=31, min_child_samples=40,
                             subsample=0.8, subsample_freq=1, colsample_bytree=0.7, reg_lambda=2.0, verbose=-1, n_jobs=-1, random_state=0)


def fit_predict(Xa, Ya, Xc, Yc, origin: int, n_trees: int, P: int):
    # il modello impara la correzione rispetto alla media mobile a 6 periodi (offset nel log): non puo' fare peggio di quella per costruzione
    offset = {(lv, t): roll(Y[t], 6, np.mean).reshape(-1) for lv, Y in (('admin1', Ya), ('country', Yc)) for t in TYPES + ['o']}
    """Addestra con le sole righe il cui bersaglio (periodo p+h) e' noto a 'origin' e prevede da 'origin'.
    Restituisce {(livello, tipo, h): array(unita')} per admin1 e paese."""
    out = {}
    for level, X, Y in (("admin1", Xa, Ya), ("country", Xc, Yc)):
        U = Y["o"].shape[0]
        pidx = np.tile(np.arange(P), U)
        for t in TYPES + ["o"]:
            for h in range(1, HORIZONS + 1):
                y = target(Y[t], h)
                off = np.log(offset[(level, t)] + 0.5)
                tr = (pidx + h <= origin) & ~np.isnan(y) & ~np.isnan(X[:, 0]) & np.isfinite(off)
                m = lgbm(n_trees).fit(X[tr], y[tr], init_score=off[tr])
                now = (pidx == origin)
                out[(level, t, h)] = np.exp(m.predict(X[now], raw_score=True) + off[now]) - 0.5
                out[(level, t, h)] = np.maximum(out[(level, t, h)], 0)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--origins", type=int, default=5, help="origini del backtest per gli intervalli")
    ap.add_argument("--quick", action="store_true", help="meno alberi, per provare")
    ap.add_argument("--reuse", action="store_true", help="riusa il backtest salvato se i dati non sono cambiati")
    args = ap.parse_args()
    warnings.simplefilter("ignore")
    n_trees = 60 if args.quick else 160
    ev, end = load()
    ends, P = periods(end)
    D = build_arrays(ev, end, P)
    units, A, geo = D["units"], D["A"], D["geo"]
    print(f"{len(units)} unita' admin1 in {units['country'].nunique()} paesi, {P} periodi di {PERIOD} giorni fino al {end}")
    from panel import load_country_years
    cy = load_country_years().set_index(["ccode", "year"])
    # livello paese
    cty = units["country"].astype("category"); C = len(cty.cat.categories); ci = cty.cat.codes.to_numpy()
    Acty = {}
    for k, m in A.items():
        g = np.zeros((C, P), dtype=np.float32); np.add.at(g, ci, m); Acty[k] = g
    cunits = pd.DataFrame({"country": list(cty.cat.categories)}); cunits["admin1"] = ""
    Xa, na = features(A, units, geo, ends, cy, "admin1")
    Xc, nc = features(Acty, cunits, geo, ends, cy, "country")
    S, meta = hierarchy(units)
    U = len(units)

    def forecast_from(origin: int, trees: int):
        """Previsioni riconciliate a ogni livello per h=1..6, a partire dal periodo 'origin'."""
        base = fit_predict(Xa, A, Xc, Acty, origin, trees, P)
        res = {}
        for h in range(1, HORIZONS + 1):
            bb = np.concatenate([base[("admin1", t, h)] for t in TYPES])
            agg = np.zeros(S.shape[0])
            r0 = meta
            agg[r0["admin_total"]:r0["admin_total"] + U] = base[("admin1", "o", h)]
            for k, t in enumerate(TYPES):
                agg[r0["country_type"] + k * meta["C"]:r0["country_type"] + (k + 1) * meta["C"]] = base[("country", t, h)]
            agg[r0["country_total"]:r0["country_total"] + meta["C"]] = base[("country", "o", h)]
            for k, t in enumerate(TYPES):
                agg[r0["global_type"] + k] = base[("country", t, h)].sum()
            agg[r0["global_total"]] = base[("country", "o", h)].sum()
            b = reconcile(bb, agg, S)
            res[h] = (b, S @ b)
        return res

    # --- backtest: origini a ritroso di 4 periodi (salvato, cosi' cambiare pesi e intervalli non lo rifa)
    nb = S.shape[1]
    ct = slice(nb + meta["country_total"], nb + meta["country_total"] + meta["C"])

    def naive(origin: int):
        """Riferimenti coerenti a ogni livello: media dei 6 periodi fino a 'origin' e ultimo periodo."""
        ma6_b = np.concatenate([A[t][:, origin - 5:origin + 1].mean(axis=1) for t in TYPES]); last_b = np.concatenate([A[t][:, origin] for t in TYPES])
        return np.concatenate([ma6_b, S @ ma6_b]), np.concatenate([last_b, S @ last_b])

    cache = ROOT / "data" / "raw" / "cast_backtest.pkl"
    key = (P, end.isoformat(), args.origins, n_trees)
    bt = {}
    if args.reuse and cache.exists():
        saved = pd.read_pickle(cache)
        if saved["key"] == key:
            bt = saved["bt"]; print("riuso il backtest salvato")
    if not bt:
        for k in range(args.origins):
            origin = P - 1 - HORIZONS - 4 * k
            print(f"backtest origine {origin} ({ends[origin]})...", flush=True)
            fc_o = forecast_from(origin, n_trees)
            ma6_f, last_f = naive(origin)
            for h, (b, aggv) in fc_o.items():
                truth_b = np.concatenate([A[t][:, origin + h] for t in TYPES])
                bt[(origin, h)] = tuple(x.astype(np.float32) for x in (np.concatenate([b, aggv]), np.concatenate([truth_b, S @ truth_b]), ma6_f, last_f))
        pd.to_pickle({"key": key, "bt": bt}, cache)
    origins = sorted({o for o, _ in bt})

    # Combinazione di previsioni: media semplice di modello, media a 6 periodi e ultimo periodo. I pesi sono uguali e non stimati: con cinque origini
    # i pesi stimati sul backtest sono instabili (valutati leave-one-origin-out erano peggiori dell'ultimo periodo oltre i 2 periodi), mentre la media
    # semplice non e' mai molto peggiore della migliore delle tre previsioni e quasi sempre migliore della peggiore. Le tre sono coerenti, quindi lo e' la miscela.
    W = (1 / 3, 1 / 3, 1 / 3)
    cty_slices = [ct, slice(nb + meta["country_type"], nb + meta["country_type"] + 3 * meta["C"])]      # totali per paese e paese x tipo
    store = {h: [] for h in range(1, HORIZONS + 1)}                                                    # per orizzonte: (miscela, residuo scalato) per origine
    pooled = {h: [] for h in range(1, HORIZONS + 1)}
    for o in origins:
        for h in range(1, HORIZONS + 1):
            full, truth, ma6f, lastf = bt[(o, h)]
            bl = W[0] * full + W[1] * ma6f + W[2] * lastf
            sl_all = np.concatenate([np.arange(nb)[:0]] + [np.arange(sl.start, sl.stop) for sl in cty_slices])
            store[h].append((o, bl[sl_all], (truth[sl_all] - bl[sl_all]) / np.sqrt(bl[sl_all] + 1)))
            pooled[h].append((bl[ct], full[ct], ma6f[ct], lastf[ct], truth[ct]))

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
        parts = [(o, pooled[h][i]) for i, o in enumerate(origins)]
        bl, mo, m6, la, tr = (np.concatenate([p_[i] for _, p_ in parts]) for i in range(5))
        lo_, hi_ = (np.concatenate(x) for x in zip(*[band(p_[0], h, Q_loo[o]) for o, p_ in parts]))
        keep = (m6 + la + tr) > 0
        met = lambda f: {"wape": round(float(np.abs(f[keep] - tr[keep]).sum() / max(tr[keep].sum(), 1)), 3), "rel": round(float(np.mean(np.abs(f[keep] - tr[keep]) / (m6[keep] + 1))), 3),
                         "rmsle": round(float(np.sqrt(np.mean((np.log1p(f[keep]) - np.log1p(tr[keep])) ** 2))), 3)}
        inside = (tr >= lo_) & (tr <= hi_); live = bl >= 1
        acc.append({"h": h, "n": int(keep.sum()), "mix": met(bl), "model": met(mo), "ma6": met(m6), "last": met(la),
                    "coverage": round(float(inside[live].mean()), 3), "coverage_all": round(float(inside.mean()), 3), "n_live": int(live.sum())})
        print("  accuratezza paese h=%d:" % h, acc[-1], flush=True)
    q = {"country": Q_all}

    # --- previsione finale dall'ultimo periodo
    print("previsione finale...")
    fc_raw = forecast_from(P - 1, n_trees)
    ma6_now, last_now = np.concatenate([A[t][:, -6:].mean(axis=1) for t in TYPES]), np.concatenate([A[t][:, -1] for t in TYPES])
    fc = {}
    for h, (b, _) in fc_raw.items():
        bb = W[0] * b + W[1] * ma6_now + W[2] * last_now
        fc[h] = (bb, S @ bb)
    next_ends = [end + timedelta(days=PERIOD * h) for h in range(1, HORIZONS + 1)]
    ct0 = S.shape[1] + meta["country_total"]
    names = list(cty.cat.categories)
    out_c, out_a = {}, {}
    cnames = {}
    import json as _json
    cm = _json.loads((ROOT / "webdata" / "countries.json").read_text())
    slug_by_name = {c["name"]: c["slug"] for c in cm}
    for i, nm in enumerate(names):
        slug = slug_by_name.get(nm) or slugify(nm)
        rec = {"name": nm, "hist": {"o": [int(v) for v in Acty["o"][i, -26:]], **{t: [int(v) for v in Acty[t][i, -26:]] for t in TYPES}},
               "ma6": round(float(Acty["o"][i, -6:].mean()), 1), "ma13": round(float(Acty["o"][i, -13:].mean()), 1), "fc": {}}
        for k, t in enumerate(["o"] + TYPES):
            seq = []
            for h in range(1, HORIZONS + 1):
                b, aggv = fc[h]
                if t == "o":
                    v = aggv[meta["country_total"] + i]
                else:
                    v = aggv[meta["country_type"] + (TYPES.index(t)) * meta["C"] + i]
                lo, hi = band(np.array([v]), h, Q_all)
                seq.append([round(float(v), 1), round(float(lo[0]), 1), round(float(hi[0]), 1)])
            rec["fc"][t] = seq
        out_c[slug] = rec
    # admin1: i 12 piu' violenti previsti per paese
    for i, row in units.iterrows():
        pass
    tot_adm = {h: fc[h][1][meta["admin_total"]:meta["admin_total"] + U] for h in fc}
    for ci_, nm in enumerate(names):
        idx = np.flatnonzero(ci == ci_)
        idx = idx[np.argsort(-np.sum([tot_adm[h][idx] for h in fc], axis=0))][:12]
        out_a[slug_by_name.get(nm) or slugify(nm)] = [{"name": units.loc[j, "admin1"], "lat": None if np.isnan(geo.loc[j, "latitude"]) else round(float(geo.loc[j, "latitude"]), 2),
                                                        "lon": None if np.isnan(geo.loc[j, "longitude"]) else round(float(geo.loc[j, "longitude"]), 2),
                                                        "ma6": round(float(A["o"][j, -6:].mean()), 1), "fc": [round(float(tot_adm[h][j]), 1) for h in fc]} for j in idx]
    gl = {"hist": {t: [int(v) for v in A[t].sum(axis=0)[-26:]] for t in ["o"] + TYPES}, "fc": {}}
    for t in ["o"] + TYPES:
        seq = []
        for h in range(1, HORIZONS + 1):
            b, aggv = fc[h]
            v = aggv[meta["global_total"]] if t == "o" else aggv[meta["global_type"] + TYPES.index(t)]
            seq.append([round(float(v), 1)])
        gl["fc"][t] = seq
    result = {"meta": {"generated": date.today().isoformat(), "last_period_end": end.isoformat(), "period_days": PERIOD, "horizons": [e.isoformat() for e in next_ends],
                       "history_ends": [e.isoformat() for e in ends[-26:]], "interval": f"{int((1 - ALPHA) * 100)}%", "types": NAMES, "accuracy_country_total": acc,
                       "units": int(U), "countries": len(names), "backtest_origins": args.origins,
                       "method": "equal-weight mix of a LightGBM Tweedie model (reconciled with weighted least squares), the 6-period average and the last period; scaled-residual intervals from a rolling backtest",
                       "mix_weights": {"model": round(W[0], 3), "avg6": round(W[1], 3), "last": round(W[2], 3)}},
              "global": gl, "countries": out_c, "admin1": out_a}
    OUT.write_text(json.dumps(result, separators=(",", ":"), ensure_ascii=False))
    print(f"Scritto {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
