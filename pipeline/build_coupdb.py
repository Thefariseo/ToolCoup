"""Costruisce il database unificato dei colpi di stato incrociando piu' fonti.

Fonti (in ordine di priorita' per data ed esito):
  pt         Powell & Thyne, 1950-oggi            golpe riusciti e falliti
  colpus     Chin, Carter & Wright, 1946-2022     golpe riusciti e falliti + candidati scartati
  csp        Center for Systemic Peace, 1946-2021 riusciti, falliti, complotti, presunti
  via Colpus Cline Center, Svolik, Singh, Luttwak, McGowan, Bjornskov & Rode, Perez-Linan...
             (Colpus registra, per ogni evento, quali altri dataset lo includono e con che esito)
  archigos   Goemans, Gleditsch & Chiozza, 1875-2015  capi di stato rimossi da militari o governo
  hrd        Knutsen, Djuve & Wig (V-Dem), 1789-oggi  regimi terminati da un golpe o autogolpe
  pipe       Przeworski et al., 1788-2008             numero di golpe riusciti per paese-anno
  wikidata   voci classificate come colpo di stato     fonte enciclopedica
  wikipedia  elenchi per paese e per anno              fonte enciclopedica

Metodo: ogni fonte diventa un elenco di segnalazioni (paese, data, esito). Le segnalazioni dello
stesso paese con date compatibili (entro 14 giorni, o stesso mese/anno se la data e' imprecisa)
vengono riunite in un unico evento; una fonte non puo' comparire due volte nello stesso evento.

Affidabilita':
  A  almeno due fonti accademiche indipendenti lo codificano come golpe
  B  una fonte accademica, confermata da almeno una fonte enciclopedica
  C  una fonte accademica da sola, oppure due fonti enciclopediche concordi
  D  una sola fonte enciclopedica, solo complotti/presunti, o evento che Colpus giudica inesistente

Colpus e' l'unica fonte che riesamina i candidati degli altri dataset: quando ne scarta uno, il
motivo e' riportato in `colpus_class` (complotto, ammutinamento, autogolpe, doppione...). Le righe
che Colpus marca come doppione ("combined") vengono fuse nell'evento principale.

Uso:  python pipeline/build_coupdb.py     (dopo python pipeline/fetch_coup_sources.py)
"""
from __future__ import annotations

import calendar
import json
import re
import sys
import warnings
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from countries import COUNTRIES, canon_code, code_from_name, code_from_text, name_of  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "raw" / "coup_sources"
OUT = ROOT / "data" / "coupdb"
WINDOW = 14            # giorni di tolleranza tra date di fonti diverse (copre anche lo scarto di
                       # 13 giorni tra calendario giuliano e gregoriano nelle fonti sul primo Novecento)
WINDOW_REJ = 30        # tolleranza per le righe che Colpus ha scartato (spesso date errate)
START_YEAR = 1900
# ordine di elaborazione: le fonti migliori fissano data ed esito; PIPE (solo anno) arriva per ultima
ORDER = {"pt": 0, "colpus": 1, "csp": 2, "archigos": 4, "hrd": 5, "colpus_rej": 6, "wikidata": 7,
         "wikipedia_c": 8, "wikipedia": 9, "pipe": 10}
VIA_RANK = 3
TERTIARY = {"wikidata": "wikidata", "wikipedia": "wikipedia", "wikipedia_c": "wikipedia"}
VIA = {"cline": "Cline Center", "svolik": "Svolik", "singh": "Singh", "luttwak": "Luttwak",
       "mcgowan": "McGowan", "bjornskov": "Bjornskov & Rode", "perez": "Perez-Linan",
       "thompson": "Thompson", "fossum": "Fossum", "whiv": "Marshall (WHIV)",
       "morrison": "Morrison", "beeri": "Be'eri"}
SOURCE_NAMES = {"pt": "Powell & Thyne", "colpus": "Colpus", "colpus_rej": "Colpus", "csp": "Center for Systemic Peace",
                "archigos": "Archigos", "hrd": "V-Dem regimi storici", "pipe": "PIPE (Przeworski)",
                "wikidata": "Wikidata", "wikipedia": "Wikipedia", "wikipedia_c": "Wikipedia", **VIA}
MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}


