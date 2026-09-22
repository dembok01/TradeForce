/**
 * Brokers a hosted terminal can connect to.
 *
 * MT5 resolves `[Common] Server=` two ways, and the difference decides the
 * whole onboarding design (re-verified by experiment 20 Sep 2026):
 *
 *   Server=<name>            works ONLY if that name is already in the image's
 *                            Config/servers.dat. An unknown name doesn't fail
 *                            slowly - the terminal never opens a connection at
 *                            all. So a dropdown of broker *names* cannot work.
 *   Server=<host_or_ip:port> works for ANY broker with no pre-registration.
 *
 * So every entry below stores the ADDRESS, and adding a broker is a data change
 * here, never a Docker image rebuild.
 *
 * HOW THESE WERE VERIFIED, AND HOW TO ADD ONE. A wrong address fails at login
 * with a message the user cannot act on, so nothing is ever guessed into this
 * list. MT5 tells us which is which without needing anyone's credentials:
 *
 *   "authorization on <addr> failed (Invalid account)"  -> real MT5 server
 *   "no connection to <addr>"                           -> not one
 *
 * infra/pool-agent/verify-brokers.sh runs exactly that check in a throwaway
 * terminal. Add a candidate, run it, and only ship what comes back REACHED.
 *
 * An address identifies ONE server, not a broker: a broker's demo and live
 * servers are different addresses, and big brokers run several live servers.
 * If a trader's account lives on a server we don't list, their login is
 * rejected and the dashboard says so - they can then enter their own address.
 */
/**
 * Where a trader finds which of their broker's servers the account is on -
 * shown under the server picker and again when a sign-in is refused, because
 * "wrong server" is the most common reason for "Invalid account".
 */
export const BROKER_HELP: Record<string, string> = {
  Alpari:
    "Demo accounts are on Alpari-MT5-Demo and real accounts on Alpari-MT5. It's in Alpari's account email, and in MetaTrader under File → Login to Trade Account.",
  Exness:
    "Exness gives every account its own server. Open the Exness Personal Area → My accounts: the server is on the account card, e.g. Exness-MT5Real8 or Exness-MT5Trial8. Pick exactly that one.",
};

/**
 * Exness runs dozens of MT5 servers and publishes no addresses, so these are
 * connected by NAME. That works only because the image's Config/servers.dat
 * was seeded by a one-off "Open an Account -> Exness" search (see
 * infra/pool-agent/README.md); a name MT5 doesn't know never connects at all.
 * Verified by signing in to each with a fake login: "authorization on
 * Exness-MT5Trial failed (Invalid account)" means MT5 found the server.
 */
const EXNESS_NAME_RE = /^Exness[A-Za-z]{0,4}-MT5(Real|Trial)\d{0,3}$/;

// Numbers after "Exness-MT5Real" / "Exness-MT5Trial" that answered on 22 Sep 2026
// (1 = no number). Anything else still connects: the "not in this list" path
// accepts any Exness server name.
const EXNESS_REAL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 39, 40];
const EXNESS_TRIAL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17];

function exnessServers(): Mt5Server[] {
  const n = (i: number) => (i === 1 ? "" : String(i));
  return [
    ...EXNESS_REAL.map((i): Mt5Server => ({
      broker: "Exness", label: `Exness-MT5Real${n(i)}`, address: `Exness-MT5Real${n(i)}`, kind: "live",
    })),
    ...EXNESS_TRIAL.map((i): Mt5Server => ({
      broker: "Exness", label: `Exness-MT5Trial${n(i)} (demo)`, address: `Exness-MT5Trial${n(i)}`, kind: "demo",
    })),
  ];
}

/** The broker behind a stored server address, if it's one we list. */
export function brokerOf(address: string | null | undefined): string | null {
  if (address && EXNESS_NAME_RE.test(address)) return "Exness";
  return MT5_SERVERS.find((s) => s.address === address)?.broker ?? null;
}

export type Mt5Server = {
  /** Broker as a trader would name it. */
  broker: string;
  /** Which of that broker's servers, as they'd recognise it. */
  label: string;
  /** Stored in mt5_instances.mt5_server and written to tf.ini. */
  address: string;
  kind: "demo" | "live";
};

