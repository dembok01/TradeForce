"""TradeForce file bridge: hosted EAs <-> pool agent <-> Supabase.

Hosted EAs used to call the website over HTTPS. Vercel's DDoS protection kept
blocking this server's address for 31 minutes at a time, and during a block no
rule change could reach a terminal and no violation could reach the dashboard.

In bridge mode (EA v1.26+, `BridgeMode=true`) the EA makes no web requests. It
writes each report as a small JSON file in its own MQL5/Files folder, and reads
its rules from a file this agent keeps current. The agent already runs on the
same machine and already talks to Supabase from this address without trouble.

    EA  --writes-->  MQL5/Files/tf_bridge/out/<name>.json  --agent-->  Supabase
    EA  <--reads---  MQL5/Files/tf_bridge/in/config.json   <--agent--  trading_rules

Everything the website's /api/ea/* routes decide is decided the same way here:
the same validation (infra/pool-agent/contract/ea-payloads.json is run against
both), the same rows written, the same duplicate checks. The account is the
folder the file came from, never anything the file says.

The volume is written by the container, so everything in it is untrusted: every
path is walked with O_NOFOLLOW relative to directory descriptors, so a symlink
planted by a compromised terminal cannot point this root process anywhere else.
"""
from __future__ import annotations

import json
import math
import os
import re
import stat
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

PROTOCOL = 1
KINDS = ("sync", "account", "trades", "violations", "events")

MAX_FILE_BYTES = 64 * 1024
MAX_FILES_PER_PASS = 50        # per account, so one busy terminal can't starve the rest
MAX_BAD_FILES = 500
STALE_TMP_SECONDS = 3600
MAX_AGE_SECONDS = 30 * 86400   # older than this is not a report, it's an archaeology find
MAX_CLOCK_AHEAD_SECONDS = 300

INBOX_HEARTBEAT_SECONDS = 30   # the EA calls the bridge stale after 120s without one
RULES_POLL_SECONDS = 3         # a dashboard rule change reaches the terminal in ~3-5s
RULES_FULL_SECONDS = 300       # catches deleted rules rows, which updated_at can't
RULES_OVERLAP_SECONDS = 30     # updated_at is the transaction START time; commits land late
ACCOUNTS_REFRESH_SECONDS = 60
RELAY_SECONDS = 2
STAMP_EVERY_SECONDS = 60       # api_keys.last_used_at, same granularity as the website

MQL5_FILES = (".wine", "drive_c", "Program Files", "MetaTrader 5", "MQL5", "Files")
BRIDGE_DIR = "tf_bridge"
INBOX_NAME = "config.json"

RULE_COLUMNS = ",".join((
    "account_id", "config_version", "is_active", "daily_loss_limit",
    "max_trades_per_day", "max_open_positions", "risk_per_trade_percent",
    "session_london_enabled", "session_new_york_enabled", "session_asian_enabled",
    "session_london_ny_overlap_enabled", "custom_session_start", "custom_session_end",
    "timezone", "updated_at",
))

_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_OUTBOX_NAME = re.compile(r"^[0-9A-Za-z._-]{1,128}\.json$")


# =========================================================== validation
# A line-by-line port of the zod schemas in src/lib/ea-payload.ts and
# src/lib/schemas/trade.ts. Where JavaScript and Python disagree about the same
# JSON (booleans are numbers in Python, JS trims a different whitespace set,
# JS string length is UTF-16 code units), the JavaScript answer is the contract.

class Invalid(ValueError):
    """The payload can never be accepted; retrying cannot help."""


_ABSENT = object()

# ECMAScript WhiteSpace + LineTerminator, which is what String.prototype.trim strips.
_JS_WHITESPACE = (
    "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008"
    "\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)

_UUID_ZOD = re.compile(
    r"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
    r"|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
)

# Date.parse accepts far more than this, but the EA only ever sends ISO 8601,
# and anything outside this subset risks a Postgres cast error on insert anyway.
_ISO = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})"
    r"(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$"
)


