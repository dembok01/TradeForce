# Rebuilding the pool box from nothing

Contabo deleted the original server and every backup of it in October 2026.
This is the procedure that brought it back, written down so the second time
takes an afternoon instead of a week.

Everything here was run on the replacement box. Where something is unproven it
says so.

| Measured, 5 Nov 2026 | Value |
| --- | --- |
| Host | Ubuntu 24.04.5 LTS, kernel `7.0.0-42-generic`, 12 cores, 47 GB RAM |
| Docker | 29.9.2 |
| Images | `tf-mt5:ntsync` 13.1 GB, `tf-mt5:current` 8.97 GB, `gmag11/metatrader5_vnc:2.3` 6.71 GB |
| Data | `/srv/tf` 6.8 GB (per-account layers), `/srv/tf-base` 2.9 GB (shared prefix) |
| Units | `tf-agent.service`, `tf-prefixes.service` — both enabled and active |
| Agent | `/usr/local/bin/tf-agent` → `/opt/tradeforce/agent/tf_agent.py` |

---

## 1. Read this first: the five traps

Each of these cost at least half a day. None of them produces a useful error
message.

### 1.1 `tf-mt5:current` can never run a terminal

It ships stock Wine 10, which trips MetaTrader's anti-debug dialog. The dialog
is modal, so the terminal never starts and nothing says why. **Only
`tf-mt5:ntsync` can run a terminal.** `tf-mt5:current` is a build stage, not a
runtime. `TF_IMAGE` must be `tf-mt5:ntsync`.

### 1.2 `provision.sh` runs first, in its own container

```sh
docker run --rm -v /srv/tf/<id>:/config --entrypoint /opt/tf/provision.sh tf-mt5:ntsync
```

It is what installs `/config/tf.ini` to `C:\tf.ini`, and `MT5_CMD_OPTIONS`
points the terminal at `C:\tf.ini`. Skip this step and the terminal launches
into nothing: **no journal, no log file, no error anywhere** — just a container
that sits there with the VNC stack up and no `terminal64.exe`. It cannot be a
cont-init hook either: the base image starts MT5 from its own init path and
wins the race, finds no MetaTrader, and tries to reinstall it.

### 1.3 MQL5 compiles with the terminal, not MetaEditor

`MetaEditor64.exe /compile` does not work under Wine. That was established over
eight attempts; **do not try it again.** What works: drop the `.mq5` into the
terminal's `MQL5/Experts/`, start the terminal, and it compiles on startup in
about 40 seconds.

Two conditions:

- **Delete any matching `.ex5` first.** `provision.sh` copies the shipped
  `TradeForce.ex5` into `MQL5/Experts/`, and a binary newer than the source is
  exactly what makes the compiler skip it.
- Local headers go in `MQL5/Include/` — `TradeForce.mq5` needs `JAson.mqh`.

`/root/compile-ea.sh` on the box does all of this in a throwaway prefix. A
successful compile writes the `.ex5`; a failed one writes nothing, so the file's
existence is the test.

### 1.4 File modes do not survive a clean clone

`provision.sh` was tracked as `100644`. `COPY` preserves the source mode, so a
build from a fresh checkout produced an image whose every provision died with
`exec: "/opt/tf/provision.sh": permission denied`. It had only ever worked
because the original build host happened to have the bit set locally.

Fixed in two places, and both are needed: the file is `100755` in git, and
`Dockerfile.base` uses `COPY --chmod=0755`.

### 1.5 `MQL5/Presets/` does not exist in a fresh MetaTrader install

The terminal creates it the first time a preset is saved, so a prefix baked from
a clean install has no `Presets/`. A plain `install` of `tf.set` then fails with
ENOENT, which aborts `provision.sh` under `set -e` and leaves the trader on
"we couldn't start your terminal" permanently. `install -D` creates the leading
directories. This blocked a real trader on 1 Nov and would have blocked all
twelve.

---

## 2. The rebuild

### 2.1 Host prerequisites

