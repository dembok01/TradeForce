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
        self.restarts = []
        self.saved = (a.DATA, a.report, a.event, a.uptime_seconds, a.mt5_running, a.sh)
        a.DATA = self.tmp
        a.report = lambda acc, **f: self.reports.append(f)
        a.event = lambda acc, kind, level, message, detail=None: self.events.append((kind, level, message, detail))
        a.uptime_seconds = lambda name: 3600
        a.mt5_running = lambda name: True
        a.sh = lambda *args: self.restarts.append(args) or ""
        a._said.clear(); a._login_reported.clear(); a._rows.clear()
        a._missing.clear(); a._restarted.clear()
        a._quiet = False

    def tearDown(self):
        a.DATA, a.report, a.event, a.uptime_seconds, a.mt5_running, a.sh = self.saved
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


@unittest.skipIf(a is None, "agent dependencies not installed")
class LockAndWatchdogTest(CheckOneTest):
    LOCKED = [
        "0\t1\t05:09:15.134\tExperts\tTradeForce (TFCHART,M1) calls TerminalClose(0) function",
        "0\t1\t05:09:17.369\tExperts\texpert TradeForce (TFCHART,M1) removed",
    ]

    def test_a_terminal_the_ea_closed_after_a_loss_is_locked_not_broken(self):
        self.journal(*SIGNED_IN[:2], *self.LOCKED)
        a.check_one(ACC, NAME)
        self.assertEqual(self.kinds(), ["signed_in", "day_locked"])
        self.assertEqual(self.reports[-1]["status"], "running")
        self.assertIn("Locked for the day", self.reports[-1]["status_detail"])

    def test_a_dead_metatrader_is_restarted_on_the_second_miss(self):
        self.journal(*SIGNED_IN)
        a.mt5_running = lambda name: False
        a.check_one(ACC, NAME)  # first miss: leave it alone
        self.assertEqual(self.restarts, [])
        a.check_one(ACC, NAME)  # second miss in a row: restart
        self.assertEqual(self.restarts, [("docker", "restart", "-t", "30", NAME)])
        self.assertEqual(self.kinds()[-1], "terminal_restarted")

    def test_a_reporting_terminal_is_never_restarted(self):
        self.journal(*SIGNED_IN)
        a.mt5_running = lambda name: False  # process check can be wrong; reports cannot
        a._rows[ACC] = {"ea_reported_at": datetime.now(timezone.utc).isoformat(), "status": "running"}
        a.check_one(ACC, NAME)
        a.check_one(ACC, NAME)
        self.assertEqual(self.restarts, [])

    def test_the_cooldown_stops_a_restart_loop(self):
        self.journal(*SIGNED_IN)
        a.mt5_running = lambda name: False
        for _ in range(6):
            a.check_one(ACC, NAME)
        self.assertEqual(len(self.restarts), 1)


@unittest.skipIf(a is None, "agent dependencies not installed")
class CanClaimTest(unittest.TestCase):
    """A box runs out of scheduling headroom before it runs out of cores, and
    load average cannot see it: Wine's thread churn reads as load 14 on a box
    that is 70% idle. Pressure can - it counts starvation, not waiting."""

    # "full" stays 0.00 on this workload even at 40 terminals, so the gate has
    # to read "some" - a test that accepted the full line would pass forever.
    PSI = ("some avg10=25.61 avg60=23.14 avg300=22.00 total=65131150101\n"
           "full avg10=0.00 avg60=0.00 avg300=0.00 total=0\n")

    def test_room_by_count_and_by_starvation(self):
        self.assertTrue(a.can_claim(running=5, capacity=30, stalled=25.0))    # 40 terminals' worth
        self.assertFalse(a.can_claim(running=30, capacity=30, stalled=0.0))   # full
        self.assertFalse(a.can_claim(running=5, capacity=30, stalled=85.0))   # contended
        self.assertTrue(a.can_claim(running=5, capacity=30, stalled=70.0))    # exactly at the ceiling

    def test_a_busy_looking_box_that_is_not_contended_still_takes_work(self):
        # Ten healthy terminals: load 14.53 of 12 cores, pressure under 10%. The
        # load ceiling this replaced would have queued every one of them.
        self.assertTrue(a.can_claim(running=10, capacity=30, stalled=9.6))

    def test_pressure_is_read_from_the_some_line_because_full_never_moves(self):
        with tempfile.NamedTemporaryFile("w", suffix=".psi", delete=False) as f:
            f.write(self.PSI)
        self.addCleanup(os.unlink, f.name)
        self.assertEqual(a.cpu_stalled_pct(f.name), 23.14)

    def test_a_kernel_without_psi_leaves_count_as_the_only_brake(self):
        self.assertEqual(a.cpu_stalled_pct("/nonexistent/pressure/cpu"), 0.0)
        self.assertTrue(a.can_claim(running=5, capacity=16,
                                    stalled=a.cpu_stalled_pct("/nonexistent/pressure/cpu")))

    def test_a_stricter_ceiling_can_be_configured(self):
        self.assertFalse(a.can_claim(running=1, capacity=30, stalled=20.0, ceiling=10.0))


