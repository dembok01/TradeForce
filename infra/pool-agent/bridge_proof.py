#!/usr/bin/env python3
"""Proof tooling for the file bridge. Not part of the running agent.

  db-shape   Sends one of every bridge write to the real Supabase, aimed at an
             account that does not exist. Updates must match zero rows and
             succeed; inserts must fail ONLY on the foreign key (23503). That
             proves every column name, type and enum value is accepted by the
             production schema, and nothing is written.

  run        Runs the bridge for one test terminal against a stand-in database:
             rules come from a JSON file you edit (a "dashboard change"), and
             writes are validated and appended to a JSONL log instead of sent.

    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python3 bridge_proof.py db-shape
    python3 bridge_proof.py run --data /root/bridge-proof/data --account <uuid> \\
        --rules rules.json --writes writes.jsonl
"""
import argparse
import json
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
import tf_bridge as b  # noqa: E402

HERE = os.path.dirname(os.path.realpath(__file__))


def ea_payloads() -> dict:
    """The "as EA v1.26 sends it" case of each kind, from the shared contract."""
    with open(os.path.join(HERE, "contract", "ea-payloads.json")) as f:
        cases = json.load(f)["cases"]
    out = {}
    for c in cases:
        if c["valid"] and "EA v1.26" in c["name"]:
            out.setdefault(c["kind"], c["body"])
    out.setdefault("account", out["sync"])
    return out


def db_shape() -> int:
    rest = b.Rest(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    relay = b.Relay(rest, log=lambda m: print("  log:", m))
    ghost = b.Account(str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4()))
    print(f"ghost account {ghost.account_id} (does not exist)")
    ok = True
    for kind, body in ea_payloads().items():
        data = b.validate(kind, body)
        result = relay.apply(ghost, b.Envelope(kind, int(time.time()), body), data)
        # sync/account update two rows (zero matched: fine) then insert a
        # snapshot; trades/violations/events are a lookup then an insert.
        good = result is not None and result.startswith("bad: ") and "23503" in result
        ok &= good
        print(f"{'PASS' if good else 'FAIL'} {kind:<10} {result}")
    relay.stamp_key(ghost, int(time.time()))
    status, _ = rest.request("GET", "api_keys", params={"select": "id", "id": f"eq.{ghost.api_key_id}"})
    print(f"{'PASS' if status == 200 else 'FAIL'} api_keys   stamp request accepted (status {status})")
    return 0 if ok and status == 200 else 1


class ProofRest:
    """Stands in for PostgREST: serves one account and a rules file, logs writes."""

    def __init__(self, account_id: str, rules_path: str, writes_path: str):
        self.account_id = account_id
        self.user_id = "00000000-0000-4000-8000-0000000000aa"
        self.key_id = "00000000-0000-4000-8000-0000000000bb"
        self.rules_path = rules_path
        self.writes = open(writes_path, "a", buffering=1)
        self.down_until = 0.0

    def request(self, method, table, *, params=None, body=None, prefer=None):
        if time.time() < self.down_until:
            raise b.Transient("simulated outage")
        if method == "GET" and table == "mt5_instances":
            return 200, [{"account_id": self.account_id, "user_id": self.user_id, "api_key_id": self.key_id}]
        if method == "GET" and table == "api_keys":
            return 200, [{"id": self.key_id, "revoked_at": None}]
        if method == "GET" and table == "trading_rules":
            with open(self.rules_path) as f:
                rules = json.load(f)
            rules = {**rules, "account_id": self.account_id}
            return 200, [rules] if rules.get("config_version") else []
        if method == "GET":
            return 200, []
        self.writes.write(json.dumps({"at": time.time(), "method": method, "table": table,
                                      "params": params, "body": body}) + "\n")
        return (201 if method == "POST" else 204), None


def run(args) -> int:
    rest = ProofRest(args.account, args.rules, args.writes)
    svc = b.BridgeService(rest, data_dir=args.data, host="proof", enabled=args.account,
                          log=lambda m: print(time.strftime("%H:%M:%S"), m, flush=True),
                          uid=911, gid=911)
    import signal
    signal.signal(signal.SIGTERM, lambda *_: svc.stop.set())
    svc.run_forever()
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("db-shape")
    r = sub.add_parser("run")
    r.add_argument("--data", required=True)
    r.add_argument("--account", required=True)
    r.add_argument("--rules", required=True)
    r.add_argument("--writes", required=True)
    a = p.parse_args()
    sys.exit(db_shape() if a.cmd == "db-shape" else run(a))