def span(y: int, m: int | None, d: int | None) -> tuple[date, date, str]:
    """Intervallo coperto da una data eventualmente incompleta."""
    if m and d:
        try:
            return date(y, m, d), date(y, m, d), "day"
        except ValueError:
            d = None
    if m:
        return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1]), "month"
    return date(y, 1, 1), date(y, 12, 31), "year"


def rec(src, sid, ccode, y, m, d, outcome, label="", rej=False):
    lo, hi, prec = span(int(y), int(m) if m else None, int(d) if d else None)
    return {"src": src, "sid": str(sid), "ccode": ccode, "lo": lo, "hi": hi, "prec": prec,
            "outcome": outcome, "label": label, "rej": rej}


def num(v):
    try:
        f = float(v)
        return int(f) if f == f and f > 0 else None
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------------ caricamento fonti
PLOT_RE = re.compile(r"alleg|plot|conspir|planning|planned|plan to|arrested (?:for|after)|accused|foiled|"
                     r"thwart|uncover|shut down|described as")
FAIL_RE = re.compile(r"attempt|fail|unsuccess|abortive|suppress|crush|put down|defeat|quell|putsch")


def wiki_outcome(text: str) -> str:
    """Esito ricavato dal testo di una voce enciclopedica (stima: va letta come indicativa)."""
    t = text.lower()
    if PLOT_RE.search(t):
        return "plot"
    return "failed" if FAIL_RE.search(t) else "success"


def load_pt():
    f = sorted((ROOT / "data" / "raw" / "coups").glob("*.csv"))[-1]
    df = pd.read_csv(f)
    return [rec("pt", f"{r.ccode}-{r.year}-{r.month}-{r.day}", code_from_name(r.country) or canon_code(r.ccode),
                r.year, r.month, r.day, "success" if r.coup == 2 else "failed") for r in df.itertuples()]


def load_colpus():
    files = {f: pd.read_stata(f, convert_categoricals=False) for f in (SRC / "colpus").glob("*")}
    cand = max(files.values(), key=lambda d: d.shape[1])                     # file dei candidati
    main = max((d for d in files.values() if d.shape[1] < 60), key=lambda d: d["year"].max())
    out, seen = [], set()
    for r in main.itertuples():
        seen.add(r.id)
        out.append(rec("colpus", r.id, canon_code(r.ccode), r.date.year, r.date.month, r.date.day,
                       "success" if r.success == 1 else "failed"))
    for r in cand.itertuples():
        y, m, d = num(r.year), num(r.month), num(r.day)
        if not y:
            continue
        cc = canon_code(r.ccode)
        rejected = r.id not in seen and r.coup != 1
        if r.id not in seen:
            if r.coup == 1:
                out.append(rec("colpus", r.id, cc, y, m, d, "success" if r.success == 1 else "failed"))
            else:
                out.append(rec("colpus_rej", r.id, cc, y, m, d, "notcoup", str(r.eventtype), rej=True))
        for col in VIA:
            v = getattr(r, col, None)
            if col == "cline":
                v2 = getattr(r, "cline2", None)
                v = v2 if v2 == v2 and v2 is not None else v
            if v == 1 or v == 2:
                out.append(rec(col, r.id, cc, y, m, d, "success" if v == 1 else "failed", rej=rejected))
    return out


def load_csp():
    df = pd.read_excel(next((SRC / "csp").glob("*.xls*")))
    out = []
    for i, r in enumerate(df.itertuples()):
        cc, y = code_from_name(r.country), num(r.year)
        if not cc or not y:
            continue
        outcome = {1: "success", 2: "failed"}.get(num(r.success), "plot")
        out.append(rec("csp", i, cc, y, num(r.mth), num(r.day), outcome, str(r.leader or "")))
    return out


def load_archigos():
    df = pd.read_stata(next((SRC / "archigos").glob("*.dta")))
    code = df["exitcode"].astype(str)
    keep = df[(df["exit"].astype(str) == "Irregular") &
              code.str.contains("Removed by Military|Removed by Other Government Actors")]
    out = []
    for r in keep.itertuples():
        d = r.eoutdate
        if pd.isna(d) or d.year < START_YEAR:
            continue
        out.append(rec("archigos", r.obsid, canon_code(r.ccode), d.year, d.month, d.day, "success",
                       f"rimosso: {r.leader}"))
    return out


