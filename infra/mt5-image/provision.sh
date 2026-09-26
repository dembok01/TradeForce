#!/bin/sh
# One-shot provisioning for a user's /config volume. Run with the image's
# entrypoint overridden, BEFORE the real container starts:
#
#   docker run --rm -v /srv/<id>:/config --entrypoint /opt/tf/provision.sh tf-mt5:current
#
# Doing it as a separate step (rather than a cont-init hook) is deliberate: the
# base image starts MT5 from its own init path, which races any hook we add and
# wins - it finds no MT5, tries to reinstall, and never launches the terminal.
set -eu
MT5="/config/.wine/drive_c/Program Files/MetaTrader 5"

# The WebRequest whitelist in Config/common.ini only decrypts against THIS
# prefix's MachineGuid, so the whole prefix ships together. Copying individual
# config files onto a freshly-installed MT5 fails with error 4014.
if [ ! -d "$MT5" ]; then
  echo "provision: unpacking baked prefix"
  tar xzf /opt/tf/mt5-prefix.tgz -C /config
fi

cp -f /opt/tf/TradeForce.ex5 "$MT5/MQL5/Experts/TradeForce.ex5"

# Brokers that publish no addresses (Exness) are connected by server NAME, and
# MT5 resolves a name only from Config/servers.dat. This one was seeded by a
# one-off "Open an Account -> Exness" search in a clone of this same prefix, so
# it decrypts here. Overwritten on every provision so a rebuild picks up a
# newer seed.
[ -f /opt/tf/servers.dat ] && cp -f /opt/tf/servers.dat "$MT5/Config/servers.dat"

# TFCHART: a custom symbol the EA chart opens on. A custom symbol lives in the
# terminal, so it exists whatever the broker calls its instruments - a fixed
# "EURUSD" chart never synced on Alpari MT5 demo or Exness Standard (EURUSDm),
# and an EA whose chart symbol never syncs never starts. Definition in
# Bases/symbols.custom.dat, 600 flat M1 bars in Bases/Custom/history/TFCHART.
[ -f /opt/tf/tfchart.tgz ] && tar xzf /opt/tf/tfchart.tgz -C "$MT5/Bases"

# A saved account would be wiped by MT5 anyway ("Accounts deleted due security
# reason"). Credentials arrive via tf.ini instead.
rm -f "$MT5/Config/accounts.dat"

# Per-user files the agent dropped in the volume root.
[ -f /config/tf.set ] && install -m 600 /config/tf.set "$MT5/MQL5/Presets/tf.set"
# C:\tf.ini is a proven path; don't rely on Wine's Z: mapping of the Linux root.
[ -f /config/tf.ini ] && install -m 600 /config/tf.ini /config/.wine/drive_c/tf.ini

# Only what is actually wrong: every terminal shares one prefix through
# overlayfs, and a blanket chown changes metadata on all 13,500 files, which
# copies every one of them into that terminal's own layer - 2.7GB each, which is
# the whole saving gone.
find /config \( ! -user 911 -o ! -group 911 \) -exec chown 911:911 {} +
echo "provision: ok"