def _utf16_len(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and (
        isinstance(v, int) or math.isfinite(v)
    )


def _number(d: dict, key: str, *, lo=None, hi=None, gt=None, integer=False,
            required=False, nullable=False):
    if key not in d:
        if required:
            raise Invalid(f"{key}: required")
        return _ABSENT
    v = d[key]
    if v is None:
        if nullable:
            return None
        raise Invalid(f"{key}: must not be null")
    if not _is_number(v):
        raise Invalid(f"{key}: expected a number")
    if integer:
        if isinstance(v, float) and not v.is_integer():
            raise Invalid(f"{key}: expected an integer")
        v = int(v)
    if gt is not None and not v > gt:
        raise Invalid(f"{key}: must be greater than {gt}")
    if lo is not None and v < lo:
        raise Invalid(f"{key}: below {lo}")
    if hi is not None and v > hi:
        raise Invalid(f"{key}: above {hi}")
    return v


def _string(d: dict, key: str, *, trim=False, min_len=None, max_len=None,
            required=False, nullable=False):
    if key not in d:
        if required:
            raise Invalid(f"{key}: required")
        return _ABSENT
    v = d[key]
    if v is None:
        if nullable:
            return None
        raise Invalid(f"{key}: must not be null")
    if not isinstance(v, str):
        raise Invalid(f"{key}: expected a string")
    if trim:
        v = v.strip(_JS_WHITESPACE)
    n = _utf16_len(v)
    if min_len is not None and n < min_len:
        raise Invalid(f"{key}: too short")
    if max_len is not None and n > max_len:
        raise Invalid(f"{key}: too long")
    return v


def _boolean(d: dict, key: str):
    if key not in d:
        return _ABSENT
    if not isinstance(d[key], bool):
        raise Invalid(f"{key}: expected a boolean")
    return d[key]


def parse_iso(value: str) -> datetime:
    m = _ISO.match(value)
    if not m:
        raise Invalid("not an ISO 8601 timestamp")
    year, month, day, hh, mm, ss, frac, tz = m.groups()
    try:
        dt = datetime(
            int(year), int(month), int(day), int(hh or 0), int(mm or 0), int(ss or 0),
            int((frac or "0").ljust(6, "0")[:6]),
            tzinfo=timezone.utc,
        )
    except ValueError as e:
        raise Invalid(str(e)) from None
    if tz and tz != "Z":
        sign = 1 if tz[0] == "+" else -1
        digits = tz[1:].replace(":", "")
        dt -= sign * timedelta(hours=int(digits[:2]), minutes=int(digits[2:]))
    return dt


def _datetime(d: dict, key: str, *, trim: bool, required=False, nullable=False):
    v = _string(d, key, trim=trim, min_len=1 if trim else None, required=required, nullable=nullable)
    if v is _ABSENT or v is None:
        return v
    try:
        parse_iso(v)
    except Invalid:
        raise Invalid(f"{key}: unparseable timestamp") from None
    return v


def _js_number(v) -> str:
    if isinstance(v, int):
        return str(v)
    if not math.isfinite(v):
        return "null"
    if v.is_integer() and abs(v) < 1e21:
        return str(int(v))
    r = repr(v)
    if "e" not in r:
        return r
    mantissa, exp = r.split("e")
    exp = int(exp)
    if -7 < exp < 0:  # JS writes 1e-6 as 0.000001, Python as 1e-06
        sign = "-" if mantissa.startswith("-") else ""
        digits = mantissa.lstrip("-").replace(".", "")
        return f"{sign}0.{'0' * (-exp - 1)}{digits}"
    return f"{mantissa}e{'+' if exp > 0 else '-'}{abs(exp)}"


def js_json_length(v) -> int:
    """len(JSON.stringify(v)) as JavaScript counts it."""
    if v is None:
        return 4
    if v is True:
        return 4
    if v is False:
        return 5
    if isinstance(v, (int, float)):
        return len(_js_number(v))
    if isinstance(v, str):
        return _utf16_len(json.dumps(v, ensure_ascii=False))
    if isinstance(v, list):
        return 2 + max(len(v) - 1, 0) + sum(js_json_length(x) for x in v)
    if isinstance(v, dict):
        return 2 + max(len(v) - 1, 0) + sum(js_json_length(k) + 1 + js_json_length(x) for k, x in v.items())
    raise Invalid("details: unsupported value")


def _details(d: dict):
    if "details" not in d:
        return _ABSENT
    v = d["details"]
    if not isinstance(v, dict):
        raise Invalid("details: expected an object")
    if js_json_length(v) > 2000:
        raise Invalid("details: too large")
    return v


def _object(body) -> dict:
    if not isinstance(body, dict):
        raise Invalid("body: expected an object")
    return body


def _put(out: dict, key: str, value):
    if value is not _ABSENT:
        out[key] = value


def _report(body, *, sync: bool) -> dict:
    d = _object(body)
    bound = 1e9
    out = {"equity": _number(d, "equity", lo=-bound, hi=bound, required=True)}
    _put(out, "balance", _number(d, "balance", lo=-bound, hi=bound, nullable=True))
    _put(out, "failedFetches", _number(d, "failedFetches", lo=0, hi=1_000_000, integer=True))
    _put(out, "lastHttpStatus", _number(d, "lastHttpStatus", lo=0, hi=599, integer=True))
    _put(out, "queuedPosts", _number(d, "queuedPosts", lo=0, hi=1000, integer=True))
    _put(out, "fromCache", _boolean(d, "fromCache"))
    _put(out, "backoffSeconds", _number(d, "backoffSeconds", lo=0, hi=86_400, integer=True))
    _put(out, "eaVersion", _string(d, "eaVersion", max_len=16))
    _put(out, "tradeBlock", _string(d, "tradeBlock", max_len=32))
    if sync:
        _put(out, "knownConfigVersion",
             _number(d, "knownConfigVersion", lo=-1, hi=2_147_483_647, integer=True))
    return out


def _trade(body) -> dict:
    d = _object(body)
    bound = 1e9
    out = {}
    symbol = _string(d, "symbol", trim=True, min_len=1, max_len=32, required=True)
    out["symbol"] = symbol.upper()
    direction = d.get("direction", _ABSENT)
    if direction not in ("LONG", "SHORT"):
        raise Invalid("direction: expected LONG or SHORT")
    out["direction"] = direction
    out["entryPrice"] = _number(d, "entryPrice", gt=0, hi=bound, required=True)
    _put(out, "exitPrice", _number(d, "exitPrice", gt=0, hi=bound, nullable=True))
    _put(out, "quantity", _number(d, "quantity", lo=0, hi=bound, nullable=True))
    _put(out, "pnl", _number(d, "pnl", lo=-bound, hi=bound, nullable=True))
    out["entryTime"] = _datetime(d, "entryTime", trim=True, required=True)
    _put(out, "exitTime", _datetime(d, "exitTime", trim=True, nullable=True))
    _put(out, "brokerDealId", _string(d, "brokerDealId", trim=True, min_len=1, max_len=64))
    return out


VIOLATION_TYPES = ("OVERTRADING", "OUTSIDE_SESSION", "DAILY_LOSS_BREACH",
                   "OPEN_POSITIONS_BREACH", "RISK_PER_TRADE_BREACH")
EVENT_TYPES = ("EA_REMOVED", "CONNECTION_LOST")


def _violation(body) -> dict:
    d = _object(body)
    if d.get("type", _ABSENT) not in VIOLATION_TYPES:
        raise Invalid("type: unknown violation type")
    out = {"type": d["type"]}
    _put(out, "details", _details(d))
    _put(out, "occurredAt", _datetime(d, "occurredAt", trim=False))
    trade_id = _string(d, "tradeId", nullable=True)
    if isinstance(trade_id, str) and not _UUID_ZOD.match(trade_id):
        raise Invalid("tradeId: expected a uuid")
    _put(out, "tradeId", trade_id)
    _put(out, "eventId", _string(d, "eventId", trim=True, min_len=1, max_len=64))
    return out


def _event(body) -> dict:
    d = _object(body)
    if d.get("type", _ABSENT) not in EVENT_TYPES:
        raise Invalid("type: unknown event type")
    out = {"type": d["type"]}
    _put(out, "details", _details(d))
    _put(out, "occurredAt", _datetime(d, "occurredAt", trim=False))
    return out


_VALIDATORS = {
    "sync": lambda b: _report(b, sync=True),
    "account": lambda b: _report(b, sync=False),
    "trades": _trade,
    "violations": _violation,
    "events": _event,
}


def validate(kind: str, body) -> dict:
    """Normalised payload, exactly as zod's parse() would return it."""
    if kind not in _VALIDATORS:
        raise Invalid(f"kind: unknown ({kind!r})")
    return _VALIDATORS[kind](body)


# =========================================================== envelope

@dataclass(frozen=True)
class Envelope:
    kind: str
    written_at: int  # epoch seconds, the EA's clock (= this host's clock)
    body: object


def _reject_constant(name):
    raise Invalid(f"JSON: {name} is not valid JSON")


def parse_envelope(raw: bytes) -> Envelope:
    if len(raw) > MAX_FILE_BYTES:
        raise Invalid("file too large")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise Invalid("file is not UTF-8") from None
    try:
        doc = json.loads(text.lstrip("\ufeff"), parse_constant=_reject_constant)
    except ValueError as e:
        raise Invalid(f"JSON: {e}") from None
    if not isinstance(doc, dict):
        raise Invalid("envelope: expected an object")
    v = doc.get("v")
    if not _is_number(v) or v != PROTOCOL:
        raise Invalid(f"envelope: unsupported protocol {v!r}")
    kind = doc.get("kind")
    if kind not in KINDS:
        raise Invalid(f"envelope: unknown kind {kind!r}")
    written_at = doc.get("writtenAt")
    if not _is_number(written_at) or written_at < 0 or written_at > 2**32:
        raise Invalid("envelope: writtenAt must be epoch seconds")
    if "body" not in doc:
        raise Invalid("envelope: no body")
    return Envelope(kind, int(written_at), doc["body"])


def iso_utc(epoch: float) -> str:
    return datetime.fromtimestamp(int(epoch), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# =========================================================== config shaping

def shape_config(r: dict) -> dict:
    """Port of shapeConfig() in src/lib/ea-payload.ts."""
    return {
        "configured": True,
        "configVersion": r["config_version"],
        "isActive": r["is_active"],
        "dailyLossLimit": r["daily_loss_limit"],
        "maxTradesPerDay": r["max_trades_per_day"],
        "maxOpenPositions": r["max_open_positions"],
        "riskPerTradePercent": r["risk_per_trade_percent"],
        "sessions": {
            "london": r["session_london_enabled"],
            "newYork": r["session_new_york_enabled"],
            "asian": r["session_asian_enabled"],
            "londonNyOverlap": r["session_london_ny_overlap_enabled"],
            "customStart": r["custom_session_start"],
            "customEnd": r["custom_session_end"],
            "timezone": r["timezone"],
        },
    }


def inbox_core(rules_row: dict | None) -> dict:
    """What the EA needs to know, shaped like the /api/ea/sync response."""
    if rules_row is None:
        return {"v": PROTOCOL, "configured": False, "configVersion": None}
    return {
        "v": PROTOCOL,
        "configured": True,
        "configVersion": rules_row["config_version"],
        "config": shape_config(rules_row),
    }


# =========================================================== filesystem

O_DIR = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)


def _open_dir(parent_fd: int, name: str, *, create: bool, uid: int | None, gid: int | None) -> int:
    try:
        return os.open(name, O_DIR, dir_fd=parent_fd)
    except FileNotFoundError:
        if not create:
            raise
    try:
        os.mkdir(name, 0o755, dir_fd=parent_fd)
    except FileExistsError:
        pass
    fd = os.open(name, O_DIR, dir_fd=parent_fd)
    if uid is not None and os.geteuid() == 0:
        os.fchown(fd, uid, gid)
    return fd


class BridgeDirs:
    """Descriptors for tf_bridge/{out,in,bad} inside one volume, or unavailable.

    Holding descriptors, not paths, is the point: once a directory is open, the
    container renaming or replacing it cannot redirect what we read or delete.
    """

    def __init__(self, volume: str, *, create: bool, uid: int | None = 911, gid: int | None = 911):
        self._fds: list[int] = []
        self.out = self.inbox = self.bad = -1
        try:
            fd = os.open(volume, O_DIR)
            self._fds.append(fd)
            for part in MQL5_FILES:  # never create MT5's own tree
                fd = os.open(part, O_DIR, dir_fd=fd)
                self._fds.append(fd)
            root = _open_dir(fd, BRIDGE_DIR, create=create, uid=uid, gid=gid)
            self._fds.append(root)
            for attr, name in (("out", "out"), ("inbox", "in"), ("bad", "bad")):
                sub = _open_dir(root, name, create=create, uid=uid, gid=gid)
                self._fds.append(sub)
                setattr(self, attr, sub)
        except OSError:
            self.close()
            raise

    def close(self):
        for fd in reversed(self._fds):
            try:
                os.close(fd)
            except OSError:
                pass
        self._fds.clear()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def read_regular(dir_fd: int, name: str, max_bytes: int = MAX_FILE_BYTES) -> bytes:
    """Read a plain file by name. Symlinks, FIFOs and devices are refused."""
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | getattr(os, "O_CLOEXEC", 0)
    try:
        fd = os.open(name, flags, dir_fd=dir_fd)
    except OSError as e:
        if isinstance(e, FileNotFoundError):
            raise
        raise Invalid(f"cannot open safely: {e.strerror}") from None
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            raise Invalid("not a regular file")
        if st.st_size > max_bytes:
            raise Invalid("file too large")
        chunks, total = [], 0
        while True:
            chunk = os.read(fd, max_bytes + 1 - total)
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if total > max_bytes:
                raise Invalid("file too large")
        return b"".join(chunks)
    finally:
        os.close(fd)


def list_outbox(out_fd: int) -> list[str]:
    """Report files in the order the EA wrote them (names start with epoch time)."""
    return sorted(n for n in os.listdir(out_fd) if n.endswith(".json"))


def write_inbox(inbox_fd: int, payload: bytes, *, uid: int | None = 911, gid: int | None = 911,
                now: float | None = None) -> int:
    """Atomically replace config.json; returns the mtime it was given.

    The EA notices changes by modification time, which it reads in whole
    seconds, so two writes inside one second would look like one. Each write
    therefore gets an mtime strictly later than the file it replaces.
    """
    now = int(time.time() if now is None else now)
    try:
        prev = os.stat(INBOX_NAME, dir_fd=inbox_fd, follow_symlinks=False).st_mtime
        mtime = max(now, int(prev) + 1)
    except FileNotFoundError:
        mtime = now
    tmp = INBOX_NAME + ".agent-tmp"
    try:
        os.unlink(tmp, dir_fd=inbox_fd)
    except FileNotFoundError:
        pass
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)
    fd = os.open(tmp, flags, 0o644, dir_fd=inbox_fd)
    try:
        view = memoryview(payload)
        while view:
            view = view[os.write(fd, view):]
        if uid is not None and os.geteuid() == 0:
            os.fchown(fd, uid, gid)
        os.utime(fd, (mtime, mtime))
    finally:
        os.close(fd)
    os.rename(tmp, INBOX_NAME, src_dir_fd=inbox_fd, dst_dir_fd=inbox_fd)
    return mtime