ntsync is what lets one box run 40 terminals instead of 10, and **every WineHQ
package ships it disabled** — their build hosts have no `linux/ntsync.h`, so
`configure` compiles it out. So Wine is built from source, and the driver has to
exist on the host:

- Kernel **≥ 6.14** for the in-tree driver. Use the distro's own module, never
  an out-of-tree DKMS build: that taints the kernel and must be rebuilt on every
  kernel update, and a silently missing `/dev/ntsync` costs you the speed-up
  with no warning at all.
- `/etc/modules-load.d/ntsync.conf` containing `ntsync`, to load it at boot.
- `/etc/udev/rules.d/99-ntsync.rules` for the device mode. Verify:
  `crw-rw-rw- 1 root root 10, 262 /dev/ntsync`.

### 2.2 Wine with ntsync, then the images

```sh
# ntsync.h comes from THIS host's kernel headers, not a pinned .deb -
# the old pinned linux-libc-dev was gone from the archive when it was needed.
find /usr/src -name ntsync.h -exec cp {} /root/winebuild/ntsync.h \;

# 1. Wine from official source, ~40 min
docker run -d --name winebuild --entrypoint sleep -v /root/winebuild:/work tf-mt5:current infinity
docker exec winebuild bash /work/wine-ntsync-build.sh
docker exec winebuild tar -C /opt -cf /work/wine-ntsync.tar wine-ntsync

# 2. the image layer
docker build -f Dockerfile.ntsync -t tf-mt5:ntsync /root/winebuild
```

`configure` must print `HAVE_LINUX_NTSYNC_H 1` **and** a `SONAME_LIBGNUTLS`
line — without gnutls no terminal can reach a broker over TLS.

`tf-mt5:current` itself comes from `infra/mt5-image/Dockerfile.base`, which
pins the public base by digest. It needs four files beside it, and the image
contains exactly these (verified 5 Nov 2026):

```
provision.sh        2985 bytes, mode 0755
TradeForce.ex5    122844 bytes
mt5-prefix.tgz     1.13 GB
tfchart.tgz         5808 bytes
```

Note what is **not** there: `servers.dat`. `provision.sh` copies it when
present (`[ -s /opt/tf/servers.dat ]`) and silently skips it when it is not, so
a clean rebuild gets whatever `Config/servers.dat` is inside `mt5-prefix.tgz`
and no newer seed. Whether Exness-by-name still resolves after a rebuild
therefore depends on the baked prefix, and that is **unverified** — test it with
a throwaway login before telling an Exness trader the pool is back.

### 2.3 The prefix bake

`mt5-prefix.tgz` is a MetaTrader install captured under **the same Wine the
image ships**. If the image carries a newer Wine, every terminal upgrades the
prefix itself on first run and writes the whole of `C:\windows` into its own
overlay layer — 2.6 GB each, which defeats the sharing entirely. `ensure_base()`
does one headless `wineboot -u` after unpacking so this happens once.

### 2.4 The agent

```sh
install -D infra/pool-agent/tf_agent.py /opt/tradeforce/agent/tf_agent.py
# also tf_bridge.py, tf_prefixes.py, tf_search.py and the tests
ln -sfn /opt/tradeforce/agent/tf_agent.py /usr/local/bin/tf-agent
install -m 600 infra/pool-agent/tradeforce.env.example /etc/tradeforce.env  # then fill it in
install infra/pool-agent/tf-agent.service infra/pool-agent/tf-prefixes.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now tf-prefixes tf-agent
```

The symlink matters: `rollout-bridge.sh` installs and rolls back agent versions
by repointing it, so the unit must name the symlink and not the file.

`tf-prefixes.service` must come up **before** any container: a terminal that
starts on an unmounted prefix finds no MetaTrader and tries to reinstall it.

---

## 3. The secret you cannot get back

`MT5_CRED_KEY` is the AES-256-GCM key that every stored MT5 password is sealed
with. **Vercel environment variables marked sensitive are write-only** — the
dashboard and the API both return the variable with no value, and `vercel env
pull` cannot retrieve it either. It is not recoverable from Vercel, full stop.

