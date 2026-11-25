"""Punteggio con intervalli del modello della violenza: regole di base.

Run: python -m unittest discover -s pipeline -p 'test_*.py'
"""
import unittest
import numpy as np
import cast


class WisTests(unittest.TestCase):
    def qs(self, lo, hi):
        return {a: np.tile([lo, hi], (len(cast._EDGES) + 1, 1)) for a in cast.WIS_ALPHAS}

    def test_exact_median_and_zero_width_intervals_score_zero(self):
        y = np.array([5.0, 12.0, 40.0])
        w = cast.weighted_interval_score(y, y.copy(), self.qs(0.0, 0.0))
        np.testing.assert_allclose(w, 0.0)

    def test_a_miss_costs_more_than_a_hit_and_wider_intervals_cost_width(self):
        mid, y = np.array([20.0]), np.array([20.0])
        narrow = cast.weighted_interval_score(y, mid, self.qs(-0.2, 0.2))[0]
        wide = cast.weighted_interval_score(y, mid, self.qs(-1.0, 1.0))[0]
        self.assertGreater(wide, narrow)
        miss = cast.weighted_interval_score(np.array([80.0]), mid, self.qs(-0.2, 0.2))[0]
        self.assertGreater(miss, narrow)

    def test_leave_one_origin_out_ignores_the_origin_being_scored(self):
        rng = np.random.default_rng(0)
        vecs = [rng.uniform(5, 50, 200) for _ in range(6)]
        truths = [v + rng.normal(0, 3, 200) for v in vecs]
        keeps = [np.ones(200, bool) for _ in vecs]
        base = cast.wis_by_origin({"x": vecs}, truths, keeps)["x"]
        scrambled = [t.copy() for t in truths]
        scrambled[0] = truths[0] * 3                       # un'origine con esiti molto diversi: cambia il punteggio medio ma...
        changed = cast.wis_by_origin({"x": vecs}, scrambled, keeps)["x"]
        self.assertNotEqual(base, changed)
        # ...e i suoi quantili non entrano nel proprio punteggio: con un'altra origine identica il punteggio dell'origine 1 non dipende da se stessa
        one = cast._residual_quantiles([vecs[i] for i in range(1, 6)], [truths[i] for i in range(1, 6)], 0.2)
        again = cast._residual_quantiles([vecs[i] for i in range(1, 6)], [scrambled[i] for i in range(1, 6)], 0.2)
        np.testing.assert_allclose(one, again)


if __name__ == "__main__":
    unittest.main()
