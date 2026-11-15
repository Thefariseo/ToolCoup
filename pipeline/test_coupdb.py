"""Rules of the coup database: what can found an event, what can only confirm one, and what counts as confirmed.

Run: python -m unittest discover -s pipeline -p 'test_*.py'
"""
import unittest

import build_coupdb as B


def member(src, outcome, label="", y=2020, m=3, d=5, cc=2):
    return B.rec(src, f"{src}:{label}"[:40], cc, y, m, d, outcome, label)


def consolidate(*members):
    cluster = {"lo": members[0]["lo"], "hi": members[0]["hi"], "members": list(members), "srcs": {x["src"] for x in members}, "ambiguous": False}
    return B.consolidate([cluster])


class CoupDbRules(unittest.TestCase):
    def test_a_regime_end_coded_by_vdem_alone_is_not_an_event(self):
        ev, _, excluded = consolidate(member("hrd", "success", "autogolpe: fine di Post nineteenth amendment", y=1964, m=7, d=2))
        self.assertEqual(len(ev), 0)
        self.assertEqual(len(excluded), 1)
        self.assertIn("V-Dem HRD", excluded.iloc[0]["reason"])

    def test_vdem_and_pipe_together_are_a_year_level_record_not_a_confirmed_coup(self):
        ev, _, _ = consolidate(member("hrd", "success", "golpe militare: x", y=1903, m=7, d=15), member("pipe", "success", "", y=1903, m=None, d=None))
        self.assertEqual(ev.iloc[0]["confidence"], "C")

    def test_powell_and_thyne_alone_is_confirmed(self):
        ev, _, _ = consolidate(member("pt", "failed"))
        self.assertEqual(ev.iloc[0]["confidence"], "A")

    def test_a_wikipedia_line_that_calls_it_a_coup_is_confirmed(self):
        ev, _, _ = consolidate(member("wikipedia", "failed", "January 14, 2024: attempted coup crushed by military."))
        self.assertEqual(ev.iloc[0]["confidence"], "A")
        self.assertEqual(ev.iloc[0]["type"], "fallito")

    def test_a_single_wikipedia_line_that_does_not_call_it_a_coup_is_not(self):
        ev, _, _ = consolidate(member("wikipedia", "success", "2026 Mali offensives"))
        self.assertEqual(ev.iloc[0]["confidence"], "D")

    def test_wikidata_needs_a_second_source(self):
        alone, _, _ = consolidate(member("wikidata", "failed", "Scythian coup d'etat attempt in Hungary"))
        both, _, _ = consolidate(member("wikidata", "failed", "2022 Gambian coup d'etat attempt"), member("wikipedia_fr", "failed", "tentative de coup d'Etat", y=2022))
        self.assertEqual(alone.iloc[0]["confidence"], "D")
        self.assertEqual(both.iloc[0]["confidence"], "A")

    def test_event_level_sources_decide_the_outcome_not_vdem(self):
        ev, _, _ = consolidate(member("hrd", "success", "golpe non militare: x", y=2025, m=5, d=14), member("wikipedia", "failed", "2025 Malian coup attempt", y=2025, m=5, d=14))
        self.assertEqual(ev.iloc[0]["type"], "fallito")

    def test_a_local_event_is_not_a_national_coup(self):
        ev, _, _ = consolidate(member("wikipedia", "success", "Lieutenant Governor of Louisiana had himself sworn in as Governor in a coup", y=1931, m=10, d=14))
        self.assertEqual(ev.iloc[0]["scope"], "subnational")
        self.assertEqual(ev.iloc[0]["confidence"], "D")

    def test_a_plot_stays_a_plot(self):
        ev, _, _ = consolidate(member("wikipedia", "plot", "October 2025: officers arrested on charges of organising a coup"))
        self.assertEqual(ev.iloc[0]["type"], "complotto")

    def test_outcome_parser_reads_charges_as_a_plot(self):
        self.assertEqual(B.wiki_outcome("30 people arrested on charges of plotting a coup"), "plot")


if __name__ == "__main__":
    unittest.main()