@unittest.skipIf(a is None, "agent dependencies not installed")
class NtsyncArgsTest(unittest.TestCase):
    """A terminal only gets the fast sync path if the device is handed in."""

    def test_passed_through_when_the_box_has_the_driver(self):
        self.assertEqual(a.ntsync_args(__file__), ["--device", __file__])

    def test_absent_driver_is_not_an_error(self):
        self.assertEqual(a.ntsync_args("/dev/no-such-ntsync"), [])


@unittest.skipIf(a is None, "agent dependencies not installed")
class StaleContainerTest(unittest.TestCase):
    """What makes a working terminal worth replacing."""

    def test_a_current_terminal_is_left_alone(self):
        self.assertIsNone(a.stale_container("k1", "k1", "tf-mt5:current", "tf-mt5:current"))

    def test_a_new_ea_key_means_new_details(self):
        self.assertEqual(a.stale_container("k1", "k2", "tf-mt5:current", "tf-mt5:current"),
                         "new details")

    def test_an_older_image_is_rebuilt_so_upgrades_reach_traders(self):
        why = a.stale_container("k1", "k1", "tf-mt5:current", "tf-mt5:ntsync")
        self.assertEqual(why, "older build (tf-mt5:current)")

    def test_nothing_known_about_a_container_that_is_not_running(self):
        self.assertIsNone(a.stale_container(None, "k1", None, "tf-mt5:ntsync"))


@unittest.skipIf(a is None, "agent dependencies not installed")
class StarvationNoticeTest(unittest.TestCase):
    """The claim gate cannot help traders who are already here, so a starved box
    has to say so - a late EA still reports, just later."""

    def setUp(self):
        a._starved = False

    def test_silent_while_there_is_room(self):
        self.assertIsNone(a.note_starvation(25.0, 40, ceiling=70.0))

    def test_warns_once_on_the_way_in(self):
        first = a.note_starvation(90.0, 30, ceiling=70.0)
        self.assertIn("cpu starved 90.0%", first)
        self.assertIn("30 terminals", first)
        self.assertIsNone(a.note_starvation(95.0, 30, ceiling=70.0))

    def test_says_when_it_clears(self):
        a.note_starvation(90.0, 30, ceiling=70.0)
        self.assertIn("no longer starved", a.note_starvation(30.0, 30, ceiling=70.0))
        self.assertIsNone(a.note_starvation(25.0, 30, ceiling=70.0))


@unittest.skipIf(a is None, "agent dependencies not installed")
class BuildDriftTest(unittest.TestCase):
    """MetaTrader updates itself from the broker's server, so the build is the
    broker's choice - measured on this box, MetaQuotes-Demo terminals took 6215
    while Alpari's took 6230. It cannot be pinned, so it has to be visible."""

    def test_a_terminal_on_the_shared_copy_is_quiet(self):
        self.assertIsNone(a.build_drift(None, 121728584))

    def test_an_identical_size_is_not_drift(self):
        self.assertIsNone(a.build_drift(121728584, 121728584))

    def test_a_broker_pushed_build_is_named_with_both_sizes(self):
        got = a.build_drift(121825224, 121728584)
        self.assertIn("121825224", got)
        self.assertIn("121728584", got)

    def test_a_missing_shared_copy_is_not_reported_as_drift(self):
        self.assertIsNone(a.build_drift(121825224, None))

    def test_own_build_is_none_until_the_account_writes_one(self):
        self.assertIsNone(a.own_build("no-such-account", data=tempfile.mkdtemp()))


