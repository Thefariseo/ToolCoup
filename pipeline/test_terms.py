"""Struttura a termine: bersagli per scadenza, curva cumulativa, mappa coerente con il lato JavaScript.

Run: python -m unittest discover -s pipeline -p 'test_*.py'
"""
import unittest
import numpy as np
import pandas as pd
import terms as T


class TermTests(unittest.TestCase):
    def test_horizon_targets_look_forward_only_and_leave_unknown_as_nan(self):
        onset = np.zeros(12); onset[4] = 1                       # un tentativo al mese indice 4
        panel = pd.DataFrame({"unit": 1, "t": np.arange(12), "onset": onset})
        y = T.horizon_targets(panel, grid=[1, 3, 6])
        self.assertEqual(list(y[3][:4]), [0, 1, 1, 1])             # t=1,2,3 vedono il mese 4 entro 3 mesi; t=0 no
        self.assertEqual(y[3][4], 0)                               # dal mese stesso non conta: si guarda a t+1..t+h
        self.assertTrue(np.isnan(y[6][6:]).all() and not np.isnan(y[6][:6]).any())
        self.assertEqual(y[1][3], 1)

    def test_constant_hazard_is_identity_at_six_months_and_compounds(self):
        self.assertAlmostEqual(float(T.constant_hazard(0.1, 6)), 0.1)
        self.assertAlmostEqual(float(T.constant_hazard(0.1, 12)), 0.19)

    def test_curve_matches_the_javascript_vectors(self):
        terms = {"grid": [1, 2, 3, 4, 6, 9, 12, 18, 24], "long": {"12": {"a": -0.1, "b": 0.9}, "24": {"a": -0.4, "b": 0.85}}}
        c = dict(T.curve(0.1, terms))
        for h, v in {1: 0.017407, 3: 0.051317, 6: 0.1, 9: 0.146185, 12: 0.146185}.items():
            self.assertAlmostEqual(c[h], v, places=6)
        f = [v for _, v in T.curve(0.3, terms)]
        self.assertTrue(all(b >= a for a, b in zip(f, f[1:])))

    def test_fit_map_needs_enough_events(self):
        rng = np.random.default_rng(0)
        p = rng.uniform(.01, .3, 2000)
        self.assertIsNone(T.fit_map(p[:100], (rng.random(100) < p[:100]).astype(float)))
        y = (rng.random(2000) < p).astype(float)
        m = T.fit_map(p, y)
        self.assertAlmostEqual(m["b"], 1.0, delta=0.25)           # probabilita' gia' calibrate: la mappa e' vicina all'identita'
        self.assertAlmostEqual(m["a"], 0.0, delta=0.25)

    def test_oos_evaluation_uses_only_the_past(self):
        rng = np.random.default_rng(1)
        t = np.arange(1980 * 12, 2012 * 12)
        panel = pd.DataFrame({"unit": np.repeat(np.arange(8), len(t)), "t": np.tile(t, 8)})
        panel["year"] = panel.t // 12
        p6 = rng.uniform(.01, .2, len(panel))
        y = (rng.random(len(panel)) < T.constant_hazard(p6, 12)).astype(float)
        targets = {12: y}
        flipped = {12: np.where(panel.t >= 2005 * 12, 1 - y, y)}
        a = T.oos_evaluation(panel, p6, targets, horizons=[12], first=1995, reps=5)["12"]
        b = T.oos_evaluation(panel, p6, flipped, horizons=[12], first=1995, reps=5)["12"]
        self.assertEqual(a["n"], b["n"])
        self.assertNotEqual(a["brier_mapped"], b["brier_mapped"])   # le etichette cambiate dal 2005 alterano solo i punteggi del 2005 in poi


if __name__ == "__main__":
    unittest.main()
