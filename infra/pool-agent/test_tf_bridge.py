"""Tests for the file bridge. Stdlib only, so they run on the pool server too:

    python3 -m unittest discover -s infra/pool-agent -v
"""
import json
import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path

import tf_bridge as b

HERE = Path(__file__).resolve().parent
ACC = "1a82522b-6967-44ed-b904-a5387c51dd80"
OTHER = "b791adf8-b251-41ea-ab57-c71e475dad12"
USER = "8b9854a7-f575-4d68-97ef-1a9417ff9474"
KEY = "8e003a17-afbc-4f87-8393-1f716a624fb7"
NOW = 1_758_106_000  # 2025-09-17T10:46:40Z

RULES = {
    "account_id": ACC, "config_version": 7, "is_active": True,
    "daily_loss_limit": 500, "max_trades_per_day": 3, "max_open_positions": 2,
    "risk_per_trade_percent": 1,
    "session_london_enabled": True, "session_new_york_enabled": False,
    "session_asian_enabled": False, "session_london_ny_overlap_enabled": False,
    "custom_session_start": None, "custom_session_end": None,
    "timezone": "Asia/Kolkata", "updated_at": "2026-08-21T16:44:02.708115+00:00",
}


def envelope(kind, body, written_at=NOW):
    return json.dumps({"v": 1, "kind": kind, "writtenAt": written_at, "body": body}).encode()


# ================================================================ contract
class ContractTest(unittest.TestCase):
    """Same file as src/lib/ea-contract.test.ts: both sides must agree."""

    def test_every_case_matches_the_website(self):
        cases = json.loads((HERE / "contract" / "ea-payloads.json").read_text())["cases"]
        self.assertGreater(len(cases), 50)
        for c in cases:
            with self.subTest(c["name"]):
                if c["valid"]:
                    out = b.validate(c["kind"], c["body"])
                    for k, v in c.get("expect", {}).items():
                        self.assertEqual(out[k], v)
                else:
                    with self.assertRaises(b.Invalid):
                        b.validate(c["kind"], c["body"])

    def test_unknown_keys_are_stripped_like_zod(self):
        out = b.validate("sync", {"equity": 1, "extra": True})
        self.assertEqual(out, {"equity": 1})

    def test_integral_float_becomes_int(self):
        out = b.validate("sync", {"equity": 1, "failedFetches": 5.0})
        self.assertIs(type(out["failedFetches"]), int)

    def test_absent_and_null_balance_stay_distinct(self):
        self.assertNotIn("balance", b.validate("account", {"equity": 1}))
        self.assertIsNone(b.validate("account", {"equity": 1, "balance": None})["balance"])

    def test_js_string_length_counts_utf16_units(self):
        # One emoji is two UTF-16 code units: 16 of them is 32 > 16.
        with self.assertRaises(b.Invalid):
            b.validate("sync", {"equity": 1, "eaVersion": "\U0001F600" * 9})
        b.validate("sync", {"equity": 1, "eaVersion": "\U0001F600" * 8})

    def test_js_trim_whitespace_set(self):
        self.assertEqual(b.validate("violations", {"type": "OVERTRADING", "eventId": "\ufeffX\u00a0"})["eventId"], "X")
        # U+001F is whitespace to Python's str.strip() but not to JavaScript.
        self.assertEqual(b.validate("violations", {"type": "OVERTRADING", "eventId": "X\x1f"})["eventId"], "X\x1f")

    def test_js_json_length(self):
        for value, js in [
            ({"a": 1.5}, '{"a":1.5}'), (100.0, "100"), (1e21, "1e+21"), (1e-7, "1e-7"),
            (0.000001, "0.000001"), (0.1 + 0.2, "0.30000000000000004"), (-2.5e-5, "-0.000025"),
            ([1, "x", None, True], '[1,"x",null,true]'), ({"k": "\n\u2028"}, '{"k":"\\n\u2028"}'),
            ({}, "{}"), ([], "[]"),
        ]:
            with self.subTest(js):
                self.assertEqual(b.js_json_length(value), len(js))


