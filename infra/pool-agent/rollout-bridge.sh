#!/bin/bash
# Move hosted EAs onto the file bridge, one client at a time, on the pool server.
#
#   rollout-bridge.sh install                 agent v1.3 in place of v1.2, bridge still off
#   rollout-bridge.sh roll <account-id>...    EA v1.26 in bridge mode, verified, rolled back on failure
#   rollout-bridge.sh gaps <hours> <id>...    the 48h gate: equity-report gaps longer than 5 minutes
#   rollout-bridge.sh uninstall               back to agent v1.2 (run after rolling EAs back)
#
# Expects, next to this script: tf_agent.py, tf_bridge.py, test_tf_bridge.py, contract/,
# and the compiled EA at /root/build/TradeForce.ex5.
#
# Evidence must be newer than the restart (the lesson of the Stage A rollout):
# every check below compares against a timestamp taken before the swap.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
AGENT_DIR=/opt/tradeforce/agent
OLD_AGENT=/opt/tradeforce/agent-v1.2/tf-agent
ENV=/etc/tradeforce.env
EX5=/root/build/TradeForce.ex5
set -a; . $ENV; set +a
TS=$(date -u +%Y%m%d-%H%M%S)
log() { echo "[$(date -u +%H:%M:%S)] $*"; }

rest() {  # rest <table?query>
  curl -s --max-time 15 -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/rest/v1/$1"
}
mt5log() {  # mt5log <volume> terminal|experts -> today's log as UTF-8
  local base="$1/.wine/drive_c/Program Files/MetaTrader 5" f
  if [ "$2" = experts ]; then base="$base/MQL5/logs"; else base="$base/logs"; fi
  f=$(ls -t "$base"/*.log 2>/dev/null | head -1)
  [ -n "$f" ] && iconv -f UTF-16LE -t UTF-8 "$f" 2>/dev/null | tr -d '\000\r'
}
cpu_usec() { awk '/^usage_usec/{print $2}' "/sys/fs/cgroup/system.slice/docker-$(docker inspect -f '{{.Id}}' "$1").scope/cpu.stat"; }

bridge_list() { sed -n 's/^TF_BRIDGE=//p' $ENV | tail -1; }
set_bridge_list() {
  if grep -q '^TF_BRIDGE=' $ENV; then sed -i "s/^TF_BRIDGE=.*/TF_BRIDGE=$1/" $ENV; else echo "TF_BRIDGE=$1" >> $ENV; fi
}
add_bridge() {
  local cur; cur=$(bridge_list)
  case ",$cur," in *",$1,"*) return ;; esac
  if [ -z "$cur" ] || [ "$cur" = off ]; then set_bridge_list "$1"; else set_bridge_list "$cur,$1"; fi
}
remove_bridge() {
  local out; out=$(bridge_list | tr ',' '\n' | grep -v -x "$1" | paste -sd, -)
  set_bridge_list "${out:-off}"
}

agent_up() {  # agent_up <since epoch> -> the restarted agent reported in
  local since=$1
  for i in $(seq 1 30); do
    if journalctl -u tf-agent --since "@$since" --no-pager 2>/dev/null | grep -qE "tf-agent 1\.3(\.[0-9]+)? up"; then
      rest "pool_servers?select=agent_version&host=eq.$TF_HOST" | grep -q '"1\.3' && return 0
    fi
    sleep 5
  done
  return 1
}

install_agent() {
  log "running the bridge tests on this machine"
  (cd "$HERE" && python3 -m unittest test_tf_bridge 2>&1 | tail -3) | grep -q '^OK' || { log "tests FAILED - nothing installed"; return 1; }
  mkdir -p $AGENT_DIR "$(dirname $OLD_AGENT)"
  [ -L /usr/local/bin/tf-agent ] || cp -n /usr/local/bin/tf-agent $OLD_AGENT
  install -m 755 "$HERE/tf_agent.py" $AGENT_DIR/tf_agent.py
  install -m 644 "$HERE/tf_bridge.py" $AGENT_DIR/tf_bridge.py
  python3 $AGENT_DIR/tf_agent.py --selftest || return 1
  grep -q '^TF_BRIDGE=' $ENV || echo "TF_BRIDGE=off" >> $ENV
  local t; t=$(date -u +%s)
  ln -sfn $AGENT_DIR/tf_agent.py /usr/local/bin/tf-agent
  systemctl restart tf-agent
  if agent_up "$t"; then log "agent v1.3 running, bridge=$(bridge_list)"; return 0; fi
  log "agent v1.3 did not come up - restoring v1.2"
  uninstall_agent
  return 1
}

