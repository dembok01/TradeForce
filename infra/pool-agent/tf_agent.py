#!/usr/bin/env python3
"""TradeForce pool agent.

Polls Supabase and makes local Docker match `desired_state`. Nothing pushes to
this server: no inbound port, no TLS cert, no shared token, no firewall rule.
If the agent dies, containers keep running; when it returns it reconciles. Safe
to restart at any time.

It also runs the file bridge (tf_bridge.py) for hosted EAs in bridge mode:
their reports and rules pass through here instead of the website.
"""
import base64
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Installed as a symlink in /usr/local/bin; tf_bridge.py sits next to the real file.
sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
import tf_bridge  # noqa: E402

SUPABASE = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
CRED_KEY = base64.b64decode(os.environ["MT5_CRED_KEY"])
IMAGE = os.environ.get("TF_IMAGE", "tf-mt5:current")
SITE_URL = os.environ.get("TF_SITE_URL", "https://trade-force-rouge.vercel.app")
CAPACITY = int(os.environ.get("TF_CAPACITY", "8"))
HOST = os.environ.get("TF_HOST", socket.gethostname())
DATA = os.environ.get("TF_DATA", "/srv/tf")
POLL = int(os.environ.get("TF_POLL", "15"))
# Which hosted EAs use the file bridge: "off", "all", or account ids, comma-separated.
BRIDGE = os.environ.get("TF_BRIDGE", "off")

AGENT_VERSION = "1.4.0"
TELEMETRY_EVERY = int(os.environ.get("TF_TELEMETRY_EVERY", "4"))  # passes; 4 x 15s = 60s

REST = f"{SUPABASE}/rest/v1/mt5_instances"
POOL_REST = f"{SUPABASE}/rest/v1/pool_servers"
H = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


def unseal(sealed: str) -> str:
    """iv.tag.ciphertext, each base64 - written by the web app's sealSecret()."""
    iv, tag, ct = (base64.b64decode(p) for p in sealed.split("."))
    return AESGCM(CRED_KEY).decrypt(iv, ct + tag, None).decode()


def sh(*args) -> str:
    return subprocess.run(args, capture_output=True, text=True).stdout.strip()


def containers() -> set:
    out = sh("docker", "ps", "-a", "--filter", "name=tf-", "--format", "{{.Names}}")
    return {n for n in out.splitlines() if n}


def report(account_id: str, **fields):
    fields["updated_at"] = "now()"
    try:
        requests.patch(f"{REST}?account_id=eq.{account_id}", headers=H, json=fields, timeout=15)
    except requests.RequestException as e:
        print(f"report failed for {account_id}: {e}", flush=True)


def bridge_enabled(account_id: str) -> bool:
    enabled = tf_bridge._parse_enabled(BRIDGE)
    return enabled is None or account_id in enabled


def write_config(row: dict, api_key: str) -> str:
    """Per-user startup config + EA inputs, into the volume the container mounts."""
    d = os.path.join(DATA, row["account_id"])
    os.makedirs(d, exist_ok=True)
    os.chmod(d, 0o700)

    ini = os.path.join(d, "tf.ini")
    with open(ini, "w") as f:
        f.write(
            "[Common]\n"
            f"Login={row['mt5_login']}\n"
            f"Password={unseal(row['mt5_password_cipher'])}\n"
            f"Server={row['mt5_server']}\n"
            "CertInstall=1\nNewsEnable=0\n\n"
            "[Experts]\nAllowLiveTrading=1\nAllowDllImport=0\nEnabled=1\nAccount=0\nProfile=0\n\n"
            # TFCHART is a custom symbol baked into the image (provision.sh):
            # it exists whatever the broker names EURUSD, and a chart symbol
            # that never syncs means the EA never starts. Needs tf-mt5 >= v128.
            "[StartUp]\nSymbol=TFCHART\nPeriod=M1\n"
            "Expert=TradeForce\nExpertParameters=tf.set\n"
        )
    os.chmod(ini, 0o600)

    st = os.path.join(d, "tf.set")
    with open(st, "w") as f:
        # CloudMode (EA v1.25+): one chart, lean Market Watch, no drawing - a
        # hosted terminal nobody watches. Measured: ~70% less CPU and wake-ups.
        # BridgeMode (EA v1.26+): no web requests at all; see tf_bridge.py.
        bridge = "BridgeMode=true\n" if bridge_enabled(row["account_id"]) else ""
        f.write(f"ServerUrl={SITE_URL}\nApiKey={api_key}\nCloudMode=true\n{bridge}")
    os.chmod(st, 0o600)
    return d