def load_hrd():
    """Regimi (Historical Regimes Data, dentro V-Dem) terminati da golpe militare, non militare o autogolpe."""
    df = pd.read_csv(SRC / "vdem" / "vdem_regimes.csv", low_memory=False)
    last = df.sort_values("year").drop_duplicates(["country_name", "v2reginfo"], keep="last")
    kinds = {0: "golpe militare", 1: "golpe non militare", 2: "autogolpe"}
    out = []
    for r in last.itertuples():
        if r.v2regendtype not in kinds:
            continue
        m = re.search(r"-\s*(\d{2})/(\d{2})/(\d{4})\)\s*$", str(r.v2reginfo))
        if not m or int(m.group(3)) < START_YEAR:
            continue
        cc = canon_code(r.COWcode) if r.COWcode == r.COWcode else code_from_name(r.country_name)
        if cc not in COUNTRIES:
            cc = code_from_name(r.country_name)
        out.append(rec("hrd", r.v2regidnr, cc, m.group(3), m.group(2), m.group(1), "success",
                       f"{kinds[r.v2regendtype]}: fine di {str(r.v2reginfo).split(' (')[0]}"))
    return out


def load_pipe():
    """PIPE da' solo il numero di golpe riusciti per paese-anno: una segnalazione per ciascuno."""
    df = pd.read_csv(SRC / "pipe" / "PIPE.csv", low_memory=False)
    df = df[(df["coups"] > 0) & (df["year"] >= START_YEAR)]
    out = []
    for r in df.itertuples():
        cc = canon_code(r.cown) if r.cown == r.cown else code_from_name(r.PIPE_country)
        for k in range(int(r.coups)):
            out.append(rec("pipe", f"{r.PIPE_country}-{r.year}-{k + 1}", cc, r.year, None, None, "success"))
    return out


DATE_PATTERNS = [
    (re.compile(r"\b([A-Z][a-z]+) (\d{1,2})(?:\s*[\u2013-]\s*\d{1,2})?,? (\d{4})\b"), ("m", "d", "y")),
    (re.compile(r"\b(\d{1,2})(?:\s*[\u2013-]\s*\d{1,2})? ([A-Z][a-z]+),? (\d{4})\b"), ("d", "m", "y")),
    (re.compile(r"\b([A-Z][a-z]+),? (\d{4})\b"), ("m", "y")),
    (re.compile(r"\b(\d{4})\b"), ("y",)),
]


def parse_date(text: str):
    for pat, parts in DATE_PATTERNS:
        for m in pat.finditer(text):
            v = dict(zip(parts, m.groups()))
            mon = MONTHS.get(v["m"].lower()) if "m" in v else None
            if "m" in v and not mon:
                continue
            y = int(v["y"])
            if 1000 <= y <= 2100:
                return y, mon, int(v["d"]) if "d" in v else None
    return None


def strip_wiki(line: str) -> str:
    raw = re.sub(r"<ref[^>]*?/>|<ref.*?</ref>|\{\{.*?\}\}", "", line)
    return re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", raw).strip()


def load_wikipedia_by_country():
    """Elenco per paese: il paese viene dall'intestazione e le date sono quasi sempre complete."""
    text = json.loads((SRC / "wikipedia" / "list_by_country.json").read_text())["parse"]["wikitext"]
    out, cc = [], None
    for line in text.splitlines():
        h = re.match(r"^==\s*([^=].*?)\s*==\s*$", line)
        if h:
            cc = code_from_name(h.group(1))
            continue
        if not cc or not re.match(r"^[#*]+", line):
            continue
        plain = strip_wiki(re.sub(r"^[#*]+\s*", "", line))
        d = parse_date(plain.split(":")[0][:90]) or parse_date(plain[:160])
        if not d or d[0] < START_YEAR or len(plain) < 8:
            continue
        out.append(rec("wikipedia_c", f"{cc}:{plain[:60]}", cc, d[0], d[1], d[2], wiki_outcome(plain), plain[:160]))
    return out


