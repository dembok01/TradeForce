# The hosted-terminal image, and why it is built this way

One hosted MT5 terminal used to cost ~0.5 of a core in trading hours, of which
**89% was kernel time**. The box (12 vCPU, KVM guest) felt full at 9-10
terminals while averaging 30% CPU. Profiling found the reason, and two changes
removed most of it. Measured 25-26 Sep 2026 on contabo-1.

## Where the CPU went

`perf` on a terminal, before any of this:

```
75% of samples in the kernel; top symbol __pv_queued_spin_lock_slowpath
  wineserver → epoll_wait → do_epoll_wait → ep_poll
             → _raw_spin_lock_irq → __pv_queued_spin_lock_slowpath   (10.9%)
```

Every Windows wait inside MT5 became a `writev`/`read` round trip to
`wineserver`, and each one touched that one epoll wait-queue lock. On a KVM
guest a contended lock takes the paravirt slow path, so the cost grew faster
than the terminal count - which is why extrapolating from 10 terminals never
worked. `wineserver` alone was ~45% of a terminal's CPU and produced nothing.

MT5 makes this worse than average: its `custom history` / `history symbol`
worker is a busy-wait loop (`getrusage` → `sched_yield` → one wineserver round
trip, repeat), ~0.07 of a core per terminal on its own.

## The two changes

**1. ntsync, which needs a Wine built for it.** Wine calls this "inproc sync":
`wineserver` creates the sync objects, then clients wait with
`ioctl(NTSYNC_IOC_WAIT_ANY)` directly on `/dev/ntsync`, never touching the
server. Upstream has it since Wine 10.15, but **every WineHQ package ships it
disabled** - their build hosts have no `linux/ntsync.h`, so `configure` compiles
it out. Verified: no `ntsync` strings in WineHQ stable 11.0 *or* staging 11.10.

So Wine is built from official source with that one header present
(`wine-ntsync-build.sh`), and the driver has to exist:

- kernel **>= 6.14** for the in-tree driver. This box runs Ubuntu's HWE
  `7.0.0-34`, whose `ntsync.ko` is distro-signed and in-tree. Do not use an
  out-of-tree DKMS build: it taints the kernel and must be rebuilt on every
  kernel update, and a silently missing `/dev/ntsync` just costs you the
  speed-up with no warning.
- `/etc/modules-load.d/ntsync.conf` to load it, and a udev rule for the mode.
- the device handed to each container (`--device /dev/ntsync`, which
  `tf_agent.ntsync_args()` does when the box has one).

Check it is really in use - this is the only honest test, since everything keeps
working silently if it is not:

```sh
docker exec <container> sh -c 'ls -l /proc/*/fd 2>/dev/null' | grep -c ntsync
# a live terminal holds >1000 fds on /dev/ntsync; zero means you are on the
# slow path with a Wine that cannot use it
```

**2. One shared prefix.** A provisioned prefix is 2.9GB and ~2.6GB of it is
identical between traders (Wine's own `C:\windows` is 1.7GB). Twenty private
copies do not fit on a 96GB disk; twenty overlayfs views of one copy cost what
each terminal actually writes. See `tf_prefixes.py`.

The trap: anything that touches *metadata* on the shared files copies the whole
file into that terminal's layer, because this kernel has `metacopy=N`. This
script's old `chown -R 911:911 /config` did exactly that - 13,518 files, 2.7GB
per terminal, the entire saving gone - so it now chowns only what is actually
wrong. If per-account `.wine-upper` is ever hundreds of files or >1GB, look for
a new recursive `chown`/`chmod`/`touch` first.

Also: the baked prefix carries whichever Wine built it. If the image's Wine is
newer, every terminal updates the prefix itself on first run and writes all of
`C:\windows` into its own layer, so `tf_agent.ensure_base()` runs `wineboot -u`
against the shared copy once.

## Results

Per terminal, same workload, markets closed:

| Stack | cores/terminal | sys | ctx/s (10 terminals) |
|---|---|---|---|
| kernel 6.8, Wine 10 | 0.387 | 0.346 | 20,752 |
| kernel 7.0, Wine 10 | 0.320 | 0.293 | 18,600 |
| kernel 7.0, Wine 11 + ntsync | **0.116** | 0.101 | 7,797 |

The kernel upgrade alone is -17%. ntsync measured as a paired same-window A/B
(3 clones each, identical prefixes): **0.187 -> 0.108, -42%**, and
`__pv_queued_spin_lock_slowpath` fell from ~25% of samples to 1.6%.

Per-account disk: **2.9GB -> ~520MB** (65 files in the upper layer, not 13,518).

## Rebuilding

```sh
# 1. Wine, from official source, with ntsync compiled in (~40 min)
docker run -d --name winebuild --entrypoint sleep -v /root/winebuild:/work tf-mt5:current infinity
docker exec winebuild bash /work/winebuild.sh          # wine-ntsync-build.sh here
docker exec winebuild tar -C /opt -cf /work/wine-ntsync.tar wine-ntsync

# 2. the image layer
docker build -f Dockerfile.ntsync -t tf-mt5:ntsync /root/winebuild

# 3. roll it out: the agent rebuilds any terminal whose image differs
sed -i 's|^TF_IMAGE=.*|TF_IMAGE=tf-mt5:ntsync|' /etc/tradeforce.env
systemctl restart tf-agent      # one terminal per poll, so the pool drains gently
```

`configure` must print `HAVE_LINUX_NTSYNC_H 1` and a `SONAME_LIBGNUTLS` line -
without gnutls no terminal can reach a broker over TLS.
