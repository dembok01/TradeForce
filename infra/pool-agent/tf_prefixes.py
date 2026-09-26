"""One MT5 prefix on disk, a private writable view of it per terminal.

A provisioned prefix costs 2.9GB and about 2.6GB of that is byte-identical
between traders - Wine's own C:\\windows is 1.7GB of it, the MT5 install another
378MB. Twenty private copies do not fit on this box (58GB of prefixes plus 24GB
of images on a 96GB disk); twenty overlays on one shared copy cost the couple of
hundred MB each terminal actually writes - its broker history, its logs, its
config. Provisioning also stops being I/O heavy, because nothing is unpacked.

Layout per account under DATA:

    <acc>/tf.ini, tf.set    the container's /config root, exactly as before
    <acc>/.wine             overlay mount - the prefix the terminal sees
    <acc>/.wine-upper       everything this terminal has written
    <acc>/.wine-work        overlayfs bookkeeping
    <acc>/.wine-base        which shared copy it is layered on

The mount has to exist *before* the container starts: Docker takes a recursive
bind of <acc>, so a mount made afterwards would never appear inside it. That is
also why this runs from a boot unit ordered before docker.service - containers
restart themselves after a reboot, and would otherwise come up on an empty
prefix and try to reinstall MT5.
"""
import os
import subprocess
import sys
import time

DATA = os.environ.get("TF_DATA", "/srv/tf")
BASE = os.environ.get("TF_BASE", "/srv/tf-base")
# The image's own unprivileged user, which owns everything in the prefix.
UID = GID = 911


def base_dir(image: str, base: str = BASE) -> str:
    """Where the shared copy for one image tag lives.

    Keyed by tag, so moving the pool onto a new image builds a new shared copy
    rather than mixing two Wine versions in one prefix.
    """
    return os.path.join(base, image.replace("/", "-").replace(":", "-"))


def paths(account_id: str, data: str = DATA) -> dict:
    d = os.path.join(data, account_id)
    return {"root": d, "merged": os.path.join(d, ".wine"),
            "upper": os.path.join(d, ".wine-upper"), "work": os.path.join(d, ".wine-work"),
            "stamp": os.path.join(d, ".wine-base")}


def mounted(path: str) -> bool:
    return os.path.ismount(path)


def mount(account_id: str, lower: str, data: str = DATA) -> bool:
    """Give one account a private writable view of `lower`. True if it mounted.

    Idempotent: an already-mounted prefix is left alone, so this is safe to run
    on every reconcile pass and at boot.
    """
    p = paths(account_id, data)
    if mounted(p["merged"]):
        return False
    if not os.path.isdir(lower):
        raise FileNotFoundError(f"shared prefix missing: {lower}")
    for key in ("upper", "work", "merged"):
        os.makedirs(p[key], exist_ok=True)
    # The terminal writes as 911; the lower layer already belongs to it.
    for key in ("upper", "merged"):
        try:
            os.chown(p[key], UID, GID)
        except OSError:
            pass
    with open(p["stamp"], "w") as f:
        f.write(lower + "\n")
    subprocess.run(
        ["mount", "-t", "overlay", "overlay", "-o",
         f"lowerdir={lower},upperdir={p['upper']},workdir={p['work']}", p["merged"]],
        check=True, capture_output=True, text=True,
    )
    return True


def unmount(account_id: str, data: str = DATA) -> bool:
    """Detach the view before anything deletes the account's directory.

    Without this, removing an account would recurse into a live mount: overlayfs
    never deletes from the lower layer, but the mount would be left behind and
    the directory could not go away.
    """
    p = paths(account_id, data)
    if not mounted(p["merged"]):
        return False
    # The container has just been removed, so the mount should be idle, but
    # docker's own teardown can still hold it for a moment.
    for attempt in range(3):
        r = subprocess.run(["umount", p["merged"]], capture_output=True, text=True)
        if r.returncode == 0:
            return True
        if attempt < 2:
            time.sleep(2)
    raise OSError(f"cannot detach {p['merged']}: {r.stderr.strip()}")


def remount_all(data: str = DATA) -> list:
    """Restore every account's prefix at boot. Returns what it mounted."""
    done = []
    try:
        accounts = sorted(os.listdir(data))
    except OSError:
        return done
    for acc in accounts:
        p = paths(acc, data)
        if not os.path.isdir(p["upper"]) or mounted(p["merged"]):
            continue
        try:
            with open(p["stamp"]) as f:
                lower = f.read().strip()
        except OSError:
            print(f"tf-prefixes: {acc} has no base recorded, skipping", file=sys.stderr)
            continue
        try:
            if mount(acc, lower, data):
                done.append(acc)
        except (OSError, subprocess.CalledProcessError) as e:
            print(f"tf-prefixes: {acc} failed: {e}", file=sys.stderr)
    return done


if __name__ == "__main__":
    got = remount_all()
    print(f"tf-prefixes: mounted {len(got)} prefix(es)" + (": " + ", ".join(got) if got else ""))
