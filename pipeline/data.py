"""Caricamento ACLED + Powell & Thyne e costruzione del panel paese-mese."""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

ACLED_COLS = {"event_id_cnty", "event_date", "event_type", "sub_event_type", "inter1", "inter2",
              "iso", "region", "country", "fatalities"}

# Serie mensili grezze costruite dagli eventi ACLED
RAW_SERIES = ["protests", "riots", "battles", "explosions", "vac", "strategic", "fatalities",
              "infighting", "repression", "arrests", "state_vs_civ"]

# Nomi Powell & Thyne (normalizzati) -> nome paese ACLED
ALIASES = {
    "burma": "Myanmar", "myanmar burma": "Myanmar",
    "ivory coast": "Ivory Coast", "cote divoire": "Ivory Coast", "cote d ivoire": "Ivory Coast",
    "dr congo": "Democratic Republic of Congo", "drc": "Democratic Republic of Congo",
    "congo dr": "Democratic Republic of Congo", "congo kinshasa": "Democratic Republic of Congo",
    "democratic republic of the congo": "Democratic Republic of Congo",
    "congo democratic republic of": "Democratic Republic of Congo",
    "zaire": "Democratic Republic of Congo",
    "congo": "Republic of Congo", "congo brazzaville": "Republic of Congo",
    "republic of the congo": "Republic of Congo", "congo republic of": "Republic of Congo",
    "swaziland": "eSwatini", "eswatini": "eSwatini",
    "gambia": "Gambia", "the gambia": "Gambia",
    "east timor": "East Timor", "timor leste": "East Timor",
    "usa": "United States", "united states of america": "United States",
    "uk": "United Kingdom", "turkiye": "Turkey",
    "cape verde": "Cape Verde", "cabo verde": "Cape Verde",
    "macedonia": "North Macedonia", "kyrgyz republic": "Kyrgyzstan",
    "bosnia": "Bosnia and Herzegovina", "bosnia herzegovina": "Bosnia and Herzegovina",
    "russia soviet union": "Russia", "ussr": "Russia", "soviet union": "Russia",
    "korea south": "South Korea", "republic of korea": "South Korea",
    "korea north": "North Korea", "yemen arab republic": "Yemen", "yemen north": "Yemen",
    "trinidad": "Trinidad and Tobago", "trinidad tobago": "Trinidad and Tobago",
    "sao tome": "Sao Tome and Principe", "sao tome principe": "Sao Tome and Principe",
    "comoro islands": "Comoros", "surinam": "Suriname", "uae": "United Arab Emirates",
    "papua new guinea": "Papua New Guinea", "png": "Papua New Guinea",
    "central african rep": "Central African Republic", "car": "Central African Republic",
    "dominican rep": "Dominican Republic", "eq guinea": "Equatorial Guinea",
}


def norm(name: str) -> str:
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9 ]+", " ", s.lower().replace("&", " and ").replace("'", ""))
    return re.sub(r"\s+", " ", s).strip()


def ordinal(year, month):
    """Indice intero del mese (anno*12 + mese-1)."""
    return np.asarray(year) * 12 + np.asarray(month) - 1


def ord_label(o: int) -> str:
    return f"{o // 12}-{o % 12 + 1:02d}"


# ---------------------------------------------------------------- ACLED
def _parse_dates(s: pd.Series) -> pd.Series:
    for fmt in ("%Y-%m-%d", "%d %B %Y", "%d-%B-%Y", "%d/%m/%Y"):
        d = pd.to_datetime(s, format=fmt, errors="coerce")
        if d.notna().mean() > 0.95:
            return d
    return pd.to_datetime(s, errors="coerce", dayfirst=True)


def _is_state(col: pd.Series) -> pd.Series:
    v = col.astype(str).str.strip().str.lower()
    return v.isin({"1", "1.0", "state forces"})