def quarantine(dirs: BridgeDirs, name: str, reason: str) -> None:
    """Keep a rejected report for inspection instead of retrying it forever."""
    try:
        os.rename(name, name, src_dir_fd=dirs.out, dst_dir_fd=dirs.bad)
    except FileNotFoundError:
        return
    except OSError:
        # Not renameable (e.g. a directory planted with a .json name): get it
        # out of the way so it can't block the queue.
        try:
            os.unlink(name, dir_fd=dirs.out)
        except OSError:
            pass
        return
    try:
        flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)
        fd = os.open(name + ".reason", flags, 0o644, dir_fd=dirs.bad)
        try:
            os.write(fd, reason.encode("utf-8", "replace")[:1000])
        finally:
            os.close(fd)
    except OSError:
        pass


def housekeep(dirs: BridgeDirs, now: float) -> None:
    for name in os.listdir(dirs.out):
        if not name.endswith(".tmp"):
            continue
        try:
            st = os.stat(name, dir_fd=dirs.out, follow_symlinks=False)
            if now - st.st_mtime > STALE_TMP_SECONDS:
                os.unlink(name, dir_fd=dirs.out)
        except OSError:
            pass
    bad = sorted(n for n in os.listdir(dirs.bad) if not n.endswith(".reason"))
    for name in bad[: max(len(bad) - MAX_BAD_FILES, 0)]:
        for n in (name, name + ".reason"):
            try:
                os.unlink(n, dir_fd=dirs.bad)
            except OSError:
                pass