def load_wikidata():
    rows = json.loads((SRC / "wikidata" / "wikidata_coups.json").read_text())["results"]["bindings"]
    items: dict[str, dict] = {}
    for b in rows:
        q = b["e"]["value"].rsplit("/", 1)[1]
        it = items.setdefault(q, {"label": b.get("eLabel", {}).get("value", ""), "types": set(),
                                  "dates": set(), "countries": [], "title": None})
        it["types"].add(b.get("typeLabel", {}).get("value", ""))
        for k in ("date", "start"):
            if k in b and not b[k]["value"].startswith("-"):
                it["dates"].add(b[k]["value"][:10])
        if "countryLabel" in b:
            it["countries"].append(b["countryLabel"]["value"])
        if "article" in b:
            it["title"] = b["article"]["value"].rsplit("/wiki/", 1)[-1].replace("_", " ")
    out, by_title = [], {}
    for q, it in items.items():
        if not it["dates"]:
            continue
        y, m, d = (int(x) for x in min(it["dates"]).split("-"))
        if y < START_YEAR:
            continue
        if m == 1 and d == 1:
            m = d = None            # Wikidata scrive 1 gennaio quando conosce solo l'anno
        elif d == 1:
            d = None
        cc = code_from_text(it["label"]) or next((c for c in map(code_from_name, it["countries"]) if c), None)
        if not cc:
            continue
        outcome = wiki_outcome(it["label"] + " " + " ".join(it["types"]))
        r = rec("wikidata", q, cc, y, m, d, outcome, it["label"])
        out.append(r)
        if it["title"]:
            by_title[it["title"].lower()] = r
    return out, by_title


def load_wikipedia(by_title):
    text = json.loads((SRC / "wikipedia" / "list_coups.json").read_text())["parse"]["wikitext"]
    out, year, sect = [], None, None
    for line in text.splitlines():
        h = re.match(r"^(=+)\s*'*(\d{4})(?:\s*[\u2013-].*?)?'*\s*=+\s*$", line)
        if h:
            year = int(h.group(2)) if len(h.group(1)) >= 3 else None   # "==1900-1919==" e' solo un periodo
            sect = year
            continue
        if not line.startswith("*") or not year or year < START_YEAR:
            continue
        raw = re.sub(r"<ref[^>]*?/>|<ref.*?</ref>|\{\{.*?\}\}", "", line.lstrip("* "))
        link = re.search(r"\[\[([^\]|#]+)", raw)
        plain = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", raw).strip()
        if len(plain) < 8:
            continue
        head = plain.split(":")[0][:80]
        ys = [int(v) for v in re.findall(r"\b((?:19|20)\d\d)\b", head)]
        year = next((v for v in ys if sect <= v <= sect + 9), sect)   # l'anno nel testo batte la sezione
        cc = code_from_text(head) or code_from_text(plain)
        if not cc:
            continue
        outcome = wiki_outcome(plain)
        mon = next((MONTHS[w] for w in re.findall(r"[a-z]+", head.lower()) if w in MONTHS), None)
        r = rec("wikipedia", f"{year}:{plain[:60]}", cc, year, mon, None, outcome, plain[:160])
        wd = by_title.get(link.group(1).strip().lower()) if link else None
        if wd and wd["lo"].year == year:          # stessa voce di Wikidata: ne eredita la data
            r.update(lo=wd["lo"], hi=wd["hi"], prec=wd["prec"], ccode=wd["ccode"])
        out.append(r)
    return out


# ------------------------------------------------------------------ incrocio
def gap(a_lo, a_hi, b_lo, b_hi) -> int:
    """Giorni che separano due intervalli (0 se si sovrappongono)."""
    if a_hi < b_lo:
        return (b_lo - a_hi).days
    if b_hi < a_lo:
        return (a_lo - b_hi).days
    return 0


GENERIC = {"coup", "etat", "attempt", "attempted", "state", "military", "president", "government",
           "against", "with", "from", "that", "this", "were", "which", "after", "overthrew", "plot"}


def words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]{4,}", text.lower()) if w not in GENERIC}