def load_acled(folder: Path) -> pd.DataFrame:
    files = sorted(p for p in folder.glob("*.csv"))
    if not files:
        raise FileNotFoundError(f"Nessun CSV ACLED in {folder}")
    parts = []
    for f in files:
        with open(f, "r", encoding="utf-8-sig", errors="replace") as fh:
            head = fh.readline()
        sep = ";" if head.count(";") > head.count(",") else ","
        df = pd.read_csv(f, sep=sep, usecols=lambda c: c.strip().lower() in ACLED_COLS,
                         low_memory=False, encoding="utf-8-sig")
        df.columns = [c.strip().lower() for c in df.columns]
        missing = {"event_date", "event_type", "country"} - set(df.columns)
        if missing:
            raise ValueError(f"{f.name}: colonne mancanti {sorted(missing)} - e' un export ACLED "
                             "a livello di evento?")
        parts.append(df)
        print(f"  {f.name}: {len(df):,} righe")
    df = pd.concat(parts, ignore_index=True)
    if "event_id_cnty" in df.columns:
        df = df.drop_duplicates("event_id_cnty")
    df["event_date"] = _parse_dates(df["event_date"])
    df = df.dropna(subset=["event_date", "country"])
    for c in ("sub_event_type", "inter1", "inter2", "region"):
        if c not in df.columns:
            df[c] = ""
    df["fatalities"] = pd.to_numeric(df.get("fatalities", 0), errors="coerce").fillna(0)
    df["iso"] = pd.to_numeric(df.get("iso", np.nan), errors="coerce")
    return df


