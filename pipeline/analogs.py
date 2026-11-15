"""Analogie strutturali: per ogni paese, i mesi del passato che gli somigliano di piu' e che cosa e' successo dopo.

E' il terzo punto di vista accanto al modello e ai mercati di previsione: non stima una probabilita' con una formula, ma dice
"i casi storici piu' simili a questo hanno avuto un tentativo di golpe nei sei mesi successivi nel X% dei casi". Si usano solo mesi con
esito noto e almeno 12 mesi prima dell'ultimo dato; i vicini sono scelti con la distanza euclidea su variabili strutturali
standardizzate (storia golpista, regime, leader, economia, contagio).

Uso:  python pipeline/analogs.py [--k 30]
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run as R  # noqa: E402
from countries import name_of  # noqa: E402
from data import RAW_SERIES  # noqa: E402
from export_web import slugify  # noqa: E402
from panel import GROUPS, build_panel  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "webdata" / "analogs.json"
USE = ["storia", "regime", "leader", "economia", "contagio"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--k", type=int, default=30)
    args = ap.parse_args()
    warnings.simplefilter("ignore")
    H = 6
    am, ameta = R.acled_monthly()
    am["unrest"] = am["protests"] + am["riots"]
    am["violence"] = am["battles"] + am["explosions"] + am["vac"]
    info = am.groupby("country").agg(iso=("iso", "first"), region=("region", "first"))
    t_end = int(ameta["t_end"])
    panel, pinfo = build_panel(R.COUPDB, am[["country", "t"] + RAW_SERIES], info, t_end, H)
    cols = [c for g in USE for c in GROUPS[g]]
    cover = panel.loc[panel["year"] >= 1970, cols].notna().mean()
    cols = [c for c in cols if cover[c] >= 0.7]
    X = panel[cols].astype(float)
    med, sd = X.median(), X.std().replace(0, 1)
    Z = ((X - med) / sd).fillna(0.0).clip(-4, 4)
    known = panel["y_known"].to_numpy() & (panel["t"].to_numpy() <= t_end - 12) & (panel["unit"].to_numpy() > 0)
    hist = np.flatnonzero(known)
    cur = np.flatnonzero((panel["t"].to_numpy() == t_end) & (panel["unit"].to_numpy() > 0))
    Zh, Zc = Z.to_numpy()[hist], Z.to_numpy()[cur]
    yh, th, uh = panel["y"].to_numpy()[hist], panel["t"].to_numpy()[hist], panel["unit"].to_numpy()[hist]
    base = float(yh.mean())
    inv = {v: k for k, v in pinfo["unit_of_acled"].items()}
    out = {}
    for row, i in enumerate(cur):
        d = np.sqrt(((Zh - Zc[row]) ** 2).sum(axis=1))
        order = np.argsort(d)
        chosen, seen = [], set()
        for j in order:                                          # un solo caso per paese e biennio
            key = (int(uh[j]), int(th[j]) // 24)
            if key in seen:
                continue
            seen.add(key); chosen.append(j)
            if len(chosen) == args.k:
                break
        rate = float(np.mean(yh[chosen]))
        unit = int(panel["unit"].iloc[i])
        nm = inv.get(unit) or name_of(unit)
        cases = [{"country": name_of(int(uh[j])), "month": f"{int(th[j]) // 12}-{int(th[j]) % 12 + 1:02d}", "distance": round(float(d[j]), 2), "attempt_within_6m": bool(yh[j])} for j in chosen[:6]]
        hits = [{"country": name_of(int(uh[j])), "month": f"{int(th[j]) // 12}-{int(th[j]) % 12 + 1:02d}"} for j in chosen if yh[j]][:5]
        out[slugify(nm)] = {"name": nm, "k": len(chosen), "rate": round(rate, 4), "base": round(base, 4), "lift": round(rate / base, 2) if base else None,
                            "nearest": cases, "attempts": hits, "features": len(cols), "pool": int(len(hist))}
    OUT.write_text(json.dumps({"meta": {"k": args.k, "horizon_months": H, "features": cols, "t_end": t_end, "pool": int(len(hist))}, "countries": out}, separators=(",", ":"), ensure_ascii=False))
    print(f"{len(out)} paesi -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