def cluster(records):
    """Riunisce le segnalazioni in eventi. Ordine: fonti migliori prima, cosi' fissano data ed esito."""
    def rank(r):
        base = ORDER.get(r["src"], VIA_RANK)
        if r["rej"]:
            base = ORDER["colpus_rej"]       # righe scartate da Colpus: dopo le fonti accademiche dirette
        return (base, r["lo"])

    by_country: dict[int, list[dict]] = {}
    for r in sorted(records, key=rank):
        if r["ccode"] is None or r["lo"].year < START_YEAR:
            continue
        win = WINDOW_REJ if r["rej"] else WINDOW
        cands, blocked = [], False
        for c in by_country.setdefault(r["ccode"], []):
            g = gap(r["lo"], r["hi"], c["lo"], c["hi"])
            if g > win:
                continue
            if r["src"] in c["srcs"]:
                blocked = True
                continue
            same = any(m["outcome"] == r["outcome"] for m in c["members"])
            sim = max((len(words(r["label"]) & words(m["label"])) for m in c["members"]), default=0)
            cands.append((g, -sim, 0 if same else 1, c))
        if cands:
            cands.sort(key=lambda x: x[:3])
            c = cands[0][3]
            c["members"].append(r)
            c["srcs"].add(r["src"])
            c["ambiguous"] |= len(cands) > 1 and cands[0][:3] == cands[1][:3]
            if (r["hi"] - r["lo"]) < (c["hi"] - c["lo"]):      # data piu' precisa: aggiorna
                c["lo"], c["hi"] = r["lo"], r["hi"]
        elif r["rej"] and blocked and r["src"] != "colpus_rej":
            continue        # la stessa fonte e' gia' nell'evento vicino: e' un doppione con data diversa
        else:
            by_country[r["ccode"]].append({"lo": r["lo"], "hi": r["hi"], "members": [r],
                                           "srcs": {r["src"]}, "ambiguous": False})

    # righe che Colpus marca come doppione ("combined"): fuse nell'evento Colpus piu' vicino
    for cs in by_country.values():
        for c in list(cs):
            if "colpus" in c["srcs"] or not any(m["src"] == "colpus_rej" and m["label"] == "combined"
                                                for m in c["members"]):
                continue
            near = [(gap(c["lo"], c["hi"], o["lo"], o["hi"]), k) for k, o in enumerate(cs)
                    if o is not c and "colpus" in o["srcs"]]
            near = [n for n in near if n[0] <= WINDOW_REJ]
            if near:
                target = cs[min(near)[1]]
                target["members"] += [m for m in c["members"] if m["src"] not in target["srcs"]]
                target["srcs"] |= c["srcs"]
                cs.remove(c)
    return [c for cs in by_country.values() for c in cs]