def running_key(account_id: str) -> str | None:
    """The EA key the existing container was started with, read back from its tf.set."""
    try:
        with open(os.path.join(DATA, account_id, "tf.set")) as f:
            for line in f:
                if line.startswith("ApiKey="):
                    return line[len("ApiKey="):].strip()
    except OSError:
        pass
    return None


def start(row: dict):
    """Provision then run. Provisioning is a separate one-shot container because
    the base image starts MT5 from its own init path and would race a hook."""
    name = "tf-" + row["account_id"]
    d = write_config(row, unseal(row["ea_key_cipher"]))

    subprocess.run(
        ["docker", "run", "--rm", "-v", f"{d}:/config",
         "--entrypoint", "/opt/tf/provision.sh", IMAGE],
        check=True, capture_output=True, text=True, timeout=900,
    )
    subprocess.run(
        ["docker", "run", "-d", "--name", name,
         "--restart", "unless-stopped",
         "--memory", "1g", "--cap-add", "SYS_PTRACE",
         # Wine's USB, game-controller and Bluetooth drivers poll for hardware a
         # container never has (~500-850 wake-ups/s). Registry Start=4 does not
         # stop them; a load override does.
         "-e", "WINEDLLOVERRIDES=winebus.sys,wineusb.sys,winebth.sys,winehid.sys=d",
         "-v", f"{d}:/config",
         "-e", r"MT5_CMD_OPTIONS=/config:C:\tf.ini",
         IMAGE],                      # deliberately no -p: VNC is never exposed
        check=True, capture_output=True, text=True, timeout=120,
    )


def remove(account_id: str):
    sh("docker", "rm", "-f", "tf-" + account_id)
    shutil.rmtree(os.path.join(DATA, account_id), ignore_errors=True)


# ---------------------------------------------------------------- telemetry
# The console cannot see this host any other way: the agent only ever makes
# outbound calls, so if it does not volunteer host health, nobody knows the box
# is sick. This exists because the server died on 8 Sep and stayed dead for
# three days without anyone noticing.

_cpu_prev = {}  # name -> (usage_usec, monotonic seconds)


def _cgroup(name: str) -> Path:
    cid = sh("docker", "inspect", "-f", "{{.Id}}", name)
    return Path(f"/sys/fs/cgroup/system.slice/docker-{cid}.scope")


def _field(path: Path, key: str):
    """One key out of a cgroup flat-keyed file."""
    try:
        for line in path.read_text().splitlines():
            k, _, v = line.partition(" ")
            if k == key:
                return int(v)
    except OSError:
        return None
    return None


def container_stats(name: str) -> dict:
    """Cores and RAM for one container, from cgroup counters.

    Deliberately NOT `docker stats`: it samples for a second per container and
    would stall the reconcile loop. cpu.usage_usec is cumulative, so cores is a
    delta between passes -- the first pass after a restart reports nothing
    rather than a meaningless average since boot.
    """
    g = _cgroup(name)
    out = {}

    mem = None
    try:
        mem = int((g / "memory.current").read_text().strip())
    except OSError:
        pass
    if mem is not None:
        out["mem_mb"] = round(mem / 1048576)

    usage = _field(g / "cpu.stat", "usage_usec")
    now = time.monotonic()
    if usage is not None:
        prev = _cpu_prev.get(name)
        _cpu_prev[name] = (usage, now)
        if prev and now > prev[1]:
            cores = (usage - prev[0]) / 1e6 / (now - prev[1])
            if cores >= 0:  # a restart resets the counter; skip that pass
                out["cpu_cores"] = round(cores, 2)

    insp = sh("docker", "inspect", "-f", "{{.RestartCount}} {{.State.StartedAt}}", name)
    parts = insp.split(None, 1)
    if len(parts) == 2:
        out["restarts"] = int(parts[0])
        out["started_at"] = parts[1]
    return out


