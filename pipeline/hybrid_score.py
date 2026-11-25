"""Lo strato ibrido: registro delle letture e punteggio.

Ogni mese lo script `scripts/hybrid-snapshot.mjs` archivia in registry/hybrid/AAAA-MM.json la lettura ibrida dell'edizione: per i paesi con un mercato e per i
piu' rischiosi, la probabilita' del modello, quella dei mercati (riportata a sei mesi con la struttura a termine), quella dell'analista (un modello linguistico
che legge i titoli ma non vede la nostra previsione) e la loro combinazione in log-odds (lib/hybrid.js). Il file non si modifica piu': il suo SHA-256 e'
in registry/hybrid/index.json e `--check` lo verifica, come per il registro delle previsioni.

Quando la finestra di un'edizione si chiude (webdata/registry.json), qui si valuta ogni fonte e la combinazione con gli stessi eventi del registro, e si
aggiornano i pesi. I pesi sono quelli degli algoritmi a esponenti ("Hedge"): ogni osservazione (paese, edizione) con almeno due fonti sposta il log-peso di
ciascuna di -lambda per quanto la sua perdita logaritmica supera la media delle fonti presenti; le osservazioni piu' vecchie contano meno (decadimento per
edizione) e lo spostamento e' limitato (+-1,5, cioe' un fattore 4,5 rispetto al prior). Una fonte assente non viene penalizzata.

Regola di esclusione: se un evento e' datato prima dell'istante dell'istantanea, il paese esce dal punteggio di quell'edizione (la lettura non e' piu' una previsione).

    python pipeline/hybrid_score.py            # punteggi, pesi, webdata/hybrid.json
    python pipeline/hybrid_score.py --check    # verifica soltanto l'integrita' del registro ibrido
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "webdata"
LEDGER = ROOT / "registry" / "hybrid"
INDEX = LEDGER / "index.json"
OUT = WEB / "hybrid.json"
PRIORS = {"model": 0.7, "market": 0.2, "analyst": 0.1}
LAMBDA, DECAY, CAP = 0.5, 0.9, 1.5
EPS = 1e-6


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check() -> list[str]:
    index = json.loads(INDEX.read_text()) if INDEX.exists() else []
    bad = [r["issue"] for r in index if not (LEDGER / f"{r['issue']}.json").exists() or sha(LEDGER / f"{r['issue']}.json") != r["sha256"]]
    known = {r["issue"] for r in index}
    bad += [p.stem for p in LEDGER.glob("20*.json") if p.stem not in known]
    return sorted(set(bad))


def log_loss(p: float, y: int) -> float:
    p = min(max(p, EPS), 1 - EPS)
    return -math.log(p if y else 1 - p)


def sources(c: dict) -> dict[str, float]:
    """Le probabilita' a sei mesi di ciascuna fonte presente per un paese del registro ibrido."""
    out = {"model": c["model"]["p"]}
    if c.get("market"):
        out["market"] = c["market"]["p6"]
    if c.get("analyst") and c["analyst"].get("calibrated") is not None:
        out["analyst"] = c["analyst"]["calibrated"]
    return out


def settle(doc: dict, reg_issue: dict) -> tuple[set, set]:
    """(paesi con un evento che conta dopo l'istantanea, paesi esclusi perche' l'evento e' datato prima dell'istantanea)."""
    asof = doc["asof"][:10]
    hits, excluded = set(), set()
    for e in reg_issue.get("events", []):
        if not e.get("counted"):
            continue
        d = e["date"] if len(e["date"]) >= 10 else e["date"] + "-01"
        (excluded if d < asof else hits).add(e["slug"])
    return hits - excluded, excluded


def hedge_weights(observations: list[tuple[int, dict]], lam: float = LAMBDA, decay: float = DECAY, cap: float = CAP) -> dict[str, float]:
    """`observations`: (eta' in edizioni, {fonte: perdita}). Restituisce i log-pesi rispetto al prior, con il modello a zero."""
    logw, seen = {k: 0.0 for k in PRIORS}, set()
    for age, losses in observations:
        if len(losses) < 2:
            continue
        mean = sum(losses.values()) / len(losses)
        for k, v in losses.items():
            logw[k] -= lam * decay ** age * (v - mean)
            seen.add(k)
    ref = logw["model"]
    return {k: round(max(-cap, min(cap, v - ref)), 4) if k in seen else 0.0 for k, v in logw.items()}      # una fonte mai vista resta al prior


def pooled_ll(c: dict, y: int) -> float | None:
    return log_loss(c["pooled"]["p"], y) if c.get("pooled") else None


