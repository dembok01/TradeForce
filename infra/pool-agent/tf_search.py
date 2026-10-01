"""Teach a terminal about a broker it has never heard of.

MetaTrader resolves `Server=<name>` only for names already in its own encrypted
Config/servers.dat, and the shipped file knows almost nothing: probed 1 Oct 2026,
ICMarketsSC-Demo, Pepperstone-Demo, Tickmill-Demo and HFMarketsGlobal-Demo 4 all
came back "the terminal never opened a connection" - including IC Markets, which
we connect to daily by address and whose name MetaTrader itself reported back.

The only way to add one is the terminal's own "Open an Account -> Find your
company" search, which asks MetaQuotes for the broker and writes the answer into
servers.dat. There is no file format to author, no API, and no list to download:
servers.dat and dnsperf.dat are encrypted, the built-in MCP server (build 6182)
exposes no broker tools, and the published datasets carry names without
addresses. So we drive the window.

Driving it is safe as long as it stops where it should. The same wizard's NEXT
page opens a real account with a real broker; this module never clicks Next and
never touches it. It types in the search box, presses "Find your company", and
cancels. Nothing is registered and no money or identity is involved.

STATUS 1 Oct 2026: NOT WORKING END TO END. Do not wire this up yet.

Driving the window by hand works - searching "Pepperstone" returned "Pepperstone
EU Limited" with its logo and server group, which is MetaQuotes' directory
answering. What is NOT established is the step the whole idea rests on: that a
company added this way makes its servers reachable as Server=<name>. Two tests
with REAL server names say it does not.

  ICMarketsSC-Demo (the name MetaTrader itself reports for the IC Markets
  address we connect to daily): no connection attempt before the search, a
  "hit" on the search, no connection attempt after.
  HFMarketsGlobal-Demo 4: same.

And the detector below is unsound. servers.dat is rewritten by merely
interacting with the wizard: every search so far, hit or miss, moved it by
exactly 72 bytes, including "ICMarketsSC" as a company name, which no directory
would carry. So a changed digest means "the wizard was touched", not "the broker
was found", and search_aliases() returns a hit it has not earned.

What this needs before it can be trusted: a success signal taken from the
company LIST actually showing a new company (pixel comparison of that region, or
OCR), and then one confirmed case of a harvested name connecting. Until that
second thing is shown at least once, the premise is unproven - it may be that
servers only land in servers.dat when the wizard is taken through its account
page, which this module deliberately will not do.

The alias logic above is sound and tested, and is useful on its own: it is what
turned "HFM" into "HF Markets Global", which is a real company and is what a
human would have had to guess.
"""

from __future__ import annotations

import hashlib
import os
import re
import subprocess
import time

# The wizard is laid out for a 1024x768 Xvnc, which is what every pool container
# runs, so these are stable. They are read off the real window (1 Oct 2026); if
# MetaTrader ever moves them, searches stop finding anything and the admin is
# told "not found" rather than something wrong being catalogued.
MENU_FILE = (21, 40)
MENU_OPEN_ACCOUNT = (76, 206)
SEARCH_BOX = (445, 232)
FIND_BUTTON = (779, 232)
CANCEL_BUTTON = (809, 637)

SERVERS_DAT = ("drive_c", "Program Files", "MetaTrader 5", "Config", "servers.dat")

# How long MetaQuotes gets to answer one search before we try the next alias.
SEARCH_WAIT = 12


def servers_dat(vol: str) -> str:
    return os.path.join(vol, ".wine", *SERVERS_DAT)


def digest(path: str) -> str | None:
    """Fingerprint servers.dat, or None if it isn't there yet."""
    try:
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return None


# Server names are the broker's name with a suffix: ICMarketsSC-Demo,
# Pepperstone-Demo, HFMarketsGlobal-Demo 4, Alpari-MT5-Demo.
_SUFFIX = re.compile(r"[-_ ](demo|live|real|trial|mt[45])\b.*$", re.I)
# "HFMarketsGlobal" -> HF / Markets / Global, "ICMarketsSC" -> IC / Markets / SC.
_WORDS = re.compile(r"[A-Z]+(?![a-z])|[A-Z][a-z]+|[a-z]+|\d+")


def _words(s: str) -> list[str]:
    return _WORDS.findall(s)


def aliases(broker: str | None, server_name: str | None) -> list[str]:
    """What to type into "Find your company", best guess first.

    The brand a trader uses is often not what MetaQuotes registered: searching
    "hfm" found nothing on 1 Oct 2026 though HFM is listed on MetaQuotes' own
    broker page, so the registered name is something longer. The server name is
    the better clue, because the broker chose it - HFMarketsGlobal-Demo 4 yields
    "HF Markets Global", then "HF Markets", which is what a directory would file
    them under.

    Deliberately only a handful: each one costs a round trip to MetaQuotes, and
    an LLM can add more for the long tail (see alias_prompt).
    """
    out: list[str] = []

    def add(s: str) -> None:
        s = " ".join(s.split()).strip()
        # One letter matches half the directory; two is already marginal.
        if len(s) >= 3 and s.lower() not in {o.lower() for o in out}:
            out.append(s)

    if broker:
        add(broker)

    if server_name:
        stem = _SUFFIX.sub("", server_name).strip(" -_")
        if stem:
            add(stem)
            parts = _words(stem)
            # "HF Markets Global", then shorter: the registered name is usually
            # the first words, and the tail is the entity or region. Going all
            # the way down to one word is safe because add() drops anything
            # under three characters, which is what "IC" and "HF" alone are.
            for n in range(len(parts), 0, -1):
                add(" ".join(parts[:n]))

    return out