uninstall_agent() {
  [ -f $OLD_AGENT ] || { log "no saved v1.2 at $OLD_AGENT"; return 1; }
  rm -f /usr/local/bin/tf-agent && install -m 755 $OLD_AGENT /usr/local/bin/tf-agent
  systemctl restart tf-agent
  log "agent v1.2 restored: $(systemctl is-active tf-agent)"
}

inbox_ok() {  # inbox_ok <account-id> <volume> -> agent is writing current rules for it
  local F="$2/.wine/drive_c/Program Files/MetaTrader 5/MQL5/Files/tf_bridge/in/config.json" db
  db=$(rest "trading_rules?select=config_version&account_id=eq.$1" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r[0]["config_version"] if r else "none")')
  for i in $(seq 1 12); do
    if [ -f "$F" ] && python3 - "$F" "$db" <<'EOF'
import json, sys, time
d = json.load(open(sys.argv[1]))
want = None if sys.argv[2] == "none" else int(sys.argv[2])
sys.exit(0 if time.time() - d["bridgeAt"] < 60 and d["configVersion"] == want else 1)
EOF
    then log "rules file current (v$db)"; return 0; fi
    sleep 5
  done
  log "rules file missing or not current (database has v$db)"
  return 1
}

verify_ea() {  # verify_ea <account-id> <volume> <since HH:MM:SS> <since ISO>   (max 20 min)
  local id=$1 vol=$2 since=$3 since_iso=$4 out row
  out="$vol/.wine/drive_c/Program Files/MetaTrader 5/MQL5/Files/tf_bridge/out"
  for i in $(seq 1 80); do
    row=$(rest "mt5_instances?select=ea_version,ea_reported_at&account_id=eq.$id")
    if mt5log "$vol" experts | awk -F'\t' -v s="$since" '$3 > s' | grep -aq "bridge mode - reports" &&
       mt5log "$vol" experts | awk -F'\t' -v s="$since" '$3 > s' | grep -aq "config loaded" &&
       python3 - "$row" "$since_iso" "$out" <<'EOF'
import json, os, sys, time
r = json.loads(sys.argv[1])[0]
backlog = [n for n in os.listdir(sys.argv[3]) if n.endswith(".json") and time.time() - int(n[:10]) > 120]
sys.exit(0 if r["ea_version"] == "1.26" and (r["ea_reported_at"] or "") > sys.argv[2] and not backlog else 1)
EOF
    then return 0; fi
    sleep 15
  done
  return 1
}

rollback_ea() {  # rollback_ea <account-id> <volume>
  local id=$1 vol=$2 M="$2/.wine/drive_c/Program Files/MetaTrader 5"
  log "rolling $id back to its previous EA"
  cp "$vol/TradeForce.ex5.bak-$TS" "$M/MQL5/Experts/TradeForce.ex5"
  cp "$vol/tf.set.bak-$TS" "$vol/tf.set"
  cp "$vol/tf.set.preset.bak-$TS" "$M/MQL5/Presets/tf.set"
  chown 911:911 "$M/MQL5/Experts/TradeForce.ex5" "$vol/tf.set" "$M/MQL5/Presets/tf.set"
  docker restart "tf-$id" >/dev/null
  remove_bridge "$id"
  systemctl restart tf-agent
  log "rolled back; bridge list now $(bridge_list)"
}