# =========================================================== login watch
# MT5 states the outcome of every sign-in attempt in its own journal. Without
# reading it, a wrong server address or password is indistinguishable from
# "still starting" on the dashboard - forever.
LOGIN_LOGS = (".wine", "drive_c", "Program Files", "MetaTrader 5", "logs")


def login_state(volume: str) -> tuple[str, str] | None:
    """What MT5's journal says about signing in to the broker.

    ('ok', server name) or ('failed', reason) for the latest outcome; ('waiting',
    last network line) while it has neither; None if there is no journal yet.
    Reads the newest two days, so a sign-in just before midnight still counts.
    """
    d = os.path.join(volume, *LOGIN_LOGS)
    try:
        logs = sorted((os.path.join(d, n) for n in os.listdir(d) if n.endswith(".log")),
                      key=os.path.getmtime)[-2:]
    except OSError:
        return None
    if not logs:
        return None
    result, network = None, ""
    for path in logs:
        try:
            with open(path, "rb") as f:
                f.seek(0, os.SEEK_END)
                f.seek(max(f.tell() - 200_000, 0))  # the tail is enough; these grow all day
                text = f.read().decode("utf-16-le", "ignore")
        except OSError:
            continue
        for line in text.splitlines():
            low = line.lower()
            fields = line.split("\t")
            if len(fields) >= 5 and fields[3] == "Network":
                network = fields[4].strip()
            if "authorized on" in low:
                # "'111484503': authorized on ICMarketsSC-Demo through Access Point EU 0"
                # The server NAME is the one thing only the broker can tell us, and it
                # is how we learn which name lives at the address the trader picked.
                name = line.split("authorized on", 1)[1].split(" through")[0].strip()
                result = ("ok", name)
            elif "authorization" in low and "failed" in low:
                # "...: authorization on Broker-Server failed (Invalid account)"
                reason = line.split("failed", 1)[1].strip(" ()\t") or "rejected by the broker"
                result = ("failed", reason)
    return result or ("waiting", network)


