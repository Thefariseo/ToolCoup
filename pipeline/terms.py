"""Struttura a termine della probabilita' di golpe: come si riporta la stima a sei mesi alle altre scadenze.

Il sito confronta la nostra stima con i mercati (Polymarket, Kalshi), e un mercato chiude a una data qualsiasi: tra un mese e mezzo, a fine
2027. Finora la stima a sei mesi si riportava con un rischio mensile costante, P(h) = 1 - (1 - p6)^(h/6). Qui si misura se regge fuori campione
e, dove non regge, si stima una correzione usando solo il passato.

Per ogni scadenza h della griglia si costruisce il bersaglio "almeno un tentativo nei prossimi h mesi" e lo si confronta con:
  CH   rischio costante a partire da p6 (il modo di prima)
  A1   regressione logistica del bersaglio su logit(p6), per ogni h: logit F_h = a_h + b_h * logit p6
Ogni anno e' previsto con coefficienti stimati sugli esiti noti prima di quell'anno (stessa disciplina della validazione del modello).
La correzione A1 si usa solo per le scadenze in cui riduce il Brier fuori campione con P(meglio) >= 0.8 (ricampionamento dei paesi); altrimenti
resta CH. A sei mesi la mappa e' l'identita': il numero pubblicato non cambia mai. Le curve sono cumulative e mai decrescenti.

Uso:  python pipeline/terms.py [--reps 200]        ->  webdata/terms.json
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
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as M  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "webdata" / "terms.json"
GRID = [1, 2, 3, 4, 6, 9, 12, 18, 24]
CANDIDATES = [3, 4, 9, 12, 18, 24]          # scadenze su cui si misura A1 contro CH
FIRST_TEST_YEAR = 1992
EPS = 1e-9


def horizon_targets(panel: pd.DataFrame, grid=GRID) -> dict[int, np.ndarray]:
    """Per ogni h: 1 se c'e' un tentativo nei mesi t+1..t+h, 0 se no, NaN se l'esito non e' ancora noto."""
    onset = panel["onset"].to_numpy(dtype=float)
    out = {h: np.full(len(panel), np.nan) for h in grid}
    for _, idx in panel.groupby("unit").indices.items():
        c = np.concatenate([[0.0], np.cumsum(onset[idx])])
        m = len(idx)
        i = np.arange(m)
        for h in grid:
            ok = i + h <= m - 1
            v = np.full(m, np.nan)
            v[ok] = (c[i[ok] + h + 1] - c[i[ok] + 1]) > 0
            out[h][idx] = v
    return out


def _logit(p):
    p = np.clip(np.asarray(p, dtype=float), EPS, 1 - EPS)
    return np.log(p / (1 - p))


def constant_hazard(p6, h):
    return 1 - (1 - np.asarray(p6, dtype=float)) ** (h / 6)


def fit_map(p6: np.ndarray, y: np.ndarray) -> dict | None:
    """a, b di logit F = a + b logit p6, o None se i dati non bastano."""
    if len(y) < 300 or y.sum() < 20 or (1 - y).sum() < 20:
        return None
    lr = LogisticRegression(C=1e3, max_iter=2000).fit(_logit(p6).reshape(-1, 1), y)
    return {"a": float(lr.intercept_[0]), "b": float(lr.coef_[0, 0])}


def apply_map(p6, m: dict) -> np.ndarray:
    return expit(m["a"] + m["b"] * _logit(p6))


def curve(p6, terms: dict) -> list[tuple[int, float]]:
    """Probabilita' cumulative alle scadenze della griglia, per una stima a sei mesi: la stessa funzione e' in lib/market-pick.js."""
    p = float(np.clip(p6, EPS, 1 - EPS))
    prev, out = 0.0, []
    for h in terms["grid"]:
        f = p if h == 6 else float(constant_hazard(p, h))
        m = terms.get("long", {}).get(str(h))
        if m and h > 6:
            f = float(apply_map(p, m))
        f = max(f, prev)
        prev = f
        out.append((h, f))
    return out


def oos_evaluation(panel, p6: np.ndarray, targets: dict, horizons=CANDIDATES, first=FIRST_TEST_YEAR, reps=200, seed=0) -> dict:
    """Ogni anno si stimano a_h, b_h sugli esiti noti prima dell'anno; si confronta con il rischio costante."""
    t, yr, unit = panel["t"].to_numpy(), panel["year"].to_numpy(), panel["unit"].to_numpy()
    rng = np.random.default_rng(seed)
    result = {}
    for h in horizons:
        y = targets[h]
        ok = np.isfinite(y) & np.isfinite(p6)
        ch = constant_hazard(p6, h)
        mapped = np.full(len(y), np.nan)
        for year in range(first, int(yr.max()) + 1):
            te = np.flatnonzero(ok & (yr == year))
            if not len(te):
                continue
            tr = np.flatnonzero(ok & (t + h < year * 12))
            m = fit_map(p6[tr], y[tr])
            mapped[te] = apply_map(p6[te], m) if m else ch[te]
        sel = ok & np.isfinite(mapped) & (yr >= first)
        ys, a_, b_ = y[sel], ch[sel], mapped[sel]
        bs = lambda p: float(np.mean((p - ys) ** 2))
        ll = lambda p: float(-np.mean(ys * np.log(np.clip(p, 1e-6, 1)) + (1 - ys) * np.log(np.clip(1 - p, 1e-6, 1))))
        groups = pd.Series(np.arange(sel.sum())).groupby(unit[sel]).apply(lambda s: s.to_numpy())
        keys = groups.index.to_numpy()
        diffs = []
        for _ in range(reps):
            idx = np.concatenate([groups[k] for k in rng.choice(keys, len(keys))])
            diffs.append(float(np.mean((b_[idx] - ys[idx]) ** 2 - (a_[idx] - ys[idx]) ** 2)))
        top = a_ >= np.quantile(a_, 0.98)
        result[str(h)] = {"n": int(sel.sum()), "events": int(ys.sum()), "brier_constant": round(bs(a_), 6), "brier_mapped": round(bs(b_), 6),
                          "log_loss_constant": round(ll(a_), 5), "log_loss_mapped": round(ll(b_), 5),
                          "d_brier": round(float(np.mean(diffs)), 7), "d_brier_ci": [round(float(q), 7) for q in np.quantile(diffs, [.05, .95])],
                          "p_better": round(float(np.mean(np.array(diffs) < 0)), 2),
                          "top2pct": {"constant": round(float(a_[top].mean()), 4), "mapped": round(float(b_[top].mean()), 4), "observed": round(float(ys[top].mean()), 4)}}
    return result