@unittest.skipIf(a is None, "agent dependencies not installed")
class ProbeVerdictTest(unittest.TestCase):
    """Reading a candidate broker address from MetaTrader's own journal.

    Every line below was produced by a real probe on the pool box, not invented:
    a refusal is the GOOD outcome, because only a real MT5 server can refuse a
    login, and an address that merely answers on TCP 443 never gets that far.
    """

    def entry(self, message):
        return ("09:00:00.000", "Network", message)

    def test_a_refused_login_proves_a_real_server(self):
        got = a.classify_probe([self.entry(
            "'50000000': authorization on mt5-demo.icmarkets.com:443 failed (Invalid account)")])
        self.assertEqual(got[0], "reached")
        self.assertIn("Invalid account", got[1])

    def test_a_server_name_that_resolves_counts_too(self):
        # Exness and MetaQuotes are reached by name through the seeded servers.dat.
        got = a.classify_probe([self.entry(
            "'50000000': authorization on Exness-MT5Trial8 failed (Invalid account)")])
        self.assertEqual(got[0], "reached")

    def test_an_accepted_login_is_obviously_reached(self):
        got = a.classify_probe([self.entry("'53168878': authorized on Alpari-MT5-Demo")])
        self.assertEqual(got[0], "reached")

    def test_a_host_that_refuses_the_connection_is_not_a_server(self):
        # The address that left one trader on "Connecting" for nineteen hours.
        got = a.classify_probe([self.entry(
            "'235277869': no connection to demo.icmarkets.com:443")])
        self.assertEqual(got, ("not_reached", "'235277869': no connection to demo.icmarkets.com:443"))

    def test_a_web_server_on_443_never_gets_a_connection_line(self):
        # mt5.roboforex.com and mt5.xm.com both accept TCP 443 and are not MT5:
        # the terminal starts, writes a journal, and never tries to connect.
        got = a.classify_probe([self.entry("MetaTrader 5 x64 build 6182 started")])
        self.assertEqual(got[0], "not_reached")
        self.assertIn("never opened a connection", got[1])

    def test_no_journal_at_all_is_an_error_not_a_verdict(self):
        self.assertEqual(a.classify_probe(None)[0], "error")
        self.assertEqual(a.classify_probe([])[0], "error")

    def test_the_newest_line_wins(self):
        got = a.classify_probe([
            self.entry("'1': no connection to mt5.example.com:443"),
            self.entry("'1': authorization on mt5.example.com:443 failed (Invalid account)"),
        ])
        self.assertEqual(got[0], "reached")

    def test_waiting_stops_only_once_the_answer_cannot_change(self):
        self.assertTrue(a.probe_conclusive("reached", "authorized on X"))
        self.assertTrue(a.probe_conclusive("not_reached", "'1': no connection to x.com:443"))
        # Still starting up: keep waiting rather than call it a failure.
        self.assertFalse(a.probe_conclusive("not_reached", "the terminal never opened a connection"))
        self.assertFalse(a.probe_conclusive("error", "the terminal wrote no journal"))


@unittest.skipIf(a is None, "agent dependencies not installed")
class ProbeVerdictMessageTest(unittest.TestCase):
    """What a trader is told once a check raised on their behalf comes back.

    "No answer from the broker" does not say whose problem it is. A dead address
    is ours to fix by cataloguing the right one; a refused sign-in is theirs.
    """

    def test_every_verdict_has_a_message_and_a_level(self):
        for verdict in ("reached", "not_reached", "error"):
            level, message = a.PROBE_VERDICT[verdict]
            self.assertIn(level, ("info", "warn", "error"))
            self.assertGreater(len(message), 40)

    def test_a_dead_address_tells_them_what_to_ask_their_broker_for(self):
        level, message = a.PROBE_VERDICT["not_reached"]
        self.assertEqual(level, "error")
        self.assertIn("not a MetaTrader server", message)
        self.assertIn("access point", message)

    def test_a_live_address_points_at_the_credentials_instead(self):
        level, message = a.PROBE_VERDICT["reached"]
        self.assertEqual(level, "info")
        self.assertIn("password", message)

    def test_an_unknown_verdict_falls_back_rather_than_raising(self):
        self.assertEqual(a.PROBE_VERDICT.get("nonsense", a.PROBE_VERDICT["error"]),
                         a.PROBE_VERDICT["error"])
