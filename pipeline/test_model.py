"""Regression checks for chronological isolation, missingness and diagnostics.

Run: python -m unittest discover -s pipeline -p 'test_*.py'
"""
import unittest
import numpy as np
import pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
import model as M


class ForecastTests(unittest.TestCase):
    def sample(self):
        rng = np.random.default_rng(12)
        t = np.repeat(np.arange(1975 * 12, 2005 * 12), 4)
        y = rng.binomial(1, .12, len(t))
        panel = pd.DataFrame({"t": t, "year": t // 12, "unit": np.tile(np.arange(4), len(t) // 4),
                              "y": y, "y_known": t + 6 <= t.max()})
        pred = pd.DataFrame({k: rng.uniform(.02, .3, len(t)) for k in M.ENSEMBLE})
        return panel, pred

    def test_future_labels_do_not_change_past_calibration_or_weights(self):
        panel, preds = self.sample()
        changed = panel.copy()
        changed.loc[changed.t >= 2000 * 12, "y"] = 1 - changed.loc[changed.t >= 2000 * 12, "y"]
        a, _, _ = M.combine_forward(panel, preds, 6)
        b, _, _ = M.combine_forward(changed, preds, 6)
        np.testing.assert_allclose(a[panel.year <= 2000], b[panel.year <= 2000])
        a, _ = M.calibrate_forward(panel, M.combine(preds, M.ENSEMBLE), 6)
        b, _ = M.calibrate_forward(changed, M.combine(preds, M.ENSEMBLE), 6)
        np.testing.assert_allclose(a[panel.year <= 2000], b[panel.year <= 2000])

    def test_walk_forward_purges_overlapping_targets(self):
        panel, _ = self.sample()
        panel["feature"] = panel.t
        class Spy:
            def fit(self, x, y):
                self.last = x.feature.max()
                return self
            def predict_proba(self, x):
                assert self.last + 6 < int(x.feature.min()) // 12 * 12
                return np.tile([.9, .1], (len(x), 1))
        out = M.walk_forward(panel, 6, {"spy": (Spy, ["feature"])}, log=lambda _: None)
        self.assertGreater(out.spy.notna().sum(), 0)

    def test_empty_and_one_class_calibration_preserve_probabilities(self):
        panel, pred = self.sample()
        panel.y = 0
        raw = M.combine(pred, M.ENSEMBLE)
        result, cal = M.calibrate_forward(panel, raw, 6)
        np.testing.assert_allclose(result, raw)
        self.assertEqual(cal, (1., 0.))
        result, cal = M.calibrate_forward(panel, raw * np.nan, 6)
        self.assertTrue(result.isna().all())
        self.assertEqual(cal, (1., 0.))

    def test_uniform_ties_have_expected_top_decile_recall(self):
        y = np.tile([1, 0, 0, 0, 0, 0, 0, 0, 0, 0], 10)
        result = M.score(y, np.full(100, .1), np.repeat(np.arange(10), 10))
        self.assertEqual(result["top10_recall"], .1)
        self.assertEqual(result["top10_lift"], 1.)

    def test_signature_detects_values_targets_order_and_parameters(self):
        panel, _ = self.sample()
        panel["feature"] = np.arange(len(panel), dtype=float)
        specs = {"logit": (M.make_logit, ["feature"])}
        a = M.validation_signature(panel, 6, specs)
        changed = panel.copy()
        changed.loc[[0, 1], "feature"] = [1, 0]  # same sum, different observations
        self.assertNotEqual(a, M.validation_signature(changed, 6, specs))
        self.assertNotEqual(a, M.validation_signature(panel, 12, specs))
        self.assertNotEqual(a, M.validation_signature(panel.iloc[::-1], 6, specs))

    def test_explanations_align_when_imputer_drops_empty_column(self):
        frame = pd.DataFrame({"e_growth": [np.nan] * 20, "h_att_12m": np.arange(20)})
        pipe = make_pipeline(SimpleImputer(strategy="median", add_indicator=True), StandardScaler(), LogisticRegression())
        pipe.fit(frame, np.tile([0, 1], 10))
        models = {"logit": (pipe, list(frame))}
        explanation = M.explain(models, frame.iloc[:1])[0]
        contribution = sum(g["contrib"] for g in explanation["groups"])
        expected = pipe.decision_function(frame.iloc[:1])[0] - pipe[-1].intercept_[0]
        self.assertAlmostEqual(contribution, expected, places=2)
        self.assertEqual(M.coefficient_table(models)[0]["label"], "Tentativi negli ultimi 12 mesi")

    def test_sparse_weights_fall_back_to_equal(self):
        np.testing.assert_allclose(M.fit_weights([0, 1], [[.1, .2, .3], [.3, .4, .5]]), [1/3] * 3)

    def test_base_rate_uses_only_matured_past(self):
        panel, _ = self.sample()
        baseline = M.base_rate_forward(panel, 6)
        mask = panel.y_known & (panel.t + 6 < 2000 * 12)
        self.assertAlmostEqual(baseline[panel.year.eq(2000)].iloc[0], panel.loc[mask, "y"].mean())

    def test_published_ensemble_and_acled_reference_have_matching_members(self):
        self.assertEqual(len(M.ENSEMBLE), len(M.ENSEMBLE_NOACLED))
        self.assertTrue(set(M.ENSEMBLE_THREE) < set(M.ENSEMBLE))
        for name in M.ENSEMBLE + M.ENSEMBLE_NOACLED + M.ENSEMBLE_THREE:
            self.assertIn(name, M.SPECS)

    def test_lightgbm_does_not_depend_on_thread_count(self):
        rng = np.random.default_rng(3)
        x = pd.DataFrame(rng.normal(size=(800, 6)), columns=list("abcdef"))
        x.iloc[::7, 2] = np.nan
        y = rng.binomial(1, .1, len(x))
        one = M.make_lgbm().set_params(n_jobs=1).fit(x, y).predict_proba(x)[:, 1]
        many = M.make_lgbm().set_params(n_jobs=4).fit(x, y).predict_proba(x)[:, 1]
        np.testing.assert_allclose(one, many, rtol=0, atol=1e-12)


if __name__ == "__main__":
    unittest.main()