def monthly_panel(ev: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Eventi -> panel paese-mese bilanciato (zeri nei mesi senza eventi)."""
    et = ev["event_type"].astype(str).str.strip().str.lower()
    sub = ev["sub_event_type"].astype(str).str.strip().str.lower()
    s1, s2 = _is_state(ev["inter1"]), _is_state(ev["inter2"])
    m = pd.DataFrame({
        "country": ev["country"].astype(str).str.strip(),
        "t": ordinal(ev["event_date"].dt.year, ev["event_date"].dt.month),
        "protests": et.eq("protests"),
        "riots": et.eq("riots"),
        "battles": et.eq("battles"),
        "explosions": et.str.startswith("explosions"),
        "vac": et.eq("violence against civilians"),
        "strategic": et.eq("strategic developments"),
        "fatalities": ev["fatalities"],
        "infighting": s1 & s2,
        "repression": sub.isin({"excessive force against protesters", "protest with intervention"}),
        "arrests": sub.eq("arrests"),
        "state_vs_civ": et.eq("violence against civilians") & (s1 | s2),
    })
    agg = m.groupby(["country", "t"], sort=True)[RAW_SERIES].sum().astype(float)

    last_date = ev["event_date"].max()
    t_end = int(ordinal(last_date.year, last_date.month))
    if last_date.day < 25:          # ultimo mese incompleto: escluso
        t_end -= 1
    first = agg.reset_index().groupby("country")["t"].min()
    idx = pd.MultiIndex.from_tuples(
        [(c, t) for c, t0 in first.items() for t in range(int(t0), t_end + 1)],
        names=["country", "t"])
    panel = agg.reindex(idx, fill_value=0.0).reset_index()

    info = ev.assign(country=m["country"]).groupby("country").agg(
        iso=("iso", "first"), region=("region", lambda s: s.mode().iat[0] if len(s.mode()) else ""))
    panel = panel.merge(info, left_on="country", right_index=True, how="left")
    meta = {"t_end": t_end, "n_events": int(len(ev)),
            "date_min": str(ev["event_date"].min().date()), "date_max": str(last_date.date())}
    return panel, meta


# ---------------------------------------------------------------- golpe
def load_coups(path: Path, acled_countries: list[str]) -> tuple[pd.DataFrame, list[str]]:
    """Legge Powell & Thyne (coup: 1 = fallito, 2 = riuscito) e allinea i nomi ad ACLED."""
    df = pd.read_csv(path, sep=None, engine="python")   # CSV (sito di Powell) o testo con tab
    df.columns = [c.strip().lower() for c in df.columns]
    need = {"country", "year", "month", "coup"}
    if not need <= set(df.columns):
        raise ValueError(f"{path.name}: attese le colonne {sorted(need)}, trovate {list(df.columns)}")
    for c in ("year", "month", "coup"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["year", "month", "coup"])
    lookup = {norm(c): c for c in acled_countries}
    def match(name):
        n = norm(name)
        if n in lookup:
            return lookup[n]
        alias = ALIASES.get(n)
        return alias if alias in set(acled_countries) else (alias or None)
    df["pt_name"] = df["country"].astype(str).str.strip()
    df["country"] = df["pt_name"].map(match)
    df["t"] = ordinal(df["year"].astype(int), df["month"].astype(int))
    df["success"] = df["coup"].astype(int).eq(2)
    in_acled = df["country"].isin(set(acled_countries))
    unmatched = sorted(df.loc[~in_acled & (df["year"] >= 1997), "pt_name"].unique())
    return df[["pt_name", "country", "year", "month", "t", "success"]].reset_index(drop=True), unmatched


def add_coup_features(panel: pd.DataFrame, coups: pd.DataFrame, horizon: int) -> pd.DataFrame:
    """Target (tentativo di golpe nei prossimi `horizon` mesi) + variabili di storia golpista."""
    panel = panel.sort_values(["country", "t"]).reset_index(drop=True)
    by_country = {c: np.sort(g["t"].to_numpy()) for c, g in coups.dropna(subset=["country"]).groupby("country")}
    region_of = panel.groupby("country")["region"].first()
    reg_times: dict[str, list] = {}
    for c, ts in by_country.items():
        if c in region_of.index:
            reg_times.setdefault(region_of[c], []).extend(ts.tolist())
    reg_times = {r: np.sort(np.array(v)) for r, v in reg_times.items()}

    t_end = panel["t"].max()
    out = {k: np.zeros(len(panel)) for k in ("y", "onset", "yrs_since", "coups_10y", "region_12m")}
    for c, idx in panel.groupby("country").indices.items():
        t = panel["t"].to_numpy()[idx]
        ct = by_country.get(c, np.array([], dtype=int))
        le = np.searchsorted(ct, t, side="right")                 # golpe <= t
        out["y"][idx] = (np.searchsorted(ct, t + horizon, side="right") - le) > 0
        out["onset"][idx] = np.isin(t, ct)
        last = np.where(le > 0, ct[np.maximum(le - 1, 0)] if len(ct) else 0, 1950 * 12)
        out["yrs_since"][idx] = np.minimum((t - last) / 12.0, 50.0)
        out["coups_10y"][idx] = le - np.searchsorted(ct, t - 120, side="right")
        rt = reg_times.get(region_of[c], np.array([], dtype=int))
        reg = np.searchsorted(rt, t, side="right") - np.searchsorted(rt, t - 12, side="right")
        own = le - np.searchsorted(ct, t - 12, side="right")
        out["region_12m"][idx] = reg - own
    for k, v in out.items():
        panel[k] = v
    panel["y_known"] = panel["t"] + horizon <= t_end   # finestra del target interamente osservata
    return panel


def add_acled_features(panel: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    g = panel.groupby("country", sort=False)
    panel["unrest"] = panel["protests"] + panel["riots"]
    panel["violence"] = panel["battles"] + panel["explosions"] + panel["vac"]
    feats = []
    for s in ["unrest", "violence", "fatalities", "infighting", "repression", "arrests",
              "state_vs_civ", "strategic"]:
        r3 = g[s].transform(lambda x: x.rolling(3, min_periods=1).sum())
        r12 = g[s].transform(lambda x: x.rolling(12, min_periods=1).sum())
        panel[f"{s}_12m"] = np.log1p(r12)
        feats.append(f"{s}_12m")
        if s in ("unrest", "violence", "fatalities", "infighting", "repression"):
            # accelerazione: ultimi 3 mesi rispetto alla media dei 12
            panel[f"{s}_trend"] = np.log1p(r3 / 3.0) - np.log1p(r12 / 12.0)
            feats.append(f"{s}_trend")
    panel["hist_recency"] = -np.log1p(panel["yrs_since"])
    panel["hist_coups_10y"] = np.log1p(panel["coups_10y"])
    panel["hist_region_12m"] = np.log1p(panel["region_12m"])
    panel["age"] = g.cumcount()
    return panel, feats


HIST_FEATURES = ["hist_recency", "hist_coups_10y", "hist_region_12m"]

LABELS = {
    "unrest_12m": "Proteste e disordini (12 mesi)",
    "unrest_trend": "Accelerazione di proteste e disordini",
    "violence_12m": "Violenza armata (12 mesi)",
    "violence_trend": "Accelerazione della violenza armata",
    "fatalities_12m": "Vittime (12 mesi)",
    "fatalities_trend": "Accelerazione delle vittime",
    "infighting_12m": "Scontri tra forze statali (12 mesi)",
    "infighting_trend": "Accelerazione scontri tra forze statali",
    "repression_12m": "Repressione delle proteste (12 mesi)",
    "repression_trend": "Accelerazione della repressione",
    "arrests_12m": "Arresti politici (12 mesi)",
    "state_vs_civ_12m": "Violenza statale sui civili (12 mesi)",
    "strategic_12m": "Sviluppi strategici (12 mesi)",
    "hist_recency": "Golpe recente nel paese",
    "hist_coups_10y": "Numero di golpe negli ultimi 10 anni",
    "hist_region_12m": "Golpe nella regione (12 mesi)",
}
