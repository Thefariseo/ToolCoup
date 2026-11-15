"""Come migliorare la previsione del numero di eventi di violenza organizzata (livello paese, totale).

Il sistema pubblicato (cast.py) batte la media mobile di sei periodi solo a un periodo di distanza. Qui si provano, con molte
piu' origini di backtest (24, a passo di due periodi, contro le cinque a passo di quattro), tre cambiamenti, ciascuno con una ragione:

  1. Obiettivo: la metrica pubblicata (WAPE, errore relativo) e' un errore assoluto, che si minimizza prevedendo la mediana, non la media
     (Tweedie). Si prova l'errore assoluto (L1) e l'errore quadratico (L2) sul logaritmo del rapporto con la media a sei periodi.
  2. Un solo modello per tutti gli orizzonti (l'orizzonte e' una variabile): sei volte piu' righe per modello, meno varianza.
  3. Piu' variabili: ritardi fino a sei periodi, medie a 3/6/13/26, pendenza, massimo, EWMA, quota degli attori, paesi vicini, totale mondiale,
     eta' della copertura. Stessa informazione di cast.py, piu' ricca.

Si confronta con i riferimenti semplici e con la miscela pubblicata (modello Tweedie per orizzonte + media a 6 periodi + ultimo periodo).
Le combinazioni con pesi stimati usano solo origini il cui esito era gia' noto: nessuna informazione dal futuro.

Uso:  python pipeline/experiment_cast.py [--origins 24] [--stride 2] [--start 2018] [--quick]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cast as C  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
H = C.HORIZONS


def country_arrays(start: int):
    C.START_YEAR = start
    ev, end = C.load()
    ends, P = C.periods(end)
    D = C.build_arrays(ev, end, P)
    units, A = D["units"], D["A"]
    cty = units["country"].astype("category")
    ci, n = cty.cat.codes.to_numpy(), len(cty.cat.categories)
    Acty = {}
    for k, m in A.items():
        g = np.zeros((n, P), dtype=np.float32)
        np.add.at(g, ci, m)
        Acty[k] = g
    geo = D["geo"].groupby(ci)[["latitude", "longitude"]].mean().reindex(range(n))
    return ends, P, list(cty.cat.categories), Acty, geo


def ewma(x: np.ndarray, a: float) -> np.ndarray:
    out = np.full_like(x, np.nan)
    out[:, 0] = x[:, 0]
    for p in range(1, x.shape[1]):
        out[:, p] = a * x[:, p] + (1 - a) * out[:, p - 1]
    return out


def slope(x: np.ndarray, w: int = 6) -> np.ndarray:
    out = np.full_like(x, np.nan)
    t = np.arange(w) - (w - 1) / 2
    win = np.lib.stride_tricks.sliding_window_view(x, w, axis=1)
    out[:, w - 1:] = win @ t / (t @ t)
    return out


def rich_features(Ac: dict, names: list[str], geo: pd.DataFrame, ends: list, cy: pd.DataFrame):
    n, P = Ac["o"].shape
    F, fn = [], []

    def add(name, m):
        F.append(np.asarray(m, dtype=np.float32)); fn.append(name)

    for k in ("o", "b", "e", "v", "fat", "prot", "riot"):
        lk = np.log1p(Ac[k])
        for j in range(6):
            add(f"{k}_l{j}", C.lag(lk, j))
        for w in (3, 6, 13, 26):
            add(f"{k}_m{w}", C.roll(lk, w, np.mean))
        add(f"{k}_sd6", C.roll(lk, 6, np.std)); add(f"{k}_max6", C.roll(lk, 6, np.max))
        add(f"{k}_slope6", slope(lk)); add(f"{k}_ew3", ewma(lk, 0.3)); add(f"{k}_ew6", ewma(lk, 0.6))
    lo = np.log1p(Ac["o"])
    add("o_last_vs_m6", C.lag(lo, 0) - C.roll(lo, 6, np.mean))
    add("o_m3_vs_m13", C.roll(lo, 3, np.mean) - C.roll(lo, 13, np.mean))
    for k in range(1, 9):
        add(f"inter{k}", np.log1p(C.lag(Ac[f"i{k}"], 0)))
    for k in ("excess", "strat", "agree"):
        add(k, np.log1p(C.lag(Ac[k], 0)))
    # paesi vicini: media dei sei piu' vicini per distanza tra i centroidi
    from scipy.spatial import cKDTree
    lat, lon = np.radians(geo["latitude"].fillna(0).to_numpy()), np.radians(geo["longitude"].fillna(0).to_numpy())
    xyz = np.c_[np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)]
    nb = cKDTree(xyz).query(xyz, k=min(7, n))[1][:, 1:]
    lb = np.log1p(Ac["o"])
    add("nb_o_l0", lb[nb].mean(axis=1)); add("nb_o_m6", C.roll(lb[nb].mean(axis=1), 6, np.mean))
    # totale mondiale e paesi con eventi
    tot = np.log1p(Ac["o"].sum(axis=0, keepdims=True)).repeat(n, axis=0)
    add("glob_o", tot); add("glob_o_m6", C.roll(tot, 6, np.mean))
    # eta' della copertura: periodi dal primo evento del paese (negativa prima)
    first = np.array([np.argmax(r > 0) if (r > 0).any() else P for r in Ac["o"]])
    add("age", np.arange(P)[None, :] - first[:, None])
    pe = np.array([d.toordinal() for d in ends], dtype=np.float32)
    add("period_idx", np.tile(pe, (n, 1)))
    mo = np.array([d.month for d in ends], dtype=np.float32)
    add("month_sin", np.tile(np.sin(2 * np.pi * mo / 12), (n, 1))); add("month_cos", np.tile(np.cos(2 * np.pi * mo / 12), (n, 1)))
    cc = pd.Series(names).map(lambda s: C.code_from_name(s)).to_numpy()
    have = set(cy.index.get_level_values(0))
    for v in ("v2x_polyarchy", "v2x_libdem", "v2x_civlib", "e_log_infmort", "e_log_pop"):
        m = np.full((n, P), np.nan, dtype=np.float32)
        for i, c in enumerate(cc):
            if c is not None and c == c and int(c) in have and v in cy:
                m[i] = cy.loc[int(c), v].reindex(np.array([d.year - 1 for d in ends])).to_numpy(dtype=np.float32)
        add(v, m)
    return np.stack(F, axis=2), fn                      # (n, P, nf)


def lgb(objective: str, trees: int, **kw):
    import lightgbm as lgb_
    p = dict(n_estimators=trees, learning_rate=0.05, num_leaves=15, min_child_samples=40, subsample=0.8, subsample_freq=1,
             colsample_bytree=0.6, reg_lambda=3.0, verbose=-1, n_jobs=8, random_state=0, deterministic=True, force_row_wise=True)
    if objective == "tweedie":
        p.update(objective="tweedie", tweedie_variance_power=1.4)
    elif objective == "huber":
        p.update(objective="huber", alpha=0.5)
    else:
        p.update(objective=objective)
    p.update(kw)
    return lgb_.LGBMRegressor(**p)


BURN = 6


def pooled(F, Yo, ma6, T, objective, trees, halflife=None, **kw):
    """Un modello per tutti gli orizzonti. Bersaglio: log1p(y[p+h]) - log1p(ma6[p]). Restituisce {h: previsione dei conteggi (n,)}."""
    n, P, nf = F.shape
    Xs, ys, ws = [], [], []
    for h in range(1, H + 1):
        p0, p1 = BURN, T - h
        if p1 < p0:
            continue
        X = F[:, p0:p1 + 1, :].reshape(-1, nf)
        X = np.column_stack([X, np.full(len(X), h, dtype=np.float32)])
        z = (np.log1p(Yo[:, p0 + h:p1 + h + 1]) - np.log1p(ma6[:, p0:p1 + 1])).reshape(-1)
        ok = np.isfinite(z)
        Xs.append(X[ok]); ys.append(z[ok])
        if halflife:
            age = np.broadcast_to(np.arange(p0, p1 + 1)[None, :], (n, p1 - p0 + 1)).reshape(-1)[ok]
            ws.append(0.5 ** ((T - h - age) / halflife))
    X, y = np.vstack(Xs), np.concatenate(ys)
    w = np.concatenate(ws) if ws else None
    m = lgb(objective, trees, **kw).fit(X, y, sample_weight=w)
    out = {}
    for h in range(1, H + 1):
        xt = np.column_stack([F[:, T, :], np.full(n, h, dtype=np.float32)])
        out[h] = np.maximum(np.expm1(np.log1p(ma6[:, T]) + m.predict(xt)), 0)
    return out


def old_model(Fold, Yo, ma6raw, T, trees):
    """Il modello pubblicato, a livello paese: Tweedie, un modello per orizzonte, offset = log(media a 6 periodi + 0.5)."""
    n, P = Yo.shape
    pidx = np.tile(np.arange(P), n)
    off = np.log(ma6raw.reshape(-1) + 0.5)
    out = {}
    for h in range(1, H + 1):
        y = C.target(Yo, h)
        tr = (pidx + h <= T) & ~np.isnan(y) & ~np.isnan(Fold[:, 0]) & np.isfinite(off)
        m = C.lgbm(trees).fit(Fold[tr], y[tr], init_score=off[tr])
        now = pidx == T
        out[h] = np.maximum(np.exp(m.predict(Fold[now], raw_score=True) + off[now]) - 0.5, 0)
    return out


def metrics(f, tr, m6, la):
    keep = (m6 + la + tr) > 0
    f, tr, m6 = f[keep], tr[keep], m6[keep]
    return {"wape": float(np.abs(f - tr).sum() / max(tr.sum(), 1)), "rel": float(np.mean(np.abs(f - tr) / (m6 + 1))),
            "rmsle": float(np.sqrt(np.mean((np.log1p(f) - np.log1p(tr)) ** 2)))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--origins", type=int, default=24)
    ap.add_argument("--stride", type=int, default=2)
    ap.add_argument("--start", type=int, default=2018)
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "data" / "experiments" / "cast.json"))
    args = ap.parse_args()
    warnings.simplefilter("ignore")
    trees = 80 if args.quick else 250
    t0 = time.time()
    ends, P, names, Ac, geo = country_arrays(args.start)
    from panel import load_country_years
    cy = load_country_years().set_index(["ccode", "year"])
    F, fn = rich_features(Ac, names, geo, ends, cy)
    Fold, _ = C.features(Ac, pd.DataFrame({"country": names, "admin1": ""}), geo, ends, cy, "country")
    Yo = Ac["o"]
    ma6 = C.roll(Yo, 6, np.mean)
    ma13 = C.roll(Yo, 13, np.mean)
    ew = ewma(Yo, 0.3)
    print(f"{len(names)} paesi, {P} periodi dal {args.start}, {F.shape[2]} variabili ({time.time() - t0:.0f} s)", flush=True)

    origins = [P - 1 - H - args.stride * k for k in range(args.origins)][::-1]
    methods = {}
    def put(name, o, h, f):
        methods.setdefault(name, {})[(o, h)] = np.asarray(f, dtype=np.float64)
    truth = {(o, h): Yo[:, o + h] for o in origins for h in range(1, H + 1)}

    for i, T in enumerate(origins):
        t1 = time.time()
        for h in range(1, H + 1):
            put("ma6", T, h, ma6[:, T]); put("ma13", T, h, ma13[:, T]); put("last", T, h, Yo[:, T]); put("ewma", T, h, ew[:, T])
        old = old_model(Fold, Yo, ma6, T, trees)
        for h in range(1, H + 1):
            put("old", T, h, old[h]); put("old_mix", T, h, (old[h] + ma6[:, T] + Yo[:, T]) / 3)
        for name, obj, hl, kw in (("pool_l1", "l1", None, {}), ("pool_l2", "l2", None, {}), ("pool_huber", "huber", None, {}),
                                  ("pool_l1_hl20", "l1", 20, {}), ("pool_l1_recent", "l1", 40, {}), ("pool_l1_hl80", "l1", 80, {}),
                                  ("pool_l1_l7", "l1", 40, {"num_leaves": 7}), ("pool_l1_l31", "l1", 40, {"num_leaves": 31, "min_child_samples": 60})):
            r = pooled(F, Yo, ma6, T, obj, trees, hl, **kw)
            for h in range(1, H + 1):
                put(name, T, h, r[h])
        print(f"origine {i + 1}/{len(origins)} (periodo {T}, {ends[T]}) {time.time() - t1:.0f} s", flush=True)

    names_m = list(methods)
    def pool_h(name, h, rows=None):
        os_ = origins if rows is None else rows
        f = np.concatenate([methods[name][(o, h)] for o in os_]); tr = np.concatenate([truth[(o, h)] for o in os_])
        m6 = np.concatenate([methods["ma6"][(o, h)] for o in os_]); la = np.concatenate([methods["last"][(o, h)] for o in os_])
        return f, tr, m6, la

    # combinazioni con pesi stimati su origini il cui esito era noto (o + h <= origine corrente)
    from scipy.optimize import minimize
    parts = ["pool_l1_recent", "ma6", "last", "ewma"]
    def stack(cands, label):
        for o_i, T in enumerate(origins):
            for h in range(1, H + 1):
                past = [o for o in origins if o + h <= T]
                if len(past) < 4:
                    w = np.ones(len(cands)) / len(cands)
                else:
                    Xf = np.stack([np.concatenate([methods[c][(o, h)] for o in past]) for c in cands], axis=1)
                    tr = np.concatenate([truth[(o, h)] for o in past])
                    obj = lambda w_: np.abs(Xf @ (np.abs(w_) / np.abs(w_).sum()) - tr).sum() / max(tr.sum(), 1) + 0.02 * np.sum((np.abs(w_) / np.abs(w_).sum() - 1 / len(cands)) ** 2)
                    w = minimize(obj, np.ones(len(cands)) / len(cands), method="Nelder-Mead", options={"xatol": 1e-3, "fatol": 1e-6, "maxiter": 400}).x
                    w = np.abs(w) / np.abs(w).sum()
                put(label, T, h, sum(wi * methods[c][(T, h)] for wi, c in zip(w, cands)))
    stack(parts, "stack_l1")
    stack(["pool_l1_recent", "old", "ma6", "last"], "stack_all")
    for name, cands in (("mix_l1", ["pool_l1_recent", "ma6", "last"]), ("mix_l1_ewma", ["pool_l1_recent", "ma6", "last", "ewma"]), ("mix_l1_l2", ["pool_l1_recent", "pool_l2", "ma6", "last"]), ("mix_pools", ["pool_l1_recent", "pool_l1_hl20", "pool_l1_hl80", "pool_huber"])):
        for T in origins:
            for h in range(1, H + 1):
                put(name, T, h, sum(methods[c][(T, h)] for c in cands) / len(cands))
    names_m = list(methods)

    # tabella: WAPE / errore relativo / RMSLE per orizzonte, tutte le origini; poi solo la seconda meta' (stack con i pesi gia' stimati)
    result = {"origins": len(origins), "stride": args.stride, "start": args.start, "countries": len(names), "features": F.shape[2], "table": {}}
    late = origins[len(origins) // 3:]
    for scope, rows in (("all", None), ("late", late)):
        print(f"\n=== {scope} ({len(origins) if rows is None else len(rows)} origini) ===")
        print("metodo".ljust(16) + "".join(f"  h{h} wape  rel  rmsle" for h in range(1, H + 1)))
        for nm in names_m:
            line = nm.ljust(16)
            for h in range(1, H + 1):
                f, tr, m6, la = pool_h(nm, h, rows)
                m = metrics(f, tr, m6, la)
                result["table"].setdefault(scope, {}).setdefault(nm, {})[h] = {k: round(v, 4) for k, v in m.items()}
                line += f"  {m['wape']:.3f} {m['rel']:.3f} {m['rmsle']:.3f}"
            print(line)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(result, indent=1))
    print(f"\nscritto {args.out} ({time.time() - t0:.0f} s)")


if __name__ == "__main__":
    main()
