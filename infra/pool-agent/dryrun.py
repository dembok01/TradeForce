#!/usr/bin/env python3
"""Monday dry run: a real self-serve signup, provisioned and then removed.

Creates exactly the rows the app creates (auth user -> account -> charter ->
Cloud EA key -> mt5_instances), lets the live agent provision it, and checks
what the user's dashboard would show. Then repeats with a WRONG password to
prove the "Login failed" message reaches them. Everything is deleted at the end.

    python3 dryrun.py good|bad|both
"""
import base64
import hashlib
import json
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request

SUPABASE = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
CRED_KEY = base64.b64decode(os.environ["MT5_CRED_KEY"])
DATA = os.environ.get("TF_DATA", "/srv/tf")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

# The MetaQuotes demo account the capacity and proof runs use; a real trial
# user supplies their own. Its password lives only on the pool server.
_line = next(l for l in open("/root/runtest.sh") if "Login=10012085487" in l)
DEMO = {"Login": "10012085487", "Server": "MetaQuotes-Demo",
        "Password": _line.split("Password=", 1)[1].split("\\n", 1)[0]}
EA_VERSION = "1.28"


def api(method, path, body=None, headers=None, base="/rest/v1/"):
    req = urllib.request.Request(SUPABASE + base + path, method=method,
                                 data=None if body is None else json.dumps(body).encode(),
                                 headers={**H, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def seal(plain: str) -> str:
    """Same format as the web app's sealSecret(): iv.tag.ciphertext, base64."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    iv = os.urandom(12)
    blob = AESGCM(CRED_KEY).encrypt(iv, plain.encode(), None)
    return ".".join(base64.b64encode(x).decode() for x in (iv, blob[-16:], blob[:-16]))


def log(msg):
    print(f"[{time.strftime('%H:%M:%S', time.gmtime())}] {msg}", flush=True)


def signup(password_ok: bool):
    tag = f"dryrun-{int(time.time())}"
    email = f"{tag}@example.com"
    status, user = api("POST", "users", {"email": email, "password": secrets.token_urlsafe(16),
                                         "email_confirm": True}, base="/auth/v1/admin/")
    assert status in (200, 201), f"create user: {status} {user}"
    uid = user["id"]
    log(f"user {email} ({uid[:8]}…)")

    status, acc = api("POST", "accounts", {"user_id": uid, "name": "Dry run", "is_primary": True},
                      {"Prefer": "return=representation"})
    assert status == 201, f"account: {status} {acc}"
    acc_id = acc[0]["id"]

    status, _ = api("POST", "trading_rules", {
        "user_id": uid, "account_id": acc_id, "daily_loss_limit": 500,
        "max_trades_per_day": 3, "max_open_positions": 2, "risk_per_trade_percent": 1,
        "session_london_enabled": True, "timezone": "UTC", "is_active": True,
    })
    assert status == 201, f"rules: {status}"

    raw_key = "tf_live_" + secrets.token_hex(24)
    status, key = api("POST", "api_keys", {
        "user_id": uid, "account_id": acc_id, "label": "Cloud EA", "key_prefix": raw_key[:16],
        "key_hash": hashlib.sha256(raw_key.encode()).hexdigest(),
    }, {"Prefer": "return=representation"})
    assert status == 201, f"api key: {status} {key}"

    status, _ = api("POST", "mt5_instances", {
        "account_id": acc_id, "user_id": uid,
        "mt5_login": DEMO["Login"],
        "mt5_server": DEMO["Server"],
        "mt5_password_cipher": seal(DEMO["Password"] if password_ok else "definitely-wrong-password"),
        "ea_key_cipher": seal(raw_key),
        "api_key_id": key[0]["id"],
        "desired_state": "running", "status": "pending",
    })
    assert status == 201, f"instance: {status}"
    log(f"enabled cloud protection ({'correct' if password_ok else 'WRONG'} password), account {acc_id}")
    return uid, acc_id


def instance(acc_id):
    _, rows = api("GET", f"mt5_instances?account_id=eq.{acc_id}&select=status,status_detail,server_host,ea_version,ea_reported_at")
    return rows[0] if rows else {}


def watch(acc_id, want, minutes):
    """Wait for a status, printing each change the dashboard would show."""
    last = None
    for _ in range(minutes * 6):
        row = instance(acc_id)
        state = (row.get("status"), row.get("status_detail"))
        if state != last:
            log(f"  dashboard: {state[0]}{' - ' + state[1] if state[1] else ''}")
            last = state
        if row.get("status") == want:
            return row
        time.sleep(10)
    return instance(acc_id)


def connection_log(acc_id, want_kind, minutes):
    """The trader's connection log, once `want_kind` has been logged (or on timeout)."""
    steps = []
    for _ in range(minutes * 6):
        _, steps = api("GET", f"connection_events?account_id=eq.{acc_id}&select=at,source,kind,level,message,detail&order=at.asc")
        if isinstance(steps, list) and any(s["kind"] == want_kind for s in steps):
            break
        time.sleep(10)
    steps = steps if isinstance(steps, list) else []
    for st in steps:
        log(f"  log: {st['at'][11:19]} {st['source']:5} {st['level']:5} {st['kind']:16} {st['message']}")
        for line in ((st.get("detail") or {}).get("journal") or [])[-3:]:
            log(f"         | {line}")
    return [st["kind"] for st in steps]


def cleanup(uid, acc_id):
    api("PATCH", f"mt5_instances?account_id=eq.{acc_id}", {"desired_state": "removed"})
    for _ in range(30):
        if instance(acc_id).get("status") == "removed":
            break
        time.sleep(10)
    gone = not os.path.isdir(os.path.join(DATA, acc_id))
    api("DELETE", f"mt5_instances?account_id=eq.{acc_id}")
    api("DELETE", f"users/{uid}", base="/auth/v1/admin/")
    log(f"cleaned up: volume removed={gone}, user deleted")


def run_good():
    log("=== dry run: correct credentials")
    uid, acc_id = signup(True)
    row = watch(acc_id, "running", 15)
    ok = row.get("status") == "running"
    if ok:
        vol = os.path.join(DATA, acc_id)
        for _ in range(60):  # the EA itself, then a relayed report
            _, snaps = api("GET", f"account_snapshots?account_id=eq.{acc_id}&select=recorded_at&limit=1")
            if snaps:
                break
            time.sleep(10)
        ea = subprocess.run(["bash", "-c", f'. /root/cap-lib.sh; mt5log "{vol}" experts | cut -f3,5 | head -4'],
                            capture_output=True, text=True).stdout.strip()
        _, snaps = api("GET", f"account_snapshots?account_id=eq.{acc_id}&select=equity,recorded_at&order=recorded_at.desc&limit=1")
        _, keys = api("GET", f"api_keys?account_id=eq.{acc_id}&select=last_used_at")
        row = instance(acc_id)
        log(f"  EA journal:\n{ea}" if ea else "  EA journal: not flushed to disk yet (MT5 writes it in batches)")
        log(f"  first equity report: {snaps}")
        log(f"  dashboard EA badge (last_used_at): {keys[0]['last_used_at'] if keys else None}")
        log(f"  telemetry: ea_version={row.get('ea_version')} detail={row.get('status_detail')!r}")
        # A relayed equity report IS the proof: it can only have arrived as a
        # file the agent picked up, which means the EA ran in bridge mode. The
        # journal is written minutes late, so it can't be part of the verdict.
        ok = bool(snaps) and row.get("ea_version") == EA_VERSION
    kinds = connection_log(acc_id, "protected", 5)
    logged = all(k in kinds for k in ("claimed", "terminal_started", "signed_in", "protected"))
    log(f"RESULT good-credentials: {'PASS' if ok else 'FAIL'} | connection log: {'PASS' if logged else 'FAIL'}")
    ok = ok and logged
    cleanup(uid, acc_id)
    return ok


def run_bad():
    log("=== dry run: wrong password (what a mistyped broker login looks like)")
    uid, acc_id = signup(False)
    row = watch(acc_id, "login_failed", 15)
    ok = row.get("status") == "login_failed"
    kinds = connection_log(acc_id, "login_refused", 3)
    logged = "login_refused" in kinds
    log(f"RESULT wrong-password: {'PASS' if ok else 'FAIL'} - {row.get('status')}: {row.get('status_detail')}"
        f" | connection log: {'PASS' if logged else 'FAIL'}")
    ok = ok and logged
    cleanup(uid, acc_id)
    return ok


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "both"
    results = []
    if what in ("good", "both"):
        results.append(run_good())
    if what in ("bad", "both"):
        results.append(run_bad())
    log("DRY RUN DONE: " + ("all passed" if all(results) else "SOMETHING FAILED"))
    sys.exit(0 if all(results) else 1)