def consolidate(clusters):
    order = ORDER
    events, atts, used = [], [], {}
    for c in clusters:
        ms = sorted(c["members"], key=lambda r: order.get(r["src"], VIA_RANK))
        coupish = [m for m in ms if m["outcome"] in ("success", "failed")]
        sch = [m for m in coupish if m["src"] not in TERTIARY]
        ter = [m for m in coupish if m["src"] in TERTIARY]
        plots = [m for m in ms if m["outcome"] == "plot"]
        notcoup = next((m for m in ms if m["outcome"] == "notcoup"), None)
        if notcoup and any(m["src"] == "colpus" for m in ms):
            notcoup = None                          # doppione fuso in un golpe accettato da Colpus
        if not coupish and not plots:
            continue                                    # solo candidati scartati da Colpus
        if coupish:
            outcome = (sch or ter)[0]["outcome"]
            kind = "riuscito" if outcome == "success" else "fallito"
        else:
            kind = "complotto"
        n_sch = len({m["src"] for m in sch})
        n_ter = len({TERTIARY[m["src"]] for m in ter})
        if n_sch >= 2:
            tier = "A"
        elif n_sch == 1 and n_ter >= 1:
            tier = "B"
        elif n_sch == 1 or n_ter >= 2:
            tier = "C"
        else:
            tier = "D"
        rej = notcoup["label"] if notcoup else ""
        if rej == "not exist":                      # Colpus ha verificato e non ha trovato l'evento
            direct = any(m["src"] in ("pt", "csp", "archigos") for m in sch)
            tier = "C" if direct else "D"
        best = min(ms, key=lambda r: ((r["hi"] - r["lo"]).days, order.get(r["src"], VIA_RANK)))
        cc = ms[0]["ccode"]
        base = f"{cc}-{best['lo']:%Y%m%d}"
        used[base] = used.get(base, 0) + 1
        eid = base if used[base] == 1 else f"{base}-{used[base]}"
        outs = {m["outcome"] for m in sch} or {m["outcome"] for m in ter}
        label = next((m["label"] for m in ms if m["src"] in TERTIARY and m["label"]), "")
        events.append({
            "event_id": eid, "ccode": cc, "country": name_of(cc),
            "date": best["lo"].isoformat(), "date_precision": best["prec"], "year": best["lo"].year,
            "type": kind, "confidence": tier,
            "n_scholarly": n_sch, "n_encyclopedic": n_ter,
            "sources": "; ".join(dict.fromkeys(SOURCE_NAMES.get(m["src"], m["src"]) for m in coupish + plots)),
            "outcome_disputed": len(outs) > 1,
            "colpus_class": rej,
            "self_coup": rej == "autogolpe" or any(m["label"].startswith("autogolpe") for m in ms)
                         or bool(re.search(r"self-coup|autogolpe|auto-coup", label.lower())),
            "disputed": len(outs) > 1 or bool(rej),
            "match_ambiguous": c["ambiguous"],
            "label": label,
        })
        for m in ms:
            atts.append({"event_id": eid, "source": SOURCE_NAMES.get(m["src"], m["src"]),
                         "source_id": m["sid"], "source_outcome": m["outcome"],
                         "source_date": m["lo"].isoformat(), "source_date_precision": m["prec"],
                         "source_label": m["label"]})
    ev = pd.DataFrame(events).sort_values(["ccode", "date"]).reset_index(drop=True)
    # stesso paese, stesso esito, date a meno di un mese e nessuna fonte in comune: con buona
    # probabilita' e' lo stesso evento datato diversamente. Non si fonde d'ufficio: si segnala.
    ev["possible_duplicate_of"] = ""
    d = pd.to_datetime(ev["date"])
    for i in range(1, len(ev)):
        a, b = ev.loc[i - 1], ev.loc[i]
        if a.ccode != b.ccode or a.type != b.type or a.type == "complotto" or (d[i] - d[i - 1]).days > 31:
            continue
        if set(a.sources.split("; ")) & set(b.sources.split("; ")):
            continue
        weak, strong = (i - 1, i) if (a.n_scholarly, a.n_encyclopedic) < (b.n_scholarly, b.n_encyclopedic) else (i, i - 1)
        ev.loc[weak, "possible_duplicate_of"] = ev.loc[strong, "event_id"]
    ev = ev.sort_values(["date", "ccode"]).reset_index(drop=True)
    return ev, pd.DataFrame(atts)


def main():
    warnings.simplefilter("ignore")
    wd, by_title = load_wikidata()
    sources = {"pt": load_pt(), "colpus+via": load_colpus(), "csp": load_csp(),
               "archigos": load_archigos(), "hrd": load_hrd(), "pipe": load_pipe(), "wikidata": wd,
               "wikipedia (paese)": load_wikipedia_by_country(), "wikipedia (anno)": load_wikipedia(by_title)}
    for k, v in sources.items():
        print(f"  {k:18s} {len(v):5d} segnalazioni")
    records = [r for v in sources.values() for r in v]
    unknown = sorted({r["ccode"] for r in records if r["ccode"] is not None and r["ccode"] not in COUNTRIES})
    if unknown:
        print("ATTENZIONE - codici paese non in anagrafe:", unknown)
    ev, atts = consolidate(cluster(records))
    OUT.mkdir(parents=True, exist_ok=True)
    ev.to_csv(OUT / "coups.csv", index=False)
    atts.to_csv(OUT / "attestations.csv", index=False)
    print(f"\n{len(ev)} eventi -> {OUT.relative_to(ROOT)}/coups.csv  ({len(atts)} segnalazioni collegate)")
    ev["decade"] = ev["year"] // 10 * 10
    print(pd.crosstab(ev["decade"], ev["confidence"], margins=True).to_string())
    print(pd.crosstab(ev["type"], ev["confidence"], margins=True).to_string())
    print("esito discusso:", int(ev["outcome_disputed"].sum()), "| scartati da Colpus ma presenti altrove:",
          int((ev["colpus_class"] != "").sum()), "| abbinamento ambiguo:", int(ev["match_ambiguous"].sum()),
          "| possibili doppioni:", int((ev["possible_duplicate_of"] != "").sum()))


if __name__ == "__main__":
    main()
