"""Tests for turning what a trader said into something MetaQuotes recognises.

These need no Wine, no container and no network: the part that decides what to
type is pure, and it is the part that decides whether a broker is ever found.
"""

import os
import tempfile
import unittest

import tf_search as s


class AliasTest(unittest.TestCase):
    def test_reads_the_broker_out_of_a_server_name(self):
        # The real case: a trader said "HFM", which finds nothing, but their
        # server name carries the name the directory would file them under.
        got = s.aliases("HFM", "HFMarketsGlobal-Demo 4")
        self.assertIn("HFMarketsGlobal", got)
        self.assertIn("HF Markets Global", got)
        self.assertIn("HF Markets", got)
        self.assertEqual(got[0], "HFM", "what the admin typed is still tried first")

    def test_splits_the_run_together_names_brokers_use(self):
        self.assertIn("IC Markets", s.aliases(None, "ICMarketsSC-Demo"))
        self.assertIn("IC Markets SC", s.aliases(None, "ICMarketsSC-Demo"))

    def test_strips_the_demo_live_suffix_however_it_is_written(self):
        for name, stem in [
            ("Pepperstone-Demo", "Pepperstone"),
            ("Tickmill-Live", "Tickmill"),
            ("Alpari-MT5-Demo", "Alpari"),
            ("FundedNext_Real", "FundedNext"),
            ("Blueberry Demo", "Blueberry"),
        ]:
            self.assertIn(stem, s.aliases(None, name), name)

    def test_never_offers_a_name_too_short_to_mean_anything(self):
        # "IC" or "HF" alone would match half a broker directory.
        for a in s.aliases("HF", "HFMarketsGlobal-Demo 4"):
            self.assertGreaterEqual(len(a), 3, a)

    def test_says_each_name_once(self):
        got = s.aliases("Pepperstone", "Pepperstone-Demo")
        self.assertEqual(len(got), len(set(x.lower() for x in got)))

    def test_copes_with_nothing_useful(self):
        self.assertEqual(s.aliases(None, None), [])
        self.assertEqual(s.aliases("", ""), [])
        self.assertEqual(s.aliases(None, "-Demo"), [])

    def test_keeps_the_list_short_enough_to_be_worth_running(self):
        # Each alias is a round trip to MetaQuotes inside a live terminal.
        self.assertLessEqual(len(s.aliases("HFM", "HFMarketsGlobal-Demo 4")), 8)


class AliasReplyTest(unittest.TestCase):
    def test_takes_names_out_of_a_chatty_answer(self):
        got = s.parse_alias_reply(
            "Here are the likely names:\n"
            "1. HF Markets Ltd\n"
            "- HFM Investments\n"
            "* HotForex\n"
        )
        self.assertIn("HF Markets Ltd", got)
        self.assertIn("HFM Investments", got)
        self.assertIn("HotForex", got)

    def test_drops_a_heading_that_ends_in_a_colon(self):
        self.assertNotIn("Likely names:", s.parse_alias_reply("Likely names:\nHF Markets"))

    def test_caps_what_a_model_can_make_us_do(self):
        many = "\n".join(f"Broker Number {i}" for i in range(50))
        self.assertLessEqual(len(s.parse_alias_reply(many)), 6)


class DigestTest(unittest.TestCase):
    def test_absent_file_is_not_an_error(self):
        self.assertIsNone(s.digest("/nope/servers.dat"))

    def test_notices_the_file_changing(self):
        # This is how a search is judged to have found something, so it has to
        # catch a rewrite that leaves the size identical.
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "servers.dat")
            with open(p, "wb") as f:
                f.write(b"aaaa")
            before = s.digest(p)
            with open(p, "wb") as f:
                f.write(b"bbbb")
            self.assertNotEqual(before, s.digest(p))


if __name__ == "__main__":
    unittest.main()
