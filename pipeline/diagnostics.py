"""Inspectable country evidence, using exactly the input rows of the fitted model."""
import numpy as np
import pandas as pd
from panel import GROUPS, GROUP_LABELS


INDICATORS = [
    ("v2x_polyarchy", "Electoral democracy", "index 0–1", "V-Dem", "vy", None),
    ("v2x_libdem", "Liberal democracy", "index 0–1", "V-Dem", "vy", None),
    ("v2x_ex_military", "Military executive power", "index 0–1", "V-Dem", "vy", None),
    ("v2x_rule", "Rule of law", "index 0–1", "V-Dem", "vy", None),
    ("v2x_corr", "Political corruption", "index 0–1; higher = more corruption", "V-Dem", "vy", None),
    ("v2x_civlib", "Civil liberties", "index 0–1", "V-Dem", "vy", None),
    ("v2x_jucon", "Judicial constraints", "index 0–1", "V-Dem", "vy", None),
    ("v2xlg_legcon", "Legislative constraints", "index 0–1", "V-Dem", "vy", None),
    ("l_tenure", "Head-of-state tenure", "years, estimated from annual records", "V-Dem", "vy", "expm1"),
    ("r_regime_age", "Regime age", "years", "V-Dem", "vy", "expm1"),
    ("e_growth", "GDP growth", "%; clipped to −30 / +30 in the model", "World Bank / V-Dem", "wy", None),
    ("e_growth_3y", "Average growth, 3 years", "%", "World Bank / V-Dem", "wy", None),
    ("e_inflation", "Consumer price inflation", "%; clipped to 0 / 500 in the model", "World Bank", "wy", "expm1"),
    ("e_log_infmort", "Infant mortality", "per 1,000 live births; floor 1; may be carried forward up to 5 years", "World Bank", "wy", "exp"),
    ("c_region_12m", "Other regional attempts, 12 months", "attempts", "Coup database", None, "expm1"),
    ("c_global_12m", "Other global attempts, 12 months", "attempts", "Coup database", None, "expm1"),
]


def country_diagnostics(rows, components):
    result = {}
    for i, (_, row) in enumerate(rows.iterrows()):
        indicators = []
        for key, label, unit, source, year, transform in INDICATORS:
            value = row.get(key)
            if pd.notna(value):
                value = np.expm1(value) if transform == "expm1" else np.exp(value) if transform == "exp" else value
            indicators.append({"key": key, "label": label, "unit": unit, "source": source,
                               "reference_year": int(row[year]) if year else None,
                               "value": round(float(value), 3) if pd.notna(value) else None})
        coverage = [{"key": group, "label": GROUP_LABELS[group], "observed": int(row[features].notna().sum()),
                     "total": len(features)} for group, features in GROUPS.items() if group != "tempo"]
        result[int(row.unit)] = {
            "indicators": indicators, "coverage": coverage,
            "regime": {0: "Closed autocracy", 1: "Electoral autocracy", 2: "Electoral democracy", 3: "Liberal democracy"}.get(row.get("v2x_regime")),
            "components": [{"key": name, "probability": round(float(values[i]), 6)} for name, values in components.items()],
            "acled_signals": [{"key": key, "value": round(float(row[key]), 3) if pd.notna(row[key]) else None}
                              for key in GROUPS["acled"]],
        }
    return result