def build(panel: pd.DataFrame, p6_oos: pd.Series, reps=200) -> dict:
    targets = horizon_targets(panel)
    p6 = p6_oos.to_numpy()
    evidence = oos_evaluation(panel, p6, targets, reps=reps)
    long = {}
    for h in CANDIDATES:
        e = evidence[str(h)]
        if h <= 6 or e["d_brier"] >= 0 or e["p_better"] < 0.8:
            continue
        ok = np.isfinite(targets[h]) & np.isfinite(p6)
        m = fit_map(p6[ok], targets[h][ok])
        if m:
            long[str(h)] = {**{k: round(v, 5) for k, v in m.items()}, "n": int(ok.sum()), "events": int(targets[h][ok].sum())}
    return {"generated": date.today().isoformat(), "horizon": 6, "grid": GRID, "long": long, "evidence": evidence,
            "method": "constant monthly hazard up to six months; beyond, logit F_h = a_h + b_h logit p6 where it beats constant hazard out of sample (country-resampled Brier, P >= 0.8)",
            "first_test_year": FIRST_TEST_YEAR}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=200, help="ricampionamenti dei paesi per gli intervalli")
    args = ap.parse_args()
    warnings.simplefilter("ignore")
    import run as R
    H = 6
    am, ameta, info, t_end, panel, pinfo = R.build_inputs(H)
    preds, _ = R.validation(panel, H)
    p6, _ = M.calibrate_forward(panel, M.combine(preds, M.ENSEMBLE), H)
    out = build(panel, p6, reps=args.reps)
    OUT.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(f"Scritto {OUT.relative_to(ROOT)}: correzione per le scadenze {', '.join(out['long']) or 'nessuna'}")
    for h, e in out["evidence"].items():
        print(f"  h={h:>2}: Brier rischio costante {e['brier_constant']:.5f} -> mappa {e['brier_mapped']:.5f}  d {e['d_brier']:+.6f} {e['d_brier_ci']}  P(meglio) {e['p_better']}  "
              f"primo 2%: previsto {e['top2pct']['constant']} / {e['top2pct']['mapped']}, osservato {e['top2pct']['observed']}")


if __name__ == "__main__":
    main()