class IsoTest(unittest.TestCase):
    def test_offsets(self):
        self.assertEqual(b.parse_iso("2026-09-17T15:35:00+05:30"), b.parse_iso("2026-09-17T10:05:00Z"))
        self.assertEqual(b.parse_iso("2026-09-17T10:05:00.5-0100").hour, 11)

    def test_rejects_impossible_dates(self):
        for v in ("2026-02-30T00:00:00Z", "2026-13-01", "20260917", "2026-09-17T25:00:00Z"):
            with self.subTest(v), self.assertRaises(b.Invalid):
                b.parse_iso(v)


class EnvelopeTest(unittest.TestCase):
    def test_round_trip(self):
        env = b.parse_envelope(envelope("trades", {"x": 1}))
        self.assertEqual((env.kind, env.written_at, env.body), ("trades", NOW, {"x": 1}))

    def test_bom_is_tolerated(self):
        self.assertEqual(b.parse_envelope("\ufeff".encode() + envelope("sync", {})).kind, "sync")

    def test_rejections(self):
        bad = [
            b"not json", b"[]", b'{"v":2,"kind":"sync","writtenAt":1,"body":{}}',
            b'{"v":true,"kind":"sync","writtenAt":1,"body":{}}',
            b'{"v":1,"kind":"delete_everything","writtenAt":1,"body":{}}',
            b'{"v":1,"kind":"sync","writtenAt":"now","body":{}}',
            b'{"v":1,"kind":"sync","writtenAt":1}',
            b'{"v":1,"kind":"sync","writtenAt":1,"body":{"equity":NaN}}',
            b'\xff\xfe{}', b"{" + b" " * b.MAX_FILE_BYTES + b"}",
        ]
        for raw in bad:
            with self.subTest(raw[:40]), self.assertRaises(b.Invalid):
                b.parse_envelope(raw)


class ShapeConfigTest(unittest.TestCase):
    def test_matches_the_website_shape(self):
        # Same expectations as src/app/api/ea/sync/route.test.ts.
        self.assertEqual(b.shape_config(RULES), {
            "configured": True, "configVersion": 7, "isActive": True,
            "dailyLossLimit": 500, "maxTradesPerDay": 3, "maxOpenPositions": 2,
            "riskPerTradePercent": 1,
            "sessions": {"london": True, "newYork": False, "asian": False, "londonNyOverlap": False,
                         "customStart": None, "customEnd": None, "timezone": "Asia/Kolkata"},
        })

    def test_unconfigured_inbox(self):
        self.assertEqual(b.inbox_core(None), {"v": 1, "configured": False, "configVersion": None})


# ================================================================ filesystem
def make_volume(root: Path, account=ACC) -> Path:
    vol = root / account
    (vol.joinpath(*b.MQL5_FILES)).mkdir(parents=True)
    return vol


def files_dir(vol: Path) -> Path:
    return vol.joinpath(*b.MQL5_FILES)


class FsCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.vol = make_volume(self.tmp)
        self.bridge = files_dir(self.vol) / b.BRIDGE_DIR


