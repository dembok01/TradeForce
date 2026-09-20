#!/bin/bash
# Verify candidate MT5 server addresses WITHOUT credentials.
#
# "authorization ... failed (Invalid account)" = we reached a real MT5 server.
# "no connection to X"                          = wrong address (a website, or nothing).
# Nothing ever ships unverified - a wrong address fails at login with a message
# the user cannot act on.
#
# Usage: verify-brokers.sh <candidates.tsv>   (columns: broker <tab> host:port)
set -uo pipefail
. /root/cap-lib.sh
IN=${1:?candidates file}
OUT=/root/broker-verify.tsv
WORKERS=4
: > $OUT

verify_one() {  # verify_one <slot> <broker> <address>
  local slot=$1 broker=$2 addr=$3 d=/root/bv/$1 name=bv-$1
  docker rm -f $name >/dev/null 2>&1
  mountpoint -q $d/merged && umount $d/merged
  rm -rf $d && mkdir -p $d/upper $d/work $d/merged
  mount -t overlay overlay -o lowerdir=/root/cap/tplA,upperdir=$d/upper,workdir=$d/work $d/merged || return 1
  sed -e '/^Expert/d' -e '/^Script/d' -e "s|^Login=.*|Login=5000000|" -e "s|^Password=.*|Password=not-a-real-password|" \
      -e "s|^Server=.*|Server=$addr|" /root/cap/tplA/.wine/drive_c/tf.ini > $d/merged/.wine/drive_c/tf.ini
  rm -f "$d/merged/.wine/drive_c/Program Files/MetaTrader 5/Config/accounts.dat" \
        "$d/merged/.wine/drive_c/Program Files/MetaTrader 5"/logs/*.log
  chown 911:911 $d/merged/.wine/drive_c/tf.ini
  docker run -d --name $name --memory 1g \
    -e 'WINEDLLOVERRIDES=winebus.sys,wineusb.sys,winebth.sys,winehid.sys=d' \
    -e 'MT5_CMD_OPTIONS=/config:C:\tf.ini' -v $d/merged:/config tf-mt5:current >/dev/null
  local verdict=timeout evidence=""
  for i in $(seq 1 24); do
    sleep 5
    evidence=$(mt5log $d/merged terminal | grep -aiE "authoriz|no connection|invalid account" | tail -1 | cut -f5)
    case "$evidence" in
      *"no connection"*) verdict=unreachable; break ;;
      *authoriz*|*"Invalid account"*) verdict=REACHED; break ;;
    esac
  done
  printf '%s\t%s\t%s\t%s\n' "$broker" "$addr" "$verdict" "${evidence:0:110}" >> $OUT
  docker rm -f $name >/dev/null 2>&1
  umount $d/merged; rm -rf $d
}
export -f verify_one
export CAP

n=0
while IFS=$'\t' read -r broker addr; do
  [ -z "$addr" ] && continue
  slot=$((n % WORKERS))
  ( verify_one "$slot" "$broker" "$addr" ) &
  n=$((n + 1))
  [ $((n % WORKERS)) -eq 0 ] && wait
done < "$IN"
wait
echo "=== verified (reached a real MT5 server):"
sort $OUT | awk -F'\t' '$3=="REACHED"{printf "  %-18s %-40s %s\n", $1, $2, $4}'
echo "=== not MT5 servers:"
sort $OUT | awk -F'\t' '$3!="REACHED"{printf "  %-18s %-40s %s\n", $1, $2, $3}'
echo "VERIFY DONE: $(grep -c REACHED $OUT) of $(wc -l < $OUT) candidates are real MT5 servers"