export const MT5_SERVERS: Mt5Server[] = [
  // Verified 20 Sep 2026 by verify-brokers.sh: MT5 itself confirmed each of
  // these answers as a trading server. "Main server" means the broker publishes
  // one address for both demo and live, or we have not confirmed which it is.
  { broker: "Admirals", label: "Main server", address: "mt5.admiralmarkets.com:443", kind: "live" },
  // Alpari publishes its access points per server (alpari.com, "Common MetaTrader
  // login issues", read 22 Sep 2026). The earlier mt5-demo.alpari.com is a
  // round-robin name whose IPs overlap the live server's, and a real demo
  // account was refused through it three times on 21 Sep.
  { broker: "Alpari", label: "Alpari-MT5-Demo (demo accounts)", address: "dc1.mt5demo.alpari.com:443", kind: "demo" },
  { broker: "Alpari", label: "Alpari-MT5 (real accounts)", address: "dc1.mt5.alpari.com:443", kind: "live" },
  { broker: "Alpha Capital", label: "Main server", address: "mt5.alphacapitalgroup.uk:443", kind: "live" },
  { broker: "Blueberry Markets", label: "Demo", address: "mt5.demo.blueberrymarkets.com:443", kind: "demo" },
  { broker: "Blueberry Markets", label: "Live", address: "mt5.live.blueberrymarkets.com:443", kind: "live" },
  { broker: "Deriv", label: "Main server", address: "mt5.deriv.com:443", kind: "live" },
  { broker: "E8 Markets", label: "Main server", address: "mt5.e8markets.com:443", kind: "live" },
  { broker: "Equiti", label: "Demo 1", address: "mt5-demo1.equiti.com:443", kind: "demo" },
  { broker: "Equiti", label: "Live 1", address: "mt5-live1.equiti.com:443", kind: "live" },
  { broker: "Equiti", label: "Live 2", address: "mt5-live2.equiti.com:443", kind: "live" },
  { broker: "Forex.com", label: "Main server", address: "mt5.forex.com:443", kind: "live" },
  { broker: "Funded Trading Plus", label: "Main server", address: "mt5.fundedtradingplus.com:443", kind: "live" },
  { broker: "Fusion Markets", label: "Demo", address: "mt5-demo.fusionmarkets.com:443", kind: "demo" },
  { broker: "Global Prime", label: "Demo", address: "mt5-demo.globalprime.com:443", kind: "demo" },
  { broker: "IC Markets", label: "Demo", address: "mt5-demo.icmarkets.com:443", kind: "demo" },
  { broker: "IC Markets", label: "Main server", address: "mt5.icmarkets.com:443", kind: "live" },
  { broker: "IG", label: "Main server", address: "mt5.ig.com:443", kind: "live" },
  { broker: "Maven Trading", label: "Main server", address: "mt5.maventrading.com:443", kind: "live" },
  { broker: "MetaQuotes", label: "Demo (test account)", address: "129.232.146.42:1950", kind: "demo" },
  { broker: "MultiBank", label: "Main server", address: "mt5.multibankfx.com:443", kind: "live" },
  { broker: "Pepperstone", label: "Demo 1", address: "mt5-demo1.pepperstone.com:443", kind: "demo" },
  { broker: "Pepperstone", label: "Live 1", address: "mt5-live1.pepperstone.com:443", kind: "live" },
  { broker: "Pepperstone", label: "Live 2", address: "mt5-live2.pepperstone.com:443", kind: "live" },
  { broker: "Swissquote", label: "Main server", address: "mt5.swissquote.com:443", kind: "live" },
  { broker: "Weltrade", label: "Demo", address: "mt5.demo.weltrade.com:443", kind: "demo" },
  ...exnessServers(),
];

/** Broker names for the picker, de-duplicated and alphabetical. */
export const MT5_BROKER_NAMES: string[] = [...new Set(MT5_SERVERS.map((s) => s.broker))].sort((a, b) =>
  a.localeCompare(b),
);

export function serversForBroker(broker: string): Mt5Server[] {
  const needle = broker.trim().toLowerCase();
  if (!needle) return [];
  return MT5_SERVERS.filter((s) => s.broker.toLowerCase() === needle);
}

/** host:port or ipv4:port, port 1-65535. Deliberately permissive on the host part. */
const ADDRESS_RE =
  /^(?=.{1,253}:)((\d{1,3}(\.\d{1,3}){3})|([a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+)):([1-9]\d{0,4})$/i;

export function isValidServerAddress(v: string): boolean {
  const m = ADDRESS_RE.exec(v.trim());
  if (!m) return false;
  const port = Number(m[m.length - 1]);
  return port > 0 && port <= 65535;
}

/**
 * Accepts a listed server, or any address the user supplies for a broker we
 * haven't catalogued -- which is most of them, worldwide.
 */
export function isAcceptableServer(v: string): boolean {
  const s = v.trim();
  return MT5_SERVERS.some((b) => b.address === s) || isValidServerAddress(s) || EXNESS_NAME_RE.test(s);
}

export function brokerLabel(address: string): string {
  const s = MT5_SERVERS.find((b) => b.address === address);
  return s ? `${s.broker} — ${s.label}` : address;
}