class FilesystemTest(FsCase):
    def test_creates_the_bridge_but_never_mt5s_tree(self):
        with b.BridgeDirs(str(self.vol), create=True):
            pass
        self.assertTrue((self.bridge / "out").is_dir() and (self.bridge / "in").is_dir())
        empty = self.tmp / "empty"
        empty.mkdir()
        with self.assertRaises(OSError):
            b.BridgeDirs(str(empty), create=True)
        self.assertEqual(list(empty.iterdir()), [])

    def test_symlinked_bridge_dir_is_refused(self):
        target = self.tmp / "elsewhere"
        target.mkdir()
        (target / "precious.json").write_text("{}")
        self.bridge.symlink_to(target)
        with self.assertRaises(OSError):
            b.BridgeDirs(str(self.vol), create=True)
        self.assertTrue((target / "precious.json").exists())

    def test_symlinked_out_dir_is_refused(self):
        self.bridge.mkdir()
        target = self.tmp / "elsewhere"
        target.mkdir()
        (self.bridge / "out").symlink_to(target)
        with self.assertRaises(OSError):
            b.BridgeDirs(str(self.vol), create=True)

    def test_read_regular_refuses_links_fifos_and_giants(self):
        with b.BridgeDirs(str(self.vol), create=True) as dirs:
            secret = self.tmp / "secret"
            secret.write_text("root only")
            (self.bridge / "out" / "link.json").symlink_to(secret)
            os.mkfifo(self.bridge / "out" / "fifo.json")
            (self.bridge / "out" / "big.json").write_bytes(b"x" * (b.MAX_FILE_BYTES + 1))
            (self.bridge / "out" / "ok.json").write_bytes(b"{}")
            for name in ("link.json", "fifo.json", "big.json"):
                with self.subTest(name), self.assertRaises(b.Invalid):
                    b.read_regular(dirs.out, name)
            self.assertEqual(b.read_regular(dirs.out, "ok.json"), b"{}")
            with self.assertRaises(FileNotFoundError):
                b.read_regular(dirs.out, "gone.json")

    def test_write_inbox_is_atomic_and_mtime_always_moves(self):
        with b.BridgeDirs(str(self.vol), create=True) as dirs:
            m1 = b.write_inbox(dirs.inbox, b'{"a":1}', now=NOW)
            m2 = b.write_inbox(dirs.inbox, b'{"a":2}', now=NOW)  # same second
            m3 = b.write_inbox(dirs.inbox, b'{"a":3}', now=NOW)
        self.assertEqual((m1, m2, m3), (NOW, NOW + 1, NOW + 2))
        inbox = self.bridge / "in" / "config.json"
        self.assertEqual(inbox.read_bytes(), b'{"a":3}')
        self.assertEqual(int(inbox.stat().st_mtime), NOW + 2)
        self.assertEqual(sorted(p.name for p in (self.bridge / "in").iterdir()), ["config.json"])

    def test_write_inbox_replaces_a_planted_symlink_not_its_target(self):
        victim = self.tmp / "victim"
        victim.write_text("untouched")
        with b.BridgeDirs(str(self.vol), create=True) as dirs:
            (self.bridge / "in" / "config.json").symlink_to(victim)
            b.write_inbox(dirs.inbox, b"{}", now=NOW)
        self.assertEqual(victim.read_text(), "untouched")
        self.assertFalse((self.bridge / "in" / "config.json").is_symlink())

    def test_quarantine_and_housekeeping(self):
        with b.BridgeDirs(str(self.vol), create=True) as dirs:
            (self.bridge / "out" / "1.json").write_text("{}")
            b.quarantine(dirs, "1.json", "because")
            self.assertEqual((self.bridge / "bad" / "1.json.reason").read_text(), "because")
            self.assertFalse((self.bridge / "out" / "1.json").exists())

            (self.bridge / "out" / "old.tmp").write_text("x")
            (self.bridge / "out" / "new.tmp").write_text("x")
            os.utime(self.bridge / "out" / "old.tmp", (NOW - 7200, NOW - 7200))
            os.utime(self.bridge / "out" / "new.tmp", (NOW, NOW))
            for i in range(b.MAX_BAD_FILES + 5):
                (self.bridge / "bad" / f"{i:05d}.json").write_text("{}")
            b.housekeep(dirs, NOW)
        self.assertFalse((self.bridge / "out" / "old.tmp").exists())
        self.assertTrue((self.bridge / "out" / "new.tmp").exists())
        bad = sorted(p.name for p in (self.bridge / "bad").iterdir() if p.suffix == ".json")
        self.assertEqual(len(bad), b.MAX_BAD_FILES)
        self.assertNotIn("00000.json", bad)


