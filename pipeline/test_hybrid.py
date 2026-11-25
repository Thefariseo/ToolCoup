"""Lo strato ibrido: pesi a esponenti, esclusione degli eventi anteriori all'istantanea, punteggi.

Run: python -m unittest discover -s pipeline -p 'test_*.py'
"""
import unittest
import hybrid_score as H


def country(slug, model, market=None, analyst=None, pooled=None):
    return {"slug": slug, "name": slug, "model": {"p": model}, "market": market and {"p6": market}, "analyst": analyst and {"calibrated": analyst},
            "pooled": pooled and {"p": pooled}}


class HybridTests(unittest.TestCase):
    def test_a_source_that_loses_more_than_the_others_loses_weight_and_a_missing_one_is_not_punished(self):
        obs = [(0, {"model": H.log_loss(0.05, 0), "analyst": H.log_loss(0.6, 0)})] * 20
        w = H.hedge_weights(obs)
        self.assertEqual(w["model"], 0.0)
        self.assertLess(w["analyst"], 0)
        self.assertEqual(w["market"], 0.0)                                 # mai presente: resta al prior

    def test_weights_are_capped_and_old_observations_count_less(self):
        obs = [(0, {"model": 0.01, "analyst": 5.0})] * 500
        self.assertEqual(H.hedge_weights(obs)["analyst"], -H.CAP)
        recent = H.hedge_weights([(0, {"model": 0.1, "market": 1.0})])["market"]
        old = H.hedge_weights([(8, {"model": 0.1, "market": 1.0})])["market"]
        self.assertLess(recent, old)
        self.assertEqual(H.hedge_weights([]), {"model": 0.0, "market": 0.0, "analyst": 0.0})
        self.assertEqual(H.hedge_weights([(0, {"model": 1.0})])["model"], 0.0)       # una sola fonte: nessun confronto

    def test_an_event_dated_before_the_snapshot_removes_the_country_from_scoring(self):
        doc = {"asof": "2026-11-16T10:00:00Z", "countries": [country("a", .02, analyst=.03), country("b", .02, analyst=.03), country("c", .02)]}
        reg = {"events": [{"slug": "a", "date": "2026-11-03", "counted": True}, {"slug": "b", "date": "2026-12-20", "counted": True},
                          {"slug": "c", "date": "2027-01", "counted": False}]}
        hits, excluded = H.settle(doc, reg)
        self.assertEqual(hits, {"b"})
        self.assertEqual(excluded, {"a"})
        s = H.score_issue(doc, reg)
        self.assertEqual(s["sources"]["model"]["n"], 2)                    # a e' fuori
        self.assertEqual(s["sources"]["model"]["events"], 1)
        self.assertEqual(s["sources"]["analyst"]["n"], 1)                   # a e' fuori e c non ha l'analista

    def test_scores_compare_each_source_with_the_model_on_the_same_countries(self):
        doc = {"asof": "2026-11-16", "countries": [country("a", .1, market=.4, pooled=.2), country("b", .1, market=.02, pooled=.05)]}
        reg = {"events": [{"slug": "a", "date": "2026-12-01", "counted": True}]}
        s = H.score_issue(doc, reg)["sources"]
        self.assertGreater(s["market"]["better_than_model"], 0)           # il mercato ha avuto ragione dove c'e' stato un evento e meno torto altrove
        self.assertEqual(s["pooled"]["n"], 2)
        self.assertLess(s["pooled"]["brier"], s["pooled"]["model_brier"])

    def test_integrity_check_finds_edited_and_unindexed_files(self):
        import json, tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            led = Path(d); (led / "2026-11.json").write_text("{}")
            H.LEDGER, H.INDEX = led, led / "index.json"
            H.INDEX.write_text(json.dumps([{"issue": "2026-11", "sha256": H.sha(led / "2026-11.json")}]))
            self.assertEqual(H.check(), [])
            (led / "2026-11.json").write_text('{"x":1}')
            self.assertEqual(H.check(), ["2026-11"])
            (led / "2026-12.json").write_text("{}")
            self.assertEqual(H.check(), ["2026-11", "2026-12"])


if __name__ == "__main__":
    unittest.main()
