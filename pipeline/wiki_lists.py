"""Lettura degli elenchi di golpe nelle Wikipedia francese, spagnola e tedesca.

Ogni funzione restituisce righe grezze: (anno, mese, giorno, nome del paese nella lingua
dell'elenco, esito, descrizione). Il nome del paese viene poi tradotto in inglese con i
collegamenti interlingua di Wikipedia (vedi fetch_coup_sources.py).
"""
from __future__ import annotations

import re

FR_MONTHS = {"janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6, "juillet": 7,
             "août": 8, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12}
DE_MONTHS = {"januar": 1, "februar": 2, "märz": 3, "april": 4, "mai": 5, "juni": 6, "juli": 7, "august": 8,
             "september": 9, "oktober": 10, "november": 11, "dezember": 12}


def clean(text: str) -> str:
    t = re.sub(r"<ref[^>]*?/>|<ref.*?</ref>", "", text, flags=re.S)
    t = re.sub(r"\{\{[^{}]*\}\}", "", t)
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    return re.sub(r"\s+", " ", t.replace("'''", "").replace("''", "")).strip(" |")


def first_link(cell: str) -> str | None:
    """Destinazione del primo collegamento [[...]] o nome del primo modello {{...}} (bandiere-paese)."""
    m = re.search(r"\[\[([^\]|#]+)", cell)
    if m:
        return m.group(1).strip()
    m = re.search(r"\{\{([^{}|]+)", cell)
    return m.group(1).strip() if m else (clean(cell) or None)


def rows_of(text: str):
    for row in re.split(r"\n\|-[^\n]*", text):
        cells = [c for c in re.split(r"\n[|!]|\|\|", "\n" + row.strip()) if c.strip()]
        if len(cells) >= 2:
            yield cells


def parse_fr(text: str):
    start = text.find("XX}} ===")
    out = []
    for cells in rows_of(text[start:] if start > 0 else text):
        head = cells[0]
        m = re.search(r"\{\{date[^|}]*\|(\d*)\|([^|}]*)\|(\d{4})", head, re.I)
        if m:
            d = int(m.group(1)) if m.group(1) else None
            mon = int(m.group(2)) if m.group(2).isdigit() else FR_MONTHS.get(m.group(2).strip().lower())
            y = int(m.group(3))
        else:
            plain = clean(head).lower()
            ym = re.search(r"\b(1[89]\d\d|20\d\d)\b", plain)
            if not ym:
                continue
            y = int(ym.group(1))
            mon = next((v for k, v in FR_MONTHS.items() if k in plain), None)
            dm = re.search(r"\b(\d{1,2})(?:er)?\s+[a-zéûô]+\s+" + str(y), plain)
            d = int(dm.group(1)) if dm and mon else None
        country = first_link(cells[1])
        desc = clean(" ".join(cells[2:]))
        low = desc.lower()
        if re.search(r"complot|projet de coup|présumé|accus", low):
            outcome = "plot"
        elif re.search(r"raté|échou|echou|tentative|avort|déjou|manqué", low):
            outcome = "failed"
        else:
            outcome = "success"
        if country:
            out.append((y, mon, d, country, outcome, desc[:160]))
    return out


def parse_es(text: str):
    start = text.find("{{Siglo|XX|")
    out, year = [], None
    for row in re.split(r"\n\|-[^\n]*", text[start:] if start > 0 else text):
        cells = [c.strip() for c in re.split(r"\n\|", "\n" + row.strip()) if c.strip()]
        if not cells:
            continue
        m = re.match(r"^(?:rowspan\s*=\s*\"?\d+\"?\s*\|)?\s*(\d{4})\s*$", cells[0])
        if m:
            year = int(m.group(1))
            cells = cells[1:]
        if not year or len(cells) < 5:
            continue
        country = first_link(cells[1])
        desc = clean(cells[4]) or clean(" ".join(cells[2:4]))
        low = desc.lower()
        outcome = "failed" if re.search(r"intento|intentona|fallid|tentativa|frustrad|conato|fracas", low) else "success"
        if country:
            out.append((year, None, None, country, outcome, desc[:160]))
    return out


def parse_de(text: str):
    start = text.find("=== 20. Jahrhundert ===")
    out = []
    for cells in rows_of(text[start:] if start > 0 else text):
        head = clean(cells[0]).lower()
        ym = re.search(r"\b(19\d\d|20\d\d)\b", head)
        if not ym:
            continue
        y = int(ym.group(1))
        mon = next((v for k, v in DE_MONTHS.items() if k in head), None)
        dm = re.match(r"^(\d{1,2})\.", head)
        d = int(dm.group(1)) if dm and mon else None
        country = first_link(cells[1]) if "[[" in cells[1] else clean(cells[1])
        desc = clean(" ".join(cells[2:]))
        low = desc.lower()
        outcome = "failed" if re.search(r"scheiter|putschversuch|niedergeschlagen|misslang|mißlang|vereitelt|"
                                        r"versuch|erfolglos|fehlgeschlagen", low) else "success"
        if country:
            out.append((y, mon, d, country, outcome, desc[:160]))
    return out


PARSERS = {"fr": parse_fr, "es": parse_es, "de": parse_de}