class LoginStateTest(FsCase):
    def write_log(self, *lines):
        d = self.vol.joinpath(*b.LOGIN_LOGS)
        d.mkdir(parents=True, exist_ok=True)
        (d / "20260918.log").write_bytes("\n".join(lines).encode("utf-16-le"))

    def test_reads_the_last_outcome(self):
        self.assertIsNone(b.login_state(str(self.vol)))
        self.write_log("0\t1\t09:00:00.000\tNetwork\t'123': authorization on Broker-Live failed (Invalid account)")
        self.assertEqual(b.login_state(str(self.vol)), ("failed", "Invalid account"))
        self.write_log(
            "0\t1\t09:00:00.000\tNetwork\t'123': authorization on Broker-Live failed (Invalid account)",
            "0\t1\t09:00:30.000\tNetwork\t'123': authorized on Broker-Live",
        )
        self.assertEqual(b.login_state(str(self.vol)), ("ok", "Broker-Live"))

    def test_missing_volume_is_silent(self):
        self.assertIsNone(b.login_state("/nonexistent"))

    def test_no_outcome_yet_is_waiting_with_the_last_network_line(self):
        self.write_log("0\t1\t09:00:00.000\tTerminal\tMetaTrader 5 x64 build 6182 started",
                       "0\t1\t09:00:05.000\tNetwork\t'123': connecting to 10.0.0.1:443",
                       "0\t1\t09:00:25.000\tNetwork\t'123': no connection to 10.0.0.1:443")
        self.assertEqual(b.login_state(str(self.vol)), ("waiting", "'123': no connection to 10.0.0.1:443"))

    # Kiran's Alpari terminal, 22 Sep: signed in, then the EA never started.
    KIRAN = (
        "0\t1\t06:48:01.132\tNetwork\t'53168878': authorized on Alpari-MT5-Demo",
        "0\t1\t06:48:04.075\tNetwork\t'53168878': trading has been enabled, demo account - hedging mode",
        "0\t1\t06:48:50.209\tExperts\texpert TradeForce (EURUSD,M1) loaded successfully",
        "0\t1\t06:53:58.295\tExperts\tinitializing of TradeForce (EURUSD,M1) failed with code 0 (symbol synchronization timeout)",
        "0\t1\t06:53:58.303\tExperts\texpert TradeForce (EURUSD,M1) removed",
    )

    def test_an_ea_that_failed_to_start_says_why(self):
        self.write_log(*self.KIRAN)
        self.assertEqual(b.login_state(str(self.vol)), ("ok", "Alpari-MT5-Demo"))
        self.assertEqual(b.ea_start(str(self.vol)), ("failed", "symbol synchronization timeout"))
        self.assertEqual(b.trading_mode(str(self.vol)), (True, "trading has been enabled, demo account - hedging mode"))
        ev = b.evidence(str(self.vol), n=2)
        self.assertEqual(len(ev), 2)
        self.assertIn("failed with code 0 (symbol synchronization timeout)", ev[0])

    def test_a_restart_that_loads_the_ea_clears_the_failure(self):
        self.write_log(*self.KIRAN, "0\t1\t07:40:00.000\tExperts\texpert TradeForce (TFCHART,M1) loaded successfully")
        self.assertEqual(b.ea_start(str(self.vol)), ("loaded", "TFCHART"))

    def test_an_investor_login_is_read_only(self):
        self.write_log("0\t1\t09:00:00.000\tNetwork\t'123': authorized on Broker-Live",
                       "0\t1\t09:00:01.000\tNetwork\t'123': trading has been disabled - investor mode")
        self.assertEqual(b.trading_mode(str(self.vol)), (False, "trading has been disabled - investor mode"))
        self.assertIsNone(b.ea_start(str(self.vol)))

    def test_no_journal_means_no_answers(self):
        self.assertIsNone(b.ea_start("/nonexistent"))
        self.assertIsNone(b.trading_mode("/nonexistent"))
        self.assertEqual(b.evidence("/nonexistent"), [])

    def test_a_sign_in_yesterday_still_counts_today(self):
        d = self.vol.joinpath(*b.LOGIN_LOGS)
        d.mkdir(parents=True, exist_ok=True)
        old = d / "20260917.log"
        old.write_bytes("0\t1\t23:59:10.000\tNetwork\t'123': authorized on Broker-Live".encode("utf-16-le"))
        os.utime(old, (NOW - 600, NOW - 600))
        (d / "20260918.log").write_bytes("0\t1\t00:00:01.000\tTerminal\tnew day".encode("utf-16-le"))
        self.assertEqual(b.login_state(str(self.vol)), ("ok", "Broker-Live"))