# =========================================================== Supabase

class Transient(Exception):
    """Try again later; nothing about the file is wrong."""


class Rest:
    """Minimal PostgREST client. The website's supabase-js calls are the same
    HTTP requests against the same endpoints with the same service role."""

    def __init__(self, base_url: str, service_key: str, *, timeout: float = 8, session=None):
        import requests  # the agent already depends on it; tests inject a fake

        self._base = base_url.rstrip("/") + "/rest/v1/"
        self._timeout = timeout
        self._session = session or requests.Session()
        self._requests = requests
        self._headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }

    def request(self, method: str, table: str, *, params=None, body=None, prefer=None):
        headers = dict(self._headers)
        if prefer:
            headers["Prefer"] = prefer
        try:
            r = self._session.request(
                method, self._base + table, params=params,
                data=None if body is None else json.dumps(body, allow_nan=False),
                headers=headers, timeout=self._timeout,
            )
        except self._requests.RequestException as e:
            raise Transient(f"{method} {table}: {e.__class__.__name__}") from None
        try:
            payload = r.json() if r.content else None
        except ValueError:
            payload = r.text[:300]
        return r.status_code, payload


# Statuses that mean "this row can never be written as sent". Everything else
# (401/403 from a rotated key, 404 from a missing table, 5xx, 429) is a problem
# with the environment, and quarantining every report because of it would turn
# an outage into data loss.
_PERMANENT = {400, 409, 413, 422}


def _outcome(status: int, payload, what: str) -> str | None:
    """None on success; 'bad: ...' or 'retry: ...' otherwise."""
    if 200 <= status < 300:
        return None
    code = payload.get("code") if isinstance(payload, dict) else None
    detail = payload.get("message") if isinstance(payload, dict) else payload
    msg = f"{what} -> {status} {code or ''}: {str(detail)[:200]}"
    # PGRST2xx is PostgREST's schema cache lagging a migration by a few seconds:
    # a 400 that is really "not yet".
    permanent = status in _PERMANENT and not str(code or "").startswith("PGRST2")
    return ("bad: " if permanent else "retry: ") + msg


@dataclass
class Account:
    account_id: str
    user_id: str
    api_key_id: str | None
    revoked: bool = False
    retry_at: float = 0
    backoff: float = 0
    last_stamp: float = 0
    inbox_key: str | None = None
    inbox_written: float = 0
    inbox_bridge_at: float = 0
    inbox_retry_at: float = 0
    seq: int = 0