roll() {  # roll <account-id>
  local id=$1 name=tf-$1 vol=/srv/tf/$1 since since_iso a b
  local M="$vol/.wine/drive_c/Program Files/MetaTrader 5"
  log "=== $name"
  [ -d "$M" ] && docker inspect "$name" >/dev/null 2>&1 || { log "no such hosted terminal"; return 1; }
  readlink /usr/local/bin/tf-agent | grep -q $AGENT_DIR || { log "agent v1.3 not installed - run install first"; return 1; }

  # 1. The agent serves this account before the EA ever looks for it.
  add_bridge "$id"
  systemctl restart tf-agent
  inbox_ok "$id" "$vol" || { remove_bridge "$id"; systemctl restart tf-agent; return 1; }

  # 2. Swap the EA and switch it to bridge mode.
  cp "$M/MQL5/Experts/TradeForce.ex5" "$vol/TradeForce.ex5.bak-$TS"
  cp "$vol/tf.set" "$vol/tf.set.bak-$TS"
  cp "$M/MQL5/Presets/tf.set" "$vol/tf.set.preset.bak-$TS"
  install -m 644 -o 911 -g 911 $EX5 "$M/MQL5/Experts/TradeForce.ex5"
  for f in "$vol/tf.set" "$M/MQL5/Presets/tf.set"; do
    grep -q '^BridgeMode=' "$f" || printf 'BridgeMode=true\n' >> "$f"
    chown 911:911 "$f"; chmod 600 "$f"
  done
  since=$(date -u +%H:%M:%S); since_iso=$(date -u +%Y-%m-%dT%H:%M:%S)
  docker restart "$name" >/dev/null
  log "restarted at $since; waiting for bridge mode, rules, and a relayed report newer than that (max 20 min)"

  # 3. Proven or rolled back.
  if ! verify_ea "$id" "$vol" "$since" "$since_iso"; then
    log "FAILED verification"
    mt5log "$vol" experts | awk -F'\t' -v s="$since" '$3 > s' | cut -f3,5 | tail -8
    journalctl -u tf-agent --since "-20 min" --no-pager | grep bridge | tail -5
    rollback_ea "$id" "$vol"
    return 1
  fi
  mt5log "$vol" terminal | awk -F'\t' -v s="$since" '$3 > s && /authorized on/' | cut -f3,5 | tail -1
  mt5log "$vol" experts | awk -F'\t' -v s="$since" '$3 > s && /bridge mode|config loaded/' | cut -f3,5 | tail -2
  a=$(cpu_usec "$name"); sleep 60; b=$(cpu_usec "$name")
  log "cpu $(python3 -c "print(round(($b-$a)/60e6, 2))") cores; bad files: $(ls "$M/MQL5/Files/tf_bridge/bad" | grep -c '\.json$')"
  return 0
}

gaps() {  # gaps <hours> <account-id>...
  local hours=$1; shift
  local since; since=$(date -u -d "-$hours hours" +%Y-%m-%dT%H:%M:%S)
  for id in "$@"; do
    rest "account_snapshots?select=recorded_at&account_id=eq.$id&recorded_at=gte.$since&order=recorded_at.asc&limit=10000" |
      python3 -c '
import json, sys
from datetime import datetime
rows = [datetime.fromisoformat(r["recorded_at"]) for r in json.load(sys.stdin)]
gaps = [(a, b) for a, b in zip(rows, rows[1:]) if (b - a).total_seconds() > 300]
print(f"'"$id"': {len(rows)} reports, {len(gaps)} gap(s) over 5 min")
for a, b in gaps: print(f"   {a:%m-%d %H:%M} -> {b:%H:%M} ({(b - a).total_seconds() / 60:.0f} min)")
sys.exit(1 if gaps or not rows else 0)'
  done
}

case "${1:-}" in
  install) install_agent ;;
  uninstall) uninstall_agent ;;
  roll)
    shift
    for id in "$@"; do
      roll "$id" || { log "ABORT at $id - remaining clients left untouched"; exit 1; }
      log "$id healthy on the bridge"
    done
    log "ROLLOUT DONE - now watch: $0 gaps 48 $*" ;;
  gaps) shift; gaps "$@" ;;
  *) sed -n '2,9p' "$0"; exit 2 ;;
esac