# ================================================================ Supabase
class FakeRest:
    """Records every request; `routes` maps (method, table) to a response or a callable."""

    def __init__(self):
        self.calls = []
        self.routes = {}

    def request(self, method, table, *, params=None, body=None, prefer=None):
        self.calls.append((method, table, params or {}, body))
        r = self.routes.get((method, table), (200 if method == "GET" else 201, [] if method == "GET" else None))
        if callable(r):
            r = r(params or {}, body)
        if isinstance(r, Exception):
            raise r
        return r

    def of(self, method, table):
        return [c for c in self.calls if c[0] == method and c[1] == table]


def account():
    return b.Account(ACC, USER, KEY)


class RelayTest(unittest.TestCase):
    def setUp(self):
        self.rest = FakeRest()
        self.relay = b.Relay(self.rest, log=lambda *_: None)

    def apply(self, kind, body, written_at=NOW):
        return self.relay.apply(account(), b.Envelope(kind, written_at, body), b.validate(kind, body))

    def test_sync_writes_what_record_account_report_writes(self):
        self.assertIsNone(self.apply("sync", {
            "equity": 10012.35, "balance": 10000, "failedFetches": 2, "queuedPosts": 0,
            "fromCache": False, "backoffSeconds": 0, "eaVersion": "1.26", "knownConfigVersion": 7,
        }))
        (_, _, p, tele), = self.rest.of("PATCH", "mt5_instances")
        self.assertEqual(p, {"account_id": f"eq.{ACC}"})
        self.assertEqual(tele, {
            "ea_version": "1.26", "ea_failed_fetches": 2, "ea_last_http_status": None,
            "ea_queued_posts": 0, "ea_from_cache": False, "ea_backoff_seconds": 0,
            "ea_reported_at": "2025-09-17T10:46:40Z",
        })
        (_, _, p, acc), = self.rest.of("PATCH", "accounts")
        self.assertEqual((p, acc), ({"id": f"eq.{ACC}"}, {"current_equity": 10012.35, "starting_balance": 10000}))
        (_, _, _, snap), = self.rest.of("POST", "account_snapshots")
        self.assertEqual(snap, {"user_id": USER, "account_id": ACC, "equity": 10012.35, "balance": 10000,
                                "recorded_at": "2025-09-17T10:46:40Z"})

    def test_trade_block_is_stored_and_cleared(self):
        self.assertIsNone(self.apply("sync", {"equity": 1, "tradeBlock": "ALGO_TRADING_OFF"}))
        self.assertEqual(self.rest.of("PATCH", "accounts")[0][3],
                         {"current_equity": 1, "ea_trade_block": "ALGO_TRADING_OFF"})
        self.assertIsNone(self.apply("account", {"equity": 1, "tradeBlock": ""}))
        self.assertEqual(self.rest.of("PATCH", "accounts")[1][3], {"current_equity": 1, "ea_trade_block": None})
        # What v1.27 actually sends when it can trade: JAson writes "" as null.
        self.assertIsNone(self.apply("sync", {"equity": 1, "tradeBlock": None}))
        self.assertEqual(self.rest.of("PATCH", "accounts")[2][3], {"current_equity": 1, "ea_trade_block": None})

    def test_report_without_balance_or_telemetry(self):
        self.assertIsNone(self.apply("account", {"equity": 5}))
        self.assertEqual(self.rest.of("PATCH", "mt5_instances"), [])
        self.assertEqual(self.rest.of("PATCH", "accounts")[0][3], {"current_equity": 5})
        self.assertIsNone(self.rest.of("POST", "account_snapshots")[0][3]["balance"])

    def test_telemetry_failure_never_fails_the_report(self):
        self.rest.routes[("PATCH", "mt5_instances")] = b.Transient("timeout")
        self.assertIsNone(self.apply("sync", {"equity": 1, "eaVersion": "1.26"}))

    def test_trade_row_and_dedupe(self):
        body = {"symbol": " eurusd", "direction": "SHORT", "entryPrice": 1.1, "entryTime": "2026-09-17T10:00:00Z",
                "brokerDealId": "42"}
        self.assertIsNone(self.apply("trades", body))
        (_, _, p, _), = self.rest.of("GET", "trades")
        self.assertEqual(p, {"select": "id", "account_id": f"eq.{ACC}", "broker_deal_id": "eq.42"})
        (_, _, _, row), = self.rest.of("POST", "trades")
        self.assertEqual(row, {
            "user_id": USER, "account_id": ACC, "symbol": "EURUSD", "direction": "SHORT", "entry_price": 1.1,
            "exit_price": None, "quantity": None, "pnl": None, "entry_time": "2026-09-17T10:00:00Z",
            "exit_time": None, "source": "EA", "broker_deal_id": "42",
        })

        self.rest.calls.clear()
        self.rest.routes[("GET", "trades")] = (200, [{"id": "t1"}])
        self.assertIsNone(self.apply("trades", body))
        self.assertEqual(self.rest.of("POST", "trades"), [])

    def test_lost_race_is_a_duplicate_not_an_error(self):
        self.rest.routes[("POST", "violations")] = (409, {"code": "23505", "message": "duplicate key"})
        self.assertIsNone(self.apply("violations", {"type": "OVERTRADING", "eventId": "OT-1"}))

    def test_violation_and_event_rows(self):
        self.apply("violations", {"type": "DAILY_LOSS_BREACH", "eventId": "DLB-1", "details": {"limit": 500},
                                  "occurredAt": "2026-09-17T10:00:00Z"})
        self.apply("violations", {"type": "OVERTRADING"})
        rows = [c[3] for c in self.rest.of("POST", "violations")]
        self.assertEqual(rows[0], {"user_id": USER, "account_id": ACC, "type": "DAILY_LOSS_BREACH",
                                   "details": {"limit": 500}, "event_id": "DLB-1",
                                   "occurred_at": "2026-09-17T10:00:00Z"})
        self.assertEqual(rows[1], {"user_id": USER, "account_id": ACC, "type": "OVERTRADING",
                                   "details": {}, "event_id": None})
        self.assertEqual(len(self.rest.of("GET", "violations")), 1)  # no eventId, no lookup

        self.apply("events", {"type": "EA_REMOVED", "occurredAt": "2026-09-17T10:00:00Z"})
        (_, _, _, ev), = self.rest.of("POST", "ea_events")
        self.assertEqual(ev, {"user_id": USER, "account_id": ACC, "event_type": "EA_REMOVED", "details": {},
                              "occurred_at": "2026-09-17T10:00:00Z"})

    def test_outcome_classification(self):
        body = {"type": "EA_REMOVED"}
        for status, payload, expect in [
            (400, {"code": "22P02", "message": "invalid input"}, "bad"),
            (409, {"code": "23503", "message": "fk"}, "bad"),
            (400, {"code": "PGRST204", "message": "schema cache"}, "retry"),
            (401, {"message": "JWT expired"}, "retry"),
            (404, {"code": "PGRST205"}, "retry"),
            (500, None, "retry"),
            (503, None, "retry"),
        ]:
            with self.subTest(status=status, code=(payload or {}).get("code")):
                self.rest.routes[("POST", "ea_events")] = (status, payload)
                self.assertTrue(self.apply("events", body).startswith(expect + ": "))

    def test_key_stamp_is_throttled_and_never_moves_backwards(self):
        a = account()
        self.relay.stamp_key(a, NOW)
        self.relay.stamp_key(a, NOW + 30)
        self.relay.stamp_key(a, NOW + 61)
        stamps = self.rest.of("PATCH", "api_keys")
        self.assertEqual(len(stamps), 2)
        self.assertEqual(stamps[0][2]["or"], '(last_used_at.is.null,last_used_at.lt."2025-09-17T10:46:40Z")')
        self.assertEqual(stamps[0][3], {"last_used_at": "2025-09-17T10:46:40Z"})