class Relay:
    """Writes one validated report to Supabase, as the matching route would."""

    def __init__(self, rest: Rest, log=print):
        self.rest = rest
        self.log = log

    def apply(self, acct: Account, env: Envelope, d: dict) -> str | None:
        handler = {
            "sync": self._report, "account": self._report, "trades": self._trade,
            "violations": self._violation, "events": self._event,
        }[env.kind]
        return handler(acct, env, d)

    # /api/ea/sync and /api/ea/account -> recordAccountReport()
    def _report(self, acct: Account, env: Envelope, d: dict) -> str | None:
        written = iso_utc(env.written_at)
        if "failedFetches" in d or "eaVersion" in d:
            try:
                status, payload = self.rest.request(
                    "PATCH", "mt5_instances", params={"account_id": f"eq.{acct.account_id}"},
                    body={
                        "ea_version": d.get("eaVersion"),
                        "ea_failed_fetches": d.get("failedFetches"),
                        "ea_last_http_status": d.get("lastHttpStatus"),
                        "ea_queued_posts": d.get("queuedPosts"),
                        "ea_from_cache": d.get("fromCache"),
                        "ea_backoff_seconds": d.get("backoffSeconds"),
                        # When the EA took the reading, not when we relayed it:
                        # after an agent restart the backlog must not look fresh.
                        "ea_reported_at": written,
                    },
                    prefer="return=minimal",
                )
                problem = _outcome(status, payload, "mt5_instances telemetry")
                if problem:
                    self.log(f"bridge {acct.account_id}: {problem} (best-effort, ignored)")
            except Transient as e:
                self.log(f"bridge {acct.account_id}: telemetry {e} (best-effort, ignored)")

        patch = {"current_equity": d["equity"]}
        if d.get("balance") is not None:
            patch["starting_balance"] = d["balance"]
        if "tradeBlock" in d:  # v1.27+; "" means the EA can trade again
            patch["ea_trade_block"] = d["tradeBlock"] or None
        status, payload = self.rest.request(
            "PATCH", "accounts", params={"id": f"eq.{acct.account_id}"},
            body=patch, prefer="return=minimal",
        )
        problem = _outcome(status, payload, "accounts update")
        if problem:
            return problem
        status, payload = self.rest.request(
            "POST", "account_snapshots",
            body={
                "user_id": acct.user_id,
                "account_id": acct.account_id,
                "equity": d["equity"],
                "balance": d.get("balance"),
                # Snapshot gaps are how the ops console measures EA downtime, so
                # a replayed backlog keeps the times the EA actually reported.
                "recorded_at": written,
            },
            prefer="return=minimal",
        )
        return _outcome(status, payload, "account_snapshots insert")

    def _find(self, table: str, column: str, acct: Account, value: str) -> bool:
        try:
            status, rows = self.rest.request(
                "GET", table,
                params={"select": "id", "account_id": f"eq.{acct.account_id}", column: f"eq.{value}"},
            )
        except Transient:
            return False  # same as the route: a failed lookup falls through to insert
        return status == 200 and isinstance(rows, list) and len(rows) > 0

    def _insert_once(self, table: str, row: dict, dedupe_column: str | None, acct: Account) -> str | None:
        value = row.get(dedupe_column) if dedupe_column else None
        if value is not None and self._find(table, dedupe_column, acct, value):
            return None  # already recorded: a retry of a report that landed
        status, payload = self.rest.request("POST", table, body=row, prefer="return=minimal")
        if status == 409 and isinstance(payload, dict) and payload.get("code") == "23505":
            return None  # lost the race against a concurrent copy of the same report
        return _outcome(status, payload, f"{table} insert")

    # /api/ea/trades
    def _trade(self, acct: Account, env: Envelope, d: dict) -> str | None:
        return self._insert_once("trades", {
            "user_id": acct.user_id,
            "account_id": acct.account_id,
            "symbol": d["symbol"],
            "direction": d["direction"],
            "entry_price": d["entryPrice"],
            "exit_price": d.get("exitPrice"),
            "quantity": d.get("quantity"),
            "pnl": d.get("pnl"),
            "entry_time": d["entryTime"],
            "exit_time": d.get("exitTime"),
            "source": "EA",
            "broker_deal_id": d.get("brokerDealId"),
        }, "broker_deal_id", acct)

    # /api/ea/violations
    def _violation(self, acct: Account, env: Envelope, d: dict) -> str | None:
        row = {
            "user_id": acct.user_id,
            "account_id": acct.account_id,
            "type": d["type"],
            "details": d.get("details", {}),
            "event_id": d.get("eventId"),
        }
        if d.get("occurredAt"):
            row["occurred_at"] = d["occurredAt"]
        if d.get("tradeId"):
            row["trade_id"] = d["tradeId"]
        return self._insert_once("violations", row, "event_id", acct)

    # /api/ea/events
    def _event(self, acct: Account, env: Envelope, d: dict) -> str | None:
        row = {
            "user_id": acct.user_id,
            "account_id": acct.account_id,
            "event_type": d["type"],
            "details": d.get("details", {}),
        }
        if d.get("occurredAt"):
            row["occurred_at"] = d["occurredAt"]
        return self._insert_once("ea_events", row, None, acct)

    def stamp_key(self, acct: Account, written_at: int) -> None:
        """api_keys.last_used_at drives the dashboard's "EA connected" badge."""
        if acct.api_key_id is None or written_at - acct.last_stamp < STAMP_EVERY_SECONDS:
            return
        acct.last_stamp = written_at
        iso = iso_utc(written_at)
        try:
            status, payload = self.rest.request(
                "PATCH", "api_keys",
                params={
                    "id": f"eq.{acct.api_key_id}",
                    # Never move it backwards when an old backlog is replayed.
                    "or": f'(last_used_at.is.null,last_used_at.lt."{iso}")',
                },
                body={"last_used_at": iso}, prefer="return=minimal",
            )
            problem = _outcome(status, payload, "api_keys stamp")
            if problem:
                self.log(f"bridge {acct.account_id}: {problem}")
        except Transient as e:
            self.log(f"bridge {acct.account_id}: api_keys stamp {e}")