def host_stats() -> dict:
    mem = {}
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            k, _, v = line.partition(":")
            mem[k] = int(v.split()[0])  # kB
    except OSError:
        pass
    try:
        disk_free = shutil.disk_usage(DATA).free // 1048576
    except OSError:
        disk_free = None

    running = sh("docker", "ps", "--filter", "name=tf-", "--format", "{{.Names}}")
    return {
        "host": HOST,
        "cores": os.cpu_count(),
        "ram_total_mb": mem.get("MemTotal", 0) // 1024 or None,
        "ram_free_mb": mem.get("MemAvailable", 0) // 1024 or None,
        "disk_free_mb": disk_free,
        # Recorded, never alerted on: we measured load 14.01 on a 4-core box
        # with every EA healthy and iowait at zero.
        "load_1m": round(os.getloadavg()[0], 2),
        "instances": len([n for n in running.splitlines() if n]),
        "capacity": CAPACITY,
        "image_tag": IMAGE,
        "agent_version": AGENT_VERSION,
        "last_seen_at": "now()",
    }


# ---------------------------------------------------------------- connection log
# Every step of a connection goes to connection_events: the trader's timeline
# on the Connect page, the admin inbox's "Connection problems", and the evidence
# (MT5's own journal lines) that says why - without an SSH session. Logged once
# per change of state, never once per poll.
EVENTS_REST = f"{SUPABASE}/rest/v1/connection_events"
_owners = {}   # account_id -> user_id, from the last reconcile pass
_rows = {}     # account_id -> mt5_instances row, from the last reconcile pass
_said = {}     # (account_id, topic) -> the state last logged for it
_quiet = True  # first check after a restart only learns current states


def event(acc: str, kind: str, level: str, message: str, detail: dict | None = None):
    user = _owners.get(acc)
    if not user:
        return
    body = {"account_id": acc, "user_id": user, "source": "agent", "kind": kind,
            "level": level, "message": message[:600]}
    if detail:
        body["detail"] = detail
    try:
        r = requests.post(EVENTS_REST, headers={**H, "Prefer": "return=minimal"}, json=body, timeout=15)
        if r.status_code >= 300:
            print(f"event {kind} for {acc} refused: {r.status_code} {r.text[:200]}", flush=True)
    except requests.RequestException as e:
        print(f"event {kind} for {acc} failed: {e}", flush=True)


def changed(acc: str, topic: str, value: str, action: bool = False) -> bool:
    """True the first time this topic takes this value for the account.

    Observations made in the first check after an agent restart are learned
    silently (they were logged before the restart); actions - a claim, a
    start, a failed setup - are logged whenever they happen."""
    if _said.get((acc, topic)) == value:
        return False
    _said[(acc, topic)] = value
    return action or not _quiet


def forget(acc: str):
    """A rebuilt or removed terminal starts its story again."""
    for k in [k for k in _said if k[0] == acc]:
        del _said[k]
    _login_reported.pop(acc, None)


def evidence(acc: str) -> dict:
    return {"journal": tf_bridge.evidence(os.path.join(DATA, acc))}


def seconds_since(iso: str | None) -> float | None:
    if not iso:
        return None
    try:
        t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    return (datetime.now(timezone.utc) - t).total_seconds()


# What the dashboard shows when a sign-in is rejected: it is the most likely
# failure for a self-serve user, and MT5 is the only thing that knows.
_login_reported = {}

# A good sign-in shows in the journal within 1-2 minutes of the container
# starting. Past this with no answer at all, the address is almost certainly
# wrong or unreachable - and MT5 just keeps retrying without ever saying so.
LOGIN_PATIENCE = 8 * 60