If it is lost, every `mt5_password_cipher` and `ea_key_cipher` in the database is
permanently unreadable and **every trader must re-enter their password.** That
happened on 1 Nov 2026. The agent handles it gracefully — `InvalidTag` is caught
and the row is reported `login_failed` with a message asking the trader to
reconnect — but gracefully is still twelve traders doing manual work.

So: keep a copy somewhere you can actually read, outside Vercel.

Two related ordering rules:

- **Apply database migrations before deploying the web app.** `getPickerServers()`
  degrades to an almost-empty broker list if its select fails, and a column the
  deployed code selects but the database lacks is exactly that failure.
- **Changing an environment variable requires a redeploy.** The running
  deployment keeps the values it was built with. On 1 Nov the variable was
  updated while production still served a build 30 days older; without the
  redeploy the site would have sealed new passwords with the dead key.

---

## 4. Verifying it actually works

ntsync is the only one of these that keeps working silently when it is broken,
and the check has one trap of its own: **it must run inside the container.**

```sh
# INSIDE the container. On the host this returns 0 even when ntsync is fully
# engaged - the pids and fd links do not resolve the same way across the
# namespace, and that false zero was carried as an open "ntsync not engaged"
# bug for two sessions before it was measured properly.
docker exec tf-<account-id> sh -c '
  for p in $(pgrep -f "wineserver|terminal64"); do
    echo "$p $(ls -l /proc/$p/fd | grep -c ntsync) / $(ls /proc/$p/fd | wc -l)"
  done'
```

Measured on the live pool, 5 Nov 2026 — this is what healthy looks like:

| Process | ntsync fds | total fds |
| --- | --- | --- |
| `terminal64.exe` | 170 | 280 |
| `wineserver` | 980 | 1260 |

Zero in **both** means you are on the slow path with a Wine that cannot use the
driver. Check in order: `/dev/ntsync` exists on the host, the container got
`--device /dev/ntsync` (`docker inspect <name> --format '{{json .HostConfig.Devices}}'`),
and `readlink -f /opt/wine-stable` points at `/opt/wine-ntsync`.

The rest:

```sh
cd /opt/tradeforce/agent && python3 -m unittest discover -p "test_*.py"   # 143 tests
systemd-analyze verify /etc/systemd/system/tf-agent.service               # must be silent
journalctl -u tf-agent -n 50 --no-pager
```

A terminal is healthy when its journal shows `authorized on <server>`,
`expert TradeForce (TFCHART,M1) loaded successfully` and `terminal synchronized`,
and its `mt5_instances` row reads `status: running` with an `ea_version`.

---

## 5. Still not reproducible from this repository

Honest list of what a rebuild cannot regenerate:

- **`mt5-prefix.tgz`, `tfchart.tgz` and `servers.dat`** are binary payloads kept
  on the box, not in git. `tfchart.tgz` can be remade by running
  `ea/TFChartSetup.ex5` as a `[StartUp] Script=` in a demo terminal.
  `servers.dat` was seeded by a one-off "Open an Account → Exness" search and
  decrypts only against the prefix it was made in.
- **Adding a broker by server NAME.** MT5 resolves `Server=<name>` only from
  `Config/servers.dat`, and driving the terminal's own broker search to add one
  has never been shown to make a harvested name connectable — two attempts
  failed, and the obvious success signal is unreliable (`servers.dat` shifts by
  72 bytes whether or not anything was found). See the header of
  `infra/pool-agent/tf_search.py`. Addresses are the only mechanism that works.
- **There is one box.** Capacity 30, no second server, no failover. If it is
  lost, every hosted terminal is down until this document has been followed.

---

*Architecture: `infra/pool-agent/README.md`. Image rationale and the ntsync
measurements: `infra/mt5-image/README.md`. Funded accounts:
`FUNDED-ACCOUNTS.md` and `FUNDED-ACCOUNTS-IP.md`.*