def score_issue(doc: dict, reg_issue: dict) -> dict:
    hits, excluded = settle(doc, reg_issue)
    rows = [c for c in doc["countries"] if c["slug"] not in excluded]
    per: dict[str, dict] = {}
    for c in rows:
        y = int(c["slug"] in hits)
        for k, p in sources(c).items():
            s = per.setdefault(k, {"n": 0, "events": 0, "ll": 0.0, "brier": 0.0, "model_ll": 0.0, "model_brier": 0.0})
            s["n"] += 1; s["events"] += y; s["ll"] += log_loss(p, y); s["brier"] += (p - y) ** 2
            s["model_ll"] += log_loss(c["model"]["p"], y); s["model_brier"] += (c["model"]["p"] - y) ** 2
        pl = pooled_ll(c, y)
        if pl is not None:
            s = per.setdefault("pooled", {"n": 0, "events": 0, "ll": 0.0, "brier": 0.0, "model_ll": 0.0, "model_brier": 0.0})
            s["n"] += 1; s["events"] += y; s["ll"] += pl; s["brier"] += (c["pooled"]["p"] - y) ** 2
            s["model_ll"] += log_loss(c["model"]["p"], y); s["model_brier"] += (c["model"]["p"] - y) ** 2
    out = {}
    for k, s in per.items():
        n = s["n"]
        out[k] = {"n": n, "events": s["events"], "log_loss": round(s["ll"] / n, 5), "brier": round(s["brier"] / n, 6),
                  "model_log_loss": round(s["model_ll"] / n, 5), "model_brier": round(s["model_brier"] / n, 6),
                  "better_than_model": round((s["model_ll"] - s["ll"]) / n, 5)}      # positivo: la fonte ha perso meno del modello sullo stesso insieme
    return {"hits": sorted(hits), "excluded": sorted(excluded), "sources": out}


def observations(ledgers: list[dict], registry: dict) -> list[tuple[int, dict]]:
    """Le osservazioni (paese, edizione chiusa) con almeno due fonti, con l'eta' dell'edizione contata dalla piu' recente chiusa."""
    closed = {i["issue"]: i for i in registry.get("issues", []) if i["status"] == "closed"}
    order = sorted((d["issue"] for d in ledgers if d["issue"] in closed), reverse=True)
    age = {issue: n for n, issue in enumerate(order)}
    obs = []
    for doc in ledgers:
        if doc["issue"] not in closed:
            continue
        hits, excluded = settle(doc, closed[doc["issue"]])
        for c in doc["countries"]:
            if c["slug"] in excluded:
                continue
            y = int(c["slug"] in hits)
            losses = {k: log_loss(p, y) for k, p in sources(c).items()}
            if len(losses) >= 2:
                obs.append((age[doc["issue"]], losses))
    return obs


def build() -> dict:
    ledgers = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(LEDGER.glob("20*.json"))]
    registry = json.loads((WEB / "registry.json").read_text(encoding="utf-8")) if (WEB / "registry.json").exists() else {"issues": []}
    reg = {i["issue"]: i for i in registry.get("issues", [])}
    issues = []
    for doc in ledgers:
        r = reg.get(doc["issue"], {})
        closed = r.get("status") == "closed"
        n_src = {k: sum(1 for c in doc["countries"] if k in sources(c)) for k in PRIORS}
        issues.append({"issue": doc["issue"], "asof": doc["asof"], "window": doc["window"], "status": "closed" if closed else "open", "countries": len(doc["countries"]),
                       "sources": n_src, "analyst_model": doc.get("analyst_model"), "score": score_issue(doc, r) if closed else None})
    latest = ledgers[-1] if ledgers else None
    show = None
    if latest:
        rows = [c for c in latest["countries"] if len(sources(c)) >= 2]
        show = {"issue": latest["issue"], "asof": latest["asof"], "window": latest["window"], "base_rate": latest["base_rate"], "method": latest.get("method"),
                "countries": [{"slug": c["slug"], "name": c["name"], "iso": c.get("iso"), "rank": c.get("rank"), "model": c["model"], "market": c.get("market") and {k: v for k, v in c["market"].items() if k != "markets"} | {"markets": [{k: m[k] for k in ("source", "question", "p", "months", "volume")} for m in c["market"]["markets"]]},
                              "analyst": c.get("analyst") and {k: c["analyst"][k] for k in ("raw", "calibrated", "confidence", "rationale")},
                              "pooled": c.get("pooled")} for c in sorted(rows, key=lambda c: -(c["pooled"]["p"] if c.get("pooled") else c["model"]["p"]))]}
    obs = observations(ledgers, registry)
    bad = check()
    return {"generated": date.today().isoformat(), "priors": PRIORS, "logw": hedge_weights(obs), "params": {"lambda": LAMBDA, "decay": DECAY, "cap": CAP},
            "observations": len(obs), "issues": issues[::-1], "latest": show, "integrity": {"ok": not bad, "altered": bad}}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        bad = check()
        sys.exit(f"Registro ibrido alterato o non indicizzato: {', '.join(bad)}" if bad else print("Registro ibrido integro") or 0)
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Ibrido: {len(out['issues'])} edizioni ({sum(i['status'] == 'closed' for i in out['issues'])} chiuse), {out['observations']} osservazioni con due fonti o piu', pesi {out['logw']}")
    if not out["integrity"]["ok"]:
        sys.exit(f"ATTENZIONE: registro ibrido alterato: {', '.join(out['integrity']['altered'])}")


if __name__ == "__main__":
    main()