# =========================================================== service

def _parse_enabled(spec: str | None):
    """TF_BRIDGE: 'off' (default), 'all', or comma-separated account ids."""
    spec = (spec or "off").strip()
    if spec.lower() in ("", "off", "0", "false", "no"):
        return set()
    if spec.lower() == "all":
        return None
    return {s.strip() for s in spec.split(",") if s.strip()}


class BridgeService:
    def __init__(self, rest: Rest, *, data_dir: str, host: str, enabled: str | None,
                 log=print, clock=time.time, uid: int | None = 911, gid: int | None = 911):
        self.rest = rest
        self.relay = Relay(rest, log)
        self.data_dir = data_dir
        self.host = host
        self.enabled = _parse_enabled(enabled)
        self.log = log
        self.clock = clock
        self.uid, self.gid = uid, gid

        self.accounts: dict[str, Account] = {}
        self.rules: dict[str, dict | None] = {}
        self.rules_ok_at = 0.0
        self.rules_watermark: datetime | None = None
        self._rules_full_ids: frozenset = frozenset()
        self._accounts_due = self._rules_due = self._rules_full_due = self._relay_due = 0.0
        self._housekeep_due = 0.0
        self._global_retry_at = 0.0
        self._warned: dict[str, float] = {}
        self.stop = threading.Event()

    @property
    def active(self) -> bool:
        return self.enabled is None or bool(self.enabled)

    def _warn(self, key: str, msg: str, every: float = 300):
        now = self.clock()
        if now - self._warned.get(key, 0) >= every:
            self._warned[key] = now
            self.log(msg)

    def volume(self, account_id: str) -> str:
        return os.path.join(self.data_dir, account_id)

    # ---------------------------------------------------------- accounts
    def refresh_accounts(self) -> None:
        status, rows = self.rest.request("GET", "mt5_instances", params={
            "select": "account_id,user_id,api_key_id",
            "server_host": f"eq.{self.host}",
            "desired_state": "eq.running",
        })
        if status != 200 or not isinstance(rows, list):
            raise Transient(f"mt5_instances -> {status}")
        wanted = {}
        for r in rows:
            acc = r.get("account_id") or ""
            if not _UUID.match(acc):
                continue
            if self.enabled is not None and acc not in self.enabled:
                continue
            wanted[acc] = r

        for acc in list(self.accounts):
            if acc not in wanted:
                del self.accounts[acc]
        for acc, r in wanted.items():
            cur = self.accounts.get(acc)
            if cur is None:
                self.accounts[acc] = Account(acc, r["user_id"], r.get("api_key_id"))
            else:
                cur.user_id, cur.api_key_id = r["user_id"], r.get("api_key_id")

        key_ids = sorted({a.api_key_id for a in self.accounts.values() if a.api_key_id})
        if key_ids:
            status, keys = self.rest.request("GET", "api_keys", params={
                "select": "id,revoked_at", "id": f"in.({','.join(key_ids)})",
            })
            if status == 200 and isinstance(keys, list):
                live = {k["id"] for k in keys if not k.get("revoked_at")}
                for a in self.accounts.values():
                    was = a.revoked
                    a.revoked = bool(a.api_key_id) and a.api_key_id not in live
                    if a.revoked and not was:
                        self.log(f"bridge {a.account_id}: EA key revoked - reports will be refused")

    # ---------------------------------------------------------- rules -> inbox
    def refresh_rules(self, now: float) -> None:
        ids = frozenset(self.accounts)
        if not ids:
            return
        full = (now >= self._rules_full_due or ids != self._rules_full_ids
                or self.rules_watermark is None)
        params = {"select": RULE_COLUMNS, "account_id": f"in.({','.join(sorted(ids))})"}
        if not full:
            since = self.rules_watermark - timedelta(seconds=RULES_OVERLAP_SECONDS)
            params["updated_at"] = f"gte.{since.isoformat()}"
        status, rows = self.rest.request("GET", "trading_rules", params=params)
        if status != 200 or not isinstance(rows, list):
            raise Transient(f"trading_rules -> {status}")
        if full:
            self.rules = {acc: None for acc in ids}
            self._rules_full_ids = ids
            self._rules_full_due = now + RULES_FULL_SECONDS
        for r in rows:
            if r.get("account_id") in ids:
                self.rules[r["account_id"]] = r
            try:
                seen = datetime.fromisoformat(r["updated_at"])
                if self.rules_watermark is None or seen > self.rules_watermark:
                    self.rules_watermark = seen
            except (KeyError, TypeError, ValueError):
                pass
        self.rules_ok_at = now

    def write_inboxes(self, now: float) -> None:
        for acc, a in self.accounts.items():
            if acc not in self.rules or now < a.inbox_retry_at:
                continue
            core = inbox_core(self.rules[acc])
            key = json.dumps(core, sort_keys=True)
            changed = key != a.inbox_key
            # Heartbeat only on news: bridgeAt means "confirmed against the
            # database at this time", so while Supabase is unreachable it must
            # stop moving and the EA must see the rules going stale.
            heartbeat = (self.rules_ok_at > a.inbox_bridge_at
                         and now - a.inbox_written >= INBOX_HEARTBEAT_SECONDS)
            if not (changed or heartbeat):
                continue
            doc = {**core, "bridgeAt": int(self.rules_ok_at), "seq": a.seq + 1}
            try:
                with BridgeDirs(self.volume(acc), create=True, uid=self.uid, gid=self.gid) as dirs:
                    write_inbox(dirs.inbox, json.dumps(doc, allow_nan=False).encode(),
                                uid=self.uid, gid=self.gid, now=now)
            except OSError as e:
                a.inbox_retry_at = now + 10
                self._warn(f"inbox:{acc}", f"bridge {acc}: cannot write rules file: {e}")
                continue
            if changed and a.inbox_key is not None:
                self.log(f"bridge {acc}: rules v{core.get('configVersion')} sent to terminal")
            a.inbox_key, a.inbox_written, a.inbox_bridge_at, a.seq = key, now, self.rules_ok_at, a.seq + 1

    # ---------------------------------------------------------- outbox -> Supabase
    def relay_account(self, a: Account, now: float) -> None:
        try:
            dirs = BridgeDirs(self.volume(a.account_id), create=True, uid=self.uid, gid=self.gid)
        except OSError:
            return  # MT5 not unpacked into the volume yet
        with dirs:
            if now >= self._housekeep_due:
                housekeep(dirs, now)
            for name in list_outbox(dirs.out)[:MAX_FILES_PER_PASS]:
                if not _OUTBOX_NAME.match(name):
                    quarantine(dirs, name, "unexpected file name")
                    continue
                try:
                    env = parse_envelope(read_regular(dirs.out, name))
                    data = validate(env.kind, env.body)
                    if env.written_at > now + MAX_CLOCK_AHEAD_SECONDS:
                        raise Invalid("writtenAt is in the future")
                    if env.written_at < now - MAX_AGE_SECONDS:
                        raise Invalid("writtenAt is more than 30 days old")
                except FileNotFoundError:
                    continue
                except Invalid as e:
                    self.log(f"bridge {a.account_id}: rejected {name}: {e}")
                    quarantine(dirs, name, str(e))
                    continue
                if a.revoked:
                    quarantine(dirs, name, "EA key revoked")
                    continue
                try:
                    problem = self.relay.apply(a, env, data)
                except Transient as e:
                    problem = f"retry: {e}"
                if problem is None:
                    try:
                        os.unlink(name, dir_fd=dirs.out)
                    except FileNotFoundError:
                        pass
                    a.backoff = 0
                    self.relay.stamp_key(a, env.written_at)
                    if env.kind == "sync":
                        self._check_rules_reached(a, env, data)
                    continue
                if problem.startswith("bad: "):
                    self.log(f"bridge {a.account_id}: refused {name}: {problem[5:]}")
                    quarantine(dirs, name, problem[5:])
                    continue
                # Keep order: nothing behind a report that failed goes first.
                a.backoff = min(max(a.backoff * 2, RELAY_SECONDS * 2), 60)
                a.retry_at = now + a.backoff
                self._global_retry_at = now + a.backoff
                self._warn(f"relay:{a.account_id}", f"bridge {a.account_id}: {problem} (retry in {a.backoff:.0f}s)", 60)
                return

    def _check_rules_reached(self, a: Account, env: Envelope, data: dict) -> None:
        """The EA says which rules version it enforces; it should match what we sent."""
        rules = self.rules.get(a.account_id)
        if rules is None or a.inbox_written == 0 or env.written_at - a.inbox_written < 120:
            return
        held = data.get("knownConfigVersion")
        if held is not None and held != rules["config_version"]:
            self._warn(f"stale:{a.account_id}",
                       f"bridge {a.account_id}: terminal enforces rules v{held} but v"
                       f"{rules['config_version']} was sent - is the EA in bridge mode?", 600)

    # ---------------------------------------------------------- loop
    def tick(self) -> None:
        now = self.clock()
        if now >= self._accounts_due:
            try:
                self.refresh_accounts()
                self._accounts_due = now + ACCOUNTS_REFRESH_SECONDS
            except Transient as e:
                self._accounts_due = now + 10
                self._warn("accounts", f"bridge: cannot list accounts: {e}", 60)
        if now >= self._rules_due:
            try:
                self.refresh_rules(now)
            except Transient as e:
                self._warn("rules", f"bridge: cannot read rules: {e}", 60)
            self._rules_due = now + RULES_POLL_SECONDS
        self.write_inboxes(now)
        if now >= self._relay_due and now >= self._global_retry_at:
            for a in list(self.accounts.values()):
                if now >= a.retry_at:
                    self.relay_account(a, now)
            if now >= self._housekeep_due:
                self._housekeep_due = now + 600
            self._relay_due = now + RELAY_SECONDS

    def run_forever(self) -> None:
        self.log(f"bridge up: host={self.host} enabled="
                 f"{'all' if self.enabled is None else ','.join(sorted(self.enabled)) or 'none'}")
        while not self.stop.is_set():
            try:
                self.tick()
            except Exception as e:  # noqa: BLE001 - the loop must outlive any one bug
                self._warn("tick", f"bridge: tick failed: {e.__class__.__name__}: {e}", 60)
            self.stop.wait(1)
