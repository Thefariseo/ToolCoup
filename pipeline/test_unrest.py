"""Test del modulo disordine (pipeline/unrest.py): bersagli e assenza di sguardo al futuro nelle variabili. Si esegue con `python3 -m pytest pipeline`."""
import sys
import unittest
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import unrest as U  # noqa: E402

warnings.filterwarnings("ignore", category=RuntimeWarning)         # le medie di righe vuote dei paesi giocattolo senza vicini
T0 = 24000        # un indice di mese qualsiasi: anno * 12 + mese


def toy(n_months=90, n_countries=6, seed=0):
    """Sei paesi inventati con conteggi di Poisson per ogni serie che usa il modulo, due regioni e due vicini a testa."""
    rng = np.random.default_rng(seed)
    ts = np.arange(T0, T0 + n_months)
    cols = [f"C{i}" for i in range(n_countries)]
    scale = {"u": 40, "p": 30, "r": 10, "v": 20, "fatalities": 15, "repression": 8, "arrests": 6, "strategic": 5, "state_vs_civ": 4, "infighting": 3}
    mats = {k: pd.DataFrame(rng.poisson(s, (n_months, n_countries)).astype(float), index=ts, columns=cols) for k, s in scale.items()}
    region = pd.Series(["A", "A", "A", "B", "B", "B"], index=cols)
    nb = np.array([[1, 2], [0, 2], [0, 1], [4, 5], [3, 5], [3, 4]])
    return mats, region, nb


class UnrestTests(unittest.TestCase):
    def test_features_do_not_look_ahead(self):
        mats, region, nb = toy()
        base, _ = U.features(mats, region, nb)
        cut = mats["u"].index[60]
        other = {k: v.copy() for k, v in mats.items()}
        for v in other.values():                                         # un futuro completamente diverso dopo `cut`
            v.loc[v.index > cut] = v.loc[v.index > cut] * 7 + 100
        changed, _ = U.features(other, region, nb)
        self.assertEqual(set(base), set(changed))
        for name in base:
            pd.testing.assert_frame_equal(base[name].loc[:cut], changed[name].loc[:cut], check_exact=False, atol=1e-9, obj=name)

    def test_features_change_when_the_past_changes(self):
        """Controllo di sensibilita': il test precedente non e' vuoto se alterando il passato le variabili cambiano."""
        mats, region, nb = toy()
        base, _ = U.features(mats, region, nb)
        other = {k: v.copy() for k, v in mats.items()}
        for v in other.values():
            v.iloc[40:55] = v.iloc[40:55] * 5 + 50
        changed, _ = U.features(other, region, nb)
        inside = mats["u"].index[50]                                     # un mese dentro la finestra alterata
        self.assertFalse(base["l_u3"].loc[inside].equals(changed["l_u3"].loc[inside]))

    def test_targets(self):
        ts = np.arange(T0, T0 + 36)
        u = pd.DataFrame({"big": np.r_[np.full(24, 100.0), np.full(12, 300.0)], "small": np.r_[np.full(24, 10.0), np.full(12, 20.0)],
                          "flat": np.full(36, 100.0)}, index=ts)
        y = U.targets({"u": u, "v": u * 0.5})["wave"]
        self.assertEqual(y["big"].loc[ts[23]], 1.0)           # i tre mesi dopo sono a 300, l'anno precedente a 100: 3 volte
        self.assertEqual(y["big"].loc[ts[20]], 0.0)           # i tre mesi dopo sono ancora a 100
        self.assertEqual(y["big"].loc[ts[26]], 1.0)           # 300 contro la media dell'anno (150): ancora 2 volte, sopra 1,5
        self.assertEqual(y["small"].loc[ts[23]], 0.0)         # raddoppia ma resta sotto la soglia di 25 al mese
        self.assertEqual(y["flat"].loc[ts[23]], 0.0)
        self.assertTrue(np.isnan(y["big"].iloc[-1]))          # l'esito dei tre mesi dopo non e' ancora noto
        self.assertTrue(np.isnan(y["big"].iloc[0]))           # senza dodici mesi di serie il riferimento non esiste

    def test_persistence_is_an_increasing_map_of_the_ratio(self):
        df = pd.DataFrame({"r_u3_12": [0.5, 1.0, 2.0, 5.0], "r_v3_12": [5.0, 2.0, 1.0, 0.5]})
        p = U.persistence_score(df, "wave")
        self.assertTrue(p.is_monotonic_increasing)
        self.assertTrue(((p > 0) & (p < 1)).all())


if __name__ == "__main__":
    unittest.main()