# The EA reports every ~60s through the bridge; past this it has gone quiet.
QUIET_AFTER = 5 * 60

READ_ONLY = ("Signed in, but this login can't trade - it looks like the investor (read-only) "
             "password. Connect again with your main trading password.")


def uptime_seconds(name: str) -> float | None:
    out = sh("docker", "inspect", "-f", "{{.State.StartedAt}}", name)
    try:
        started = datetime.strptime(out[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return (datetime.now(timezone.utc) - started).total_seconds()


def check_connections():
    """Every running terminal, once a minute: signed in? EA started? protecting?"""
    global _quiet
    for name in containers():
        if not name.startswith("tf-"):
            continue
        acc = name[3:]
        try:
            check_one(acc, name)
        except Exception as e:  # noqa: BLE001 - one broken volume must not blind the rest
            print(f"connection check failed for {acc}: {e}", flush=True)
    _quiet = False


def check_one(acc: str, name: str):
    vol = os.path.join(DATA, acc)
    state = tf_bridge.login_state(vol)

    if state is None or state[0] == "waiting":
        # Only a container that has never been heard to sign in, and only in
        # its first day: login_state reads two days of journal, so an older
        # healthy terminal can simply have no sign-in line left to find.
        if acc in _login_reported:
            return
        up = uptime_seconds(name)
        if up is None or not LOGIN_PATIENCE < up < 86_400:
            return
        _login_reported[acc] = "silent"
        said = state[1] if state and state[1] else ""
        print(f"no answer from the broker for {acc} after {int(up)}s: {said or 'journal silent'}", flush=True)
        detail = ("Your broker's server has not answered for 8 minutes"
                  + (f" (MetaTrader says: {said[:160]})" if said else "")
                  + ". The server is probably wrong - pick your broker and the exact server your "
                    "account is on (it's in your broker's account email or client area), then connect again.")
        report(acc, status="login_failed", status_detail=detail)
        if changed(acc, "login", "silent"):
            event(acc, "no_answer", "error", detail, evidence(acc))
        return

    if state[0] == "failed":
        if _login_reported.get(acc) != "failed":
            _login_reported[acc] = "failed"
            print(f"login rejected for {acc}: {state[1]}", flush=True)
            report(acc, status="login_failed",
                   status_detail=f"Your broker refused the sign-in ({state[1]}). Check the account "
                                 "number, the trading password (not the investor one) and that you "
                                 "picked the server your account is on.")
        if changed(acc, "login", "failed:" + state[1]):
            event(acc, "login_refused", "warn", f"Your broker refused the sign-in ({state[1]}).",
                  {"reason": state[1], **evidence(acc)})
        return

    server = state[1]
    if _login_reported.get(acc) != "ok":
        # The server name confirms to the trader that they picked the right
        # one, and teaches us which name answers at that address.
        _login_reported[acc] = "ok"
        print(f"login ok for {acc}: {server or 'server name not logged'}", flush=True)
        report(acc, status="running", status_detail=f"Connected to {server}" if server else None)
    if changed(acc, "login", "ok"):
        event(acc, "signed_in", "info", f"Signed in to {server or 'your broker'}.")

    mode = tf_bridge.trading_mode(vol)
    if mode and not mode[0]:
        report(acc, status="login_failed", status_detail=READ_ONLY)
        if changed(acc, "trading", "disabled"):
            event(acc, "read_only", "warn", READ_ONLY, {"mt5": mode[1], **evidence(acc)})
        return

    ea = tf_bridge.ea_start(vol)
    if ea and ea[0] in ("failed", "removed"):
        why = ea[1] or "removed from its chart"
        report(acc, status="error",
               status_detail=f"Signed in to {server or 'your broker'}, but TradeForce could not start "
                             f"on the terminal (MetaTrader: {why}). Our team has been alerted - you "
                             "don't need to do anything.")
        if changed(acc, "ea", "failed:" + why):
            print(f"EA failed to start for {acc}: {why}", flush=True)
            event(acc, "ea_failed", "error", f"TradeForce could not start on your terminal ({why}). "
                  "Our team has been alerted.", {"reason": why, **evidence(acc)})
        return

    # Protection = the EA's own reports arriving (the bridge stamps them).
    row = _rows.get(acc) or {}
    age = seconds_since(row.get("ea_reported_at"))
    up = uptime_seconds(name)
    reporting = age is not None and age < QUIET_AFTER and (up is None or age < up + 60)
    if reporting:
        _said[(acc, "ea")] = "ok"
        was = _said.get((acc, "protection"))
        if changed(acc, "protection", "active"):
            event(acc, "protected" if was != "quiet" else "resumed", "info",
                  "Protection is active - TradeForce is watching your trades."
                  if was != "quiet" else "Protection resumed.")
        if row.get("status") == "error":
            report(acc, status="running", status_detail=f"Connected to {server}" if server else None)
    elif _said.get((acc, "protection")) == "active" and changed(acc, "protection", "quiet"):
        event(acc, "quiet", "warn", "Your terminal stopped reporting. It usually recovers by itself "
              "within a few minutes; we're watching it.", evidence(acc))


def report_telemetry():
    """Best-effort: telemetry must never break reconciliation."""
    try:
        requests.post(
            POOL_REST,
            headers={**H, "Prefer": "resolution=merge-duplicates"},
            json=host_stats(),
            timeout=15,
        )
    except requests.RequestException as e:
        print(f"host telemetry failed: {e}", flush=True)

    check_connections()

    for name in containers():
        if not name.startswith("tf-"):
            continue
        try:
            stats = container_stats(name)
            if stats:
                report(name[3:], **stats)
        except Exception as e:  # noqa: BLE001
            print(f"container telemetry failed for {name}: {e}", flush=True)


def reconcile():
    r = requests.get(
        f"{REST}?or=(server_host.eq.{HOST},server_host.is.null)&select=*",
        headers=H, timeout=20,
    )
    r.raise_for_status()
    rows = r.json()
    have = containers()
    mine = [x for x in rows if x["server_host"] == HOST]
    for x in rows:
        _owners[x["account_id"]] = x["user_id"]
    _rows.clear()
    _rows.update({x["account_id"]: x for x in mine})

    for row in rows:
        acc = row["account_id"]
        name = "tf-" + acc

        # Claim unassigned work only if there is room. One at a time: unpacking
        # the baked prefix is I/O heavy and parallel provisioning saturates the box.
        if row["server_host"] is None:
            if row["desired_state"] != "running":
                continue
            if len(mine) >= CAPACITY:
                if changed(acc, "setup", "queued", action=True):
                    event(acc, "queued", "warn", "All our servers are busy right now. You're in the queue "
                          "and will be connected automatically as soon as a place frees up.",
                          {"capacity": CAPACITY, "host": HOST})
                continue
            report(acc, server_host=HOST, status="provisioning")
            if changed(acc, "setup", "claimed", action=True):
                event(acc, "claimed", "info", "A server picked up your request and is preparing your terminal.")
            row["server_host"] = HOST
            mine.append(row)

        want = row["desired_state"]
        try:
            # Every press of "Connect" mints a new EA key, usually alongside a
            # corrected password. A container started with the old key still has
            # the old password too: rebuild it, or the trader waits on
            # "Connecting" for ever while MT5 retries the rejected login.
            old = running_key(acc) if want == "running" and name in have else None
            if old and old != unseal(row["ea_key_cipher"]):
                remove(acc)
                have.discard(name)
                forget(acc)
                print(f"new details for {name}, rebuilding", flush=True)
                event(acc, "new_details", "info", "New details received - restarting your terminal with them.")
            if want == "running" and name not in have:
                report(acc, status="provisioning")
                start(row)
                report(acc, status="running", status_detail=None)
                print(f"started {name}", flush=True)
                if changed(acc, "setup", "started", action=True):
                    event(acc, "terminal_started", "info",
                          f"Your terminal is running and signing in to {row['mt5_server']}.")
                return  # one provision per pass, then re-poll
            if want == "stopped" and name in have:
                sh("docker", "rm", "-f", name)
                report(acc, status="stopped")
                event(acc, "stopped", "info", "Your terminal was stopped.")
            elif want == "removed" and (name in have or os.path.isdir(os.path.join(DATA, acc))):
                remove(acc)
                report(acc, status="removed", server_host=None)
                print(f"removed {name}", flush=True)
                event(acc, "removed", "info", "Your terminal was turned off and removed.")
                forget(acc)
        except subprocess.CalledProcessError as e:
            detail = (e.stderr or str(e))[:400]
            setup_failed(acc, detail)
            print(f"ERROR {name}: {detail}", flush=True)
        except Exception as e:  # noqa: BLE001 - never let one row kill the loop
            setup_failed(acc, str(e)[:400])
            print(f"ERROR {name}: {e}", flush=True)


# The trader gets a sentence; the raw Docker/provisioning output goes to the log
# for support. Before, stderr was shown on the Connect page as the "reason".
SETUP_FAILED = ("We couldn't start your terminal. Our team has been alerted and will fix it - "
                "you don't need to do anything.")


def setup_failed(acc: str, detail: str):
    report(acc, status="error", status_detail=SETUP_FAILED)
    if changed(acc, "setup", "failed", action=True):
        event(acc, "setup_failed", "error", SETUP_FAILED, {"error": detail, "host": HOST})


def selftest():
    """Round-trip the credential path - the one thing that must never break."""
    import secrets
    plain = "p@ssw0rd-" + secrets.token_hex(6)
    iv = os.urandom(12)
    blob = AESGCM(CRED_KEY).encrypt(iv, plain.encode(), None)
    sealed = ".".join(
        base64.b64encode(x).decode() for x in (iv, blob[-16:], blob[:-16])
    )
    assert unseal(sealed) == plain, "seal/unseal round-trip FAILED"
    print("selftest ok: AES-256-GCM round-trip matches the web app's format")


def log(msg: str):
    print(msg, flush=True)


def make_bridge() -> tf_bridge.BridgeService:
    return tf_bridge.BridgeService(
        tf_bridge.Rest(SUPABASE, SERVICE_KEY), data_dir=DATA, host=HOST, enabled=BRIDGE, log=log,
    )


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    if "--once" in sys.argv:
        reconcile()
        sys.exit(0)
    if "--telemetry" in sys.argv:
        report_telemetry()
        sys.exit(0)
    if "--bridge-once" in sys.argv:
        make_bridge().tick()
        sys.exit(0)
    print(
        f"tf-agent {AGENT_VERSION} up: host={HOST} capacity={CAPACITY} image={IMAGE} bridge={BRIDGE}",
        flush=True,
    )

    # The bridge runs beside reconcile, not inside it: provisioning a container
    # can hold reconcile for minutes, and reports must not wait behind that.
    bridge = make_bridge()
    bridge_thread = None
    if bridge.active:
        bridge_thread = threading.Thread(target=bridge.run_forever, name="bridge", daemon=True)
        bridge_thread.start()

    # systemd stops us with SIGTERM: let the bridge finish the report in hand
    # rather than die between writing it to the database and deleting its file.
    stopping = threading.Event()

    def on_term(signum, frame):
        stopping.set()
        bridge.stop.set()

    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGINT, on_term)

    pass_n = 0
    while not stopping.is_set():
        try:
            reconcile()
        except Exception as e:  # noqa: BLE001
            print("reconcile error:", e, flush=True)
        # Telemetry on its own slower cadence: reconcile runs every 15s, but the
        # console only needs host health once a minute and each pass is a write.
        if pass_n % TELEMETRY_EVERY == 0:
            report_telemetry()
        pass_n += 1
        if bridge_thread is not None and not bridge_thread.is_alive():
            print("bridge thread died - exiting so systemd restarts the agent", flush=True)
            sys.exit(1)
        stopping.wait(POLL)

    if bridge_thread is not None:
        bridge_thread.join(timeout=20)
    print("tf-agent stopped", flush=True)