# ================================================================ service
class ServiceTest(FsCase):
    def setUp(self):
        super().setUp()
        make_volume(self.tmp, OTHER)
        self.rest = FakeRest()
        self.rest.routes[("GET", "mt5_instances")] = (200, [
            {"account_id": ACC, "user_id": USER, "api_key_id": KEY},
            {"account_id": OTHER, "user_id": USER, "api_key_id": None},
        ])
        self.rest.routes[("GET", "api_keys")] = (200, [{"id": KEY, "revoked_at": None}])
        self.rest.routes[("GET", "trading_rules")] = (200, [RULES])
        self.logs = []
        self.now = NOW
        self.svc = self.service()

    def service(self, enabled=ACC):
        return b.BridgeService(self.rest, data_dir=str(self.tmp), host="contabo-1", enabled=enabled,
                               log=self.logs.append, clock=lambda: self.now, uid=None, gid=None)

    def out(self, name, raw):
        d = self.bridge / "out"
        d.mkdir(parents=True, exist_ok=True)
        (d / name).write_bytes(raw)

    def inbox(self):
        return json.loads((self.bridge / "in" / "config.json").read_text())

    def test_disabled_by_default(self):
        self.assertFalse(self.service(enabled=None).active)
        self.assertFalse(self.service(enabled="off").active)
        self.assertIsNone(self.service(enabled="all").enabled)

    def test_only_enabled_accounts_on_this_host(self):
        self.svc.tick()
        self.assertEqual(list(self.svc.accounts), [ACC])
        (_, _, p, _), = self.rest.of("GET", "mt5_instances")
        self.assertEqual(p["server_host"], "eq.contabo-1")
        self.assertFalse((files_dir(self.tmp / OTHER) / b.BRIDGE_DIR).exists())

    def test_rules_reach_the_inbox_and_heartbeat(self):
        self.svc.tick()
        doc = self.inbox()
        self.assertEqual((doc["configured"], doc["configVersion"], doc["bridgeAt"], doc["seq"]), (True, 7, NOW, 1))
        self.assertEqual(doc["config"], b.shape_config(RULES))

        self.now += 10
        self.svc.tick()
        self.assertEqual(self.inbox()["seq"], 1)  # nothing new, no rewrite

        self.now += 25
        self.svc.tick()
        self.assertEqual((self.inbox()["seq"], self.inbox()["bridgeAt"]), (2, self.now))

    def test_a_rule_change_is_written_on_the_next_poll(self):
        self.svc.tick()
        self.rest.routes[("GET", "trading_rules")] = (200, [{**RULES, "config_version": 8, "max_trades_per_day": 1,
                                                             "updated_at": "2026-09-17T10:47:00+00:00"}])
        self.now += b.RULES_POLL_SECONDS
        self.svc.tick()
        doc = self.inbox()
        self.assertEqual((doc["configVersion"], doc["config"]["maxTradesPerDay"]), (8, 1))
        # Incremental poll: only rows changed since the watermark, with overlap.
        _, _, params, _ = self.rest.of("GET", "trading_rules")[-1]
        self.assertEqual(params["updated_at"], "gte.2026-08-21T16:43:32.708115+00:00")

    def test_rules_outage_stops_the_heartbeat(self):
        self.svc.tick()
        self.rest.routes[("GET", "trading_rules")] = (503, None)
        for _ in range(10):
            self.now += 10
            self.svc.tick()
        self.assertEqual(self.inbox()["bridgeAt"], NOW)  # the EA will see it going stale

    def test_deleted_rules_unconfigure_on_full_refresh(self):
        self.svc.tick()
        self.rest.routes[("GET", "trading_rules")] = (200, [])
        self.now += b.RULES_FULL_SECONDS
        self.svc.tick()
        self.assertEqual(self.inbox()["configured"], False)

    def test_reports_are_relayed_in_order_and_deleted(self):
        self.out(f"{NOW:010d}-0000000002-0001-trades.json", envelope("trades", {
            "symbol": "EURUSD", "direction": "LONG", "entryPrice": 1.1, "entryTime": "2026-09-17T10:00:00Z"}))
        self.out(f"{NOW:010d}-0000000001-0000-sync.json", envelope("sync", {"equity": 1, "eaVersion": "1.26"}))
        self.svc.tick()
        kinds = [c[1] for c in self.rest.calls if c[0] in ("POST", "PATCH") and c[1] != "api_keys"]
        self.assertEqual(kinds, ["mt5_instances", "accounts", "account_snapshots", "trades"])
        self.assertEqual(list((self.bridge / "out").iterdir()), [])
        self.assertEqual(len(self.rest.of("PATCH", "api_keys")), 1)

    def test_invalid_reports_are_quarantined_and_do_not_block(self):
        self.out("1-a.json", b"garbage")
        self.out("2-b.json", envelope("trades", {"symbol": "X", "direction": "LONG", "entryPrice": 0,
                                                 "entryTime": "2026-09-17T10:00:00Z"}))
        self.out("3-c.json", envelope("sync", {"equity": 1}, written_at=NOW + 3600))
        self.out("4-d.json", envelope("events", {"type": "EA_REMOVED"}))
        self.out("bad name.json", b"{}")
        self.svc.tick()
        self.assertEqual(sorted(p.name for p in (self.bridge / "bad").iterdir() if p.suffix == ".json"),
                         ["1-a.json", "2-b.json", "3-c.json", "bad name.json"])
        self.assertIn("entryPrice", (self.bridge / "bad" / "2-b.json.reason").read_text())
        self.assertEqual(len(self.rest.of("POST", "ea_events")), 1)
        self.assertEqual(list((self.bridge / "out").iterdir()), [])

    def test_outage_keeps_every_file_in_order_until_it_clears(self):
        for i in range(3):
            self.out(f"{i}-v.json", envelope("violations", {"type": "OVERTRADING", "eventId": f"OT-{i}"}))
        self.rest.routes[("POST", "violations")] = b.Transient("ConnectionError")
        self.svc.tick()
        self.assertEqual(len(list((self.bridge / "out").iterdir())), 3)
        self.assertEqual(len(self.rest.of("POST", "violations")), 1)  # stopped at the first failure

        self.now += 1
        self.svc.tick()  # still backing off
        self.assertEqual(len(self.rest.of("POST", "violations")), 1)

        del self.rest.routes[("POST", "violations")]
        self.now += 60
        self.svc.tick()
        ids = [c[3]["event_id"] for c in self.rest.of("POST", "violations")]
        self.assertEqual(ids, ["OT-0", "OT-0", "OT-1", "OT-2"])
        self.assertEqual(list((self.bridge / "out").iterdir()), [])

    def test_agent_restart_loses_nothing(self):
        self.out("1-v.json", envelope("violations", {"type": "OVERTRADING", "eventId": "OT-9"}))
        self.rest.routes[("GET", "mt5_instances")] = (503, None)
        self.svc.tick()  # cannot even list accounts
        self.assertEqual(len(list((self.bridge / "out").iterdir())), 1)

        self.rest.routes[("GET", "mt5_instances")] = (200, [{"account_id": ACC, "user_id": USER, "api_key_id": KEY}])
        restarted = self.service()
        restarted.tick()
        self.assertEqual(len(self.rest.of("POST", "violations")), 1)
        self.assertEqual(list((self.bridge / "out").iterdir()), [])

    def test_revoked_key_refuses_reports(self):
        self.rest.routes[("GET", "api_keys")] = (200, [{"id": KEY, "revoked_at": "2026-09-01T00:00:00Z"}])
        self.out("1-s.json", envelope("sync", {"equity": 1}))
        self.svc.tick()
        self.assertEqual(self.rest.of("PATCH", "accounts"), [])
        self.assertEqual((self.bridge / "bad" / "1-s.json.reason").read_text(), "EA key revoked")

    def test_a_crashing_tick_does_not_kill_the_loop(self):
        ticks = []

        def boom(*_):
            ticks.append(1)
            if len(ticks) == 2:
                self.svc.stop.set()
            raise RuntimeError("bug")

        self.rest.routes[("GET", "mt5_instances")] = boom
        self.svc.clock = time.time  # run_forever really waits between ticks
        b.ACCOUNTS_REFRESH_SECONDS, saved = 0, b.ACCOUNTS_REFRESH_SECONDS
        try:
            self.svc.run_forever()
        finally:
            b.ACCOUNTS_REFRESH_SECONDS = saved
        self.assertEqual(len(ticks), 2)  # the first crash did not end the loop
        self.assertTrue(any("tick failed: RuntimeError" in m for m in self.logs))


if __name__ == "__main__":
    unittest.main()