def alias_prompt(broker: str | None, server_name: str | None) -> str:
    """Ask a model for more names to try. Optional: aliases() covers the common
    shapes, and nothing a model says is believed - every suggestion still has to
    survive the directory search and then a dummy login."""
    return (
        "A trader uses a MetaTrader 5 broker. Give the names the broker is most "
        "likely REGISTERED under with MetaQuotes, one per line, no numbering, at "
        "most 6. Include the full legal entity if you know it.\n"
        f"Broker as the trader wrote it: {broker or '(not given)'}\n"
        f"Their MetaTrader server name: {server_name or '(not given)'}\n"
    )


def parse_alias_reply(text: str, limit: int = 6) -> list[str]:
    """Take a model's reply as a plain list of names, ignoring its prose."""
    out: list[str] = []
    for line in text.splitlines():
        s = line.strip().lstrip("-*0123456789.） )").strip()
        # A model that explains itself writes sentences; a name is short.
        if 3 <= len(s) <= 60 and not s.endswith(":") and s.lower() not in {o.lower() for o in out}:
            out.append(s)
        if len(out) >= limit:
            break
    return out


class Window:
    """The MetaTrader window, driven through xdotool inside the container."""

    def __init__(self, container: str, display: str = ":1"):
        self.container = container
        self.display = display
        self.wid: str | None = None

    def _x(self, *args: str, check: bool = True) -> str:
        r = subprocess.run(
            ["docker", "exec", "-e", f"DISPLAY={self.display}", self.container, "xdotool", *args],
            capture_output=True, text=True, timeout=60,
        )
        if check and r.returncode != 0:
            raise RuntimeError(f"xdotool {' '.join(args)}: {r.stderr.strip()[:200]}")
        return r.stdout.strip()

    # Deliberately NOT "MetaTrader 5": that is the title of the half-built
    # window, which appears seconds after launch with an empty body and only
    # File/View/Tools/Help on the menu bar. Clicking it drives nothing - the
    # menu entries are not there yet - and a search silently does nothing.
    # "<login> - <server> - Netting" is the terminal saying it read the config
    # and finished starting, which is why every search container is given one.
    TITLE = "Netting|Hedging"

    def find(self, timeout: int = 240) -> str:
        """Wait for the terminal to finish starting, not merely to have a window."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            out = self._x("search", "--onlyvisible", "--name", self.TITLE, check=False)
            wid = out.splitlines()[0].strip() if out else ""
            if wid:
                self.wid = wid
                return wid
            time.sleep(5)
        raise RuntimeError("the terminal window never appeared")

    def click(self, xy: tuple[int, int], settle: float = 1.5) -> None:
        self._x("mousemove", str(xy[0]), str(xy[1]))
        time.sleep(0.3)
        self._x("click", "1")
        time.sleep(settle)

    def type(self, text: str) -> None:
        # --window aims the keystrokes at the terminal: the wizard is drawn
        # inside it rather than as a window of its own, so there is nothing
        # else to focus.
        self._x("type", "--window", self.wid or "", "--delay", "60", text)

    def key(self, k: str) -> None:
        self._x("key", k)
        time.sleep(0.8)

    def activate(self) -> None:
        self._x("windowactivate", "--sync", self.wid or "")
        time.sleep(1)

    def clear_search_box(self) -> None:
        self.click(SEARCH_BOX, settle=0.6)
        self._x("key", "--window", self.wid or "", "ctrl+a")
        self._x("key", "--window", self.wid or "", "BackSpace")


def open_wizard(w: Window) -> None:
    # Clicking the File menu rather than sending alt+f: the accelerator does not
    # reach Wine reliably through XTEST and silently leaves the menu shut, after
    # which every later click lands on whatever is underneath and the search
    # quietly does nothing (seen 1 Oct 2026 - the click meant for "Open an
    # Account" selected a Market Watch row instead).
    w.activate()
    w.click(MENU_FILE, settle=2)
    w.click(MENU_OPEN_ACCOUNT, settle=6)


def search_aliases(w: Window, vol: str, names: list[str]) -> tuple[str | None, list[str]]:
    """Type each name into "Find your company" until servers.dat changes.

    Returns the alias that worked (or None) and everything tried. Never advances
    the wizard: the page after this one opens a real account.
    """
    path = servers_dat(vol)
    tried: list[str] = []
    open_wizard(w)
    for name in names:
        before = digest(path)
        w.clear_search_box()
        w.type(name)
        time.sleep(0.5)
        w.click(FIND_BUTTON, settle=SEARCH_WAIT)
        tried.append(name)
        if digest(path) != before:
            # MetaQuotes answered and the terminal wrote it down.
            w.click(CANCEL_BUTTON, settle=2)
            return name, tried
    w.click(CANCEL_BUTTON, settle=2)
    return None, tried
