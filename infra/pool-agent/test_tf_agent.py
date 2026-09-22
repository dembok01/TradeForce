"""Connection checks of the pool agent: what gets reported and logged when.

Needs the agent's own dependencies (requests, cryptography), so it runs on the
pool server and skips elsewhere:

    python3 -m unittest discover -s infra/pool-agent -v
"""
import base64
import os
import shutil
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ.setdefault("SUPABASE_URL", "https://example.invalid")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")
os.environ.setdefault("MT5_CRED_KEY", base64.b64encode(b"k" * 32).decode())

try:
    import tf_agent as a
except ImportError as e:  # requests / cryptography not installed here
    a = None
    SKIP = str(e)

ACC = "00000000-0000-4000-8000-00000000c0de"
NAME = "tf-" + ACC

SIGNED_IN = [
    "0\t1\t06:48:01.132\tNetwork\t'53168878': authorized on Alpari-MT5-Demo",
    "0\t1\t06:48:04.075\tNetwork\t'53168878': trading has been enabled, demo account - hedging mode",
    "0\t1\t06:48:50.209\tExperts\texpert TradeForce (TFCHART,M1) loaded successfully",
]
EA_FAILED = [
    "0\t1\t06:48:50.209\tExperts\texpert TradeForce (EURUSD,M1) loaded successfully",
    "0\t1\t06:53:58.295\tExperts\tinitializing of TradeForce (EURUSD,M1) failed with code 0 (symbol synchronization timeout)",
    "0\t1\t06:53:58.303\tExperts\texpert TradeForce (EURUSD,M1) removed",
]


@unittest.skipIf(a is None, "agent dependencies not installed")
class CheckOneTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.logs = Path(self.tmp, ACC, *a.tf_bridge.LOGIN_LOGS)
        self.logs.mkdir(parents=True)
        self.reports, self.events = [], []
        self.saved = (a.DATA, a.report, a.event, a.uptime_seconds)
        a.DATA = self.tmp
        a.report = lambda acc, **f: self.reports.append(f)
        a.event = lambda acc, kind, level, message, detail=None: self.events.append((kind, level, message, detail))
        a.uptime_seconds = lambda name: 3600
        a._said.clear(); a._login_reported.clear(); a._rows.clear()
        a._quiet = False

    def tearDown(self):
        a.DATA, a.report, a.event, a.uptime_seconds = self.saved
        shutil.rmtree(self.tmp)

    def journal(self, *lines):
        (self.logs / "20260922.log").write_bytes("\n".join(lines).encode("utf-16-le"))

    def kinds(self):
        return [e[0] for e in self.events]

    def test_the_ea_that_never_started_is_an_error_logged_once(self):
        self.journal(*SIGNED_IN[:2], *EA_FAILED)
        a.check_one(ACC, NAME)
        a.check_one(ACC, NAME)
        self.assertEqual(self.kinds(), ["signed_in", "ea_failed"])
        kind, level, message, detail = self.events[1]
        self.assertEqual(level, "error")
        self.assertIn("symbol synchronization timeout", message)
        self.assertTrue(any("failed with code 0" in line for line in detail["journal"]))
        self.assertEqual(self.reports[-1]["status"], "error")
        self.assertIn("don't need to do anything", self.reports[-1]["status_detail"])

    def test_a_refused_sign_in_carries_the_reason_and_evidence(self):
        self.journal("0\t1\t09:00:00.000\tNetwork\t'123': authorization on Alpari-MT5 failed (Invalid account)")
        a.check_one(ACC, NAME)
        (kind, level, message, detail), = self.events
        self.assertEqual((kind, level, detail["reason"]), ("login_refused", "warn", "Invalid account"))
        self.assertEqual(self.reports[-1]["status"], "login_failed")

    def test_an_investor_login_is_caught_before_the_ea_matters(self):
        self.journal(SIGNED_IN[0], "0\t1\t09:00:01.000\tNetwork\t'1': trading has been disabled - investor mode")
        a.check_one(ACC, NAME)
        self.assertEqual(self.kinds(), ["signed_in", "read_only"])
        self.assertEqual(self.reports[-1]["status"], "login_failed")

    def test_no_answer_is_reported_after_the_patience_window(self):
        self.journal("0\t1\t09:00:05.000\tNetwork\t'1': no connection to x.invalid:443")
        a.uptime_seconds = lambda name: a.LOGIN_PATIENCE - 1
        a.check_one(ACC, NAME)
        self.assertEqual(self.events, [])
        a.uptime_seconds = lambda name: a.LOGIN_PATIENCE + 1
        a.check_one(ACC, NAME)
        self.assertEqual(self.kinds(), ["no_answer"])
        self.assertIn("no connection to x.invalid", self.events[0][2])

    def test_protection_active_quiet_and_resumed(self):
        self.journal(*SIGNED_IN)
        now = datetime.now(timezone.utc)
        a._rows[ACC] = {"ea_reported_at": (now - timedelta(seconds=30)).isoformat(), "status": "running"}
        a.check_one(ACC, NAME)
        a._rows[ACC]["ea_reported_at"] = (now - timedelta(minutes=10)).isoformat()
        a.check_one(ACC, NAME)
        a._rows[ACC]["ea_reported_at"] = (now - timedelta(seconds=5)).isoformat()
        a.check_one(ACC, NAME)
        self.assertEqual(self.kinds(), ["signed_in", "protected", "quiet", "resumed"])

    def test_reports_from_before_a_restart_do_not_count(self):
        self.journal(*SIGNED_IN)
        a.uptime_seconds = lambda name: 30  # container restarted 30s ago
        a._rows[ACC] = {"ea_reported_at": (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()}
        a.check_one(ACC, NAME)
        self.assertEqual(self.kinds(), ["signed_in"])

    def test_after_an_agent_restart_current_states_are_learned_not_relogged(self):
        self.journal(*SIGNED_IN[:2], *EA_FAILED)
        a._quiet = True
        a.check_one(ACC, NAME)
        a._quiet = False
        a.check_one(ACC, NAME)
        self.assertEqual(self.events, [])
        self.assertEqual(self.reports[-1]["status"], "error")  # status still corrected

    def test_a_recovered_ea_clears_the_error_status(self):
        self.journal(*SIGNED_IN)
        a._rows[ACC] = {"ea_reported_at": datetime.now(timezone.utc).isoformat(), "status": "error"}
        a.check_one(ACC, NAME)
        self.assertEqual(self.reports[-1]["status"], "running")


if __name__ == "__main__":
    unittest.main()
