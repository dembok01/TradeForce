/**
 * Brokers a hosted terminal can connect to.
 *
 * MT5 resolves `[Common] Server=` two ways, and the difference decides the
 * whole onboarding design (re-verified by experiment 29 Sep 2026):
 *
 *   Server=<name>            works ONLY if that name is already in the image's
 *                            Config/servers.dat. An unknown name doesn't fail
 *                            slowly - the terminal never opens a connection at
 *                            all. Ours holds MetaQuotes and a hand-seeded
 *                            Exness: Alpari-MT5-Demo does NOT resolve, though
 *                            we connect to Alpari daily by address.
 *   Server=<host_or_ip:port> works for ANY broker with no pre-registration.
 *
 * So a server is stored as an ADDRESS. The list itself now lives in the
 * mt5_brokers table and is loaded by src/lib/data/brokers.ts, so an admin adds
 * a broker from the console instead of a developer editing this file - which is
 * why everything here takes the list as an argument instead of owning it.
 *
 * HOW AN ADDRESS IS VERIFIED. A wrong address fails at login with a message the
 * trader cannot act on, so nothing is guessed into the list. MT5 tells us which
 * is which without needing anyone's credentials:
 *
 *   "authorization on <addr> failed (Invalid account)"  -> real MT5 server
 *   "no connection to <addr>"                           -> not one
 *
 * infra/pool-agent/verify-brokers.sh runs exactly that in a throwaway terminal.
 * It matters: mt5.roboforex.com:443 and mt5.xm.com:443 both answer on TCP 443
 * and neither is an MT5 server (29 Sep 2026), so reachability alone proves
 * nothing.
 *
 * An address identifies ONE server, not a broker: a broker's demo and live
 * servers are different addresses, and big brokers run several live servers.
 */

export type Mt5Server = {
  /** Broker as a trader would name it. */
  broker: string;
  /** Which of that broker's servers, as they'd recognise it. */
  label: string;
  /** Stored in mt5_instances.mt5_server and written to tf.ini. */
  address: string;
  kind: "demo" | "live";
  /** Where the trader finds which server their account is on. */
  help?: string | null;
};

/**
 * Exness runs dozens of MT5 servers and publishes no addresses, so these are
 * connected by NAME. That works only because the image's Config/servers.dat was
 * seeded by a one-off "Open an Account -> Exness" search (see
 * infra/pool-agent/README.md); a name MT5 doesn't know never connects at all.
 * Verified by signing in to each with a fake login: "authorization on
 * Exness-MT5Trial failed (Invalid account)" means MT5 found the server.
 *
 * They stay generated here rather than in mt5_brokers: they are a special case
 * of the regex below, not rows an admin would ever edit one by one.
 */
const EXNESS_NAME_RE = /^Exness[A-Za-z]{0,4}-MT5(Real|Trial)\d{0,3}$/;

const EXNESS_HELP =
  "Exness gives every account its own server. Open the Exness Personal Area → My accounts: " +
  "the server is on the account card, e.g. Exness-MT5Real8 or Exness-MT5Trial8. Pick exactly that one.";

// Numbers after "Exness-MT5Real" / "Exness-MT5Trial" that answered on 22 Sep 2026
// (1 = no number). Anything else still connects: the "not in this list" path
// accepts any Exness server name.
const EXNESS_REAL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 39, 40];
const EXNESS_TRIAL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17];

export function exnessServers(): Mt5Server[] {
  const n = (i: number) => (i === 1 ? "" : String(i));
  return [
    ...EXNESS_REAL.map((i): Mt5Server => ({
      broker: "Exness", label: `Exness-MT5Real${n(i)}`, address: `Exness-MT5Real${n(i)}`,
      kind: "live", help: EXNESS_HELP,
    })),
    ...EXNESS_TRIAL.map((i): Mt5Server => ({
      broker: "Exness", label: `Exness-MT5Trial${n(i)} (demo)`, address: `Exness-MT5Trial${n(i)}`,
      kind: "demo", help: EXNESS_HELP,
    })),
  ];
}

/** Broker names for the picker, de-duplicated and alphabetical. */
export function brokerNames(servers: Mt5Server[]): string[] {
  return [...new Set(servers.map((s) => s.broker))].sort((a, b) => a.localeCompare(b));
}

export function serversForBroker(servers: Mt5Server[], broker: string): Mt5Server[] {
  const needle = broker.trim().toLowerCase();
  if (!needle) return [];
  return servers.filter((s) => s.broker.toLowerCase() === needle);
}

/** The broker behind a stored server address, if it's one we list. */
export function brokerOf(servers: Mt5Server[], address: string | null | undefined): string | null {
  if (address && EXNESS_NAME_RE.test(address)) return "Exness";
  return servers.find((s) => s.address === address)?.broker ?? null;
}

export function brokerLabel(servers: Mt5Server[], address: string): string {
  const s = servers.find((b) => b.address === address);
  return s ? `${s.broker} — ${s.label}` : address;
}

/** The guidance to show under the picker, from the first row that carries any. */
export function helpFor(servers: Mt5Server[], broker: string): string | null {
  return serversForBroker(servers, broker).find((s) => s.help)?.help ?? null;
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
 * Accepts any address a trader supplies, for the many brokers worldwide we have
 * not catalogued, plus Exness's name-based servers.
 *
 * Deliberately does not consult the list: every catalogued address is a valid
 * address by construction (asserted in the tests), so checking membership would
 * only add a database round trip to the one path that must never wrongly refuse
 * a real broker.
 */
export function isAcceptableServer(v: string): boolean {
  const s = v.trim();
  return isValidServerAddress(s) || EXNESS_NAME_RE.test(s);
}

/**
 * Hostnames worth trying for a broker we have no address for.
 *
 * Brokers publish a server NAME ("Tickmill-Demo"); the address is usually
 * nowhere public, so the alternative to asking their support is to try the
 * shapes every other broker uses and let the network answer. Derived from the
 * addresses already in the catalogue - mt5-demo.icmarkets.com, dc1.mt5demo.
 * alpari.com, mt5-demo1.pepperstone.com, mt5.demo.blueberrymarkets.com.
 *
 * It finds a broker roughly four times in ten (measured over seven broker
 * domains), which is worth a few seconds of DNS; the rest still need a human to
 * ask the broker. Guessing is only safe because nothing is trusted until a real
 * terminal has confirmed it: mt5.roboforex.com:443 and mt5.xm.com:443 both
 * accept connections and neither is an MT5 server.
 */
const CANDIDATE_PREFIXES = [
  "mt5", "mt5-demo", "mt5demo", "mt5-live", "mt5-real",
  "demo.mt5", "mt5.demo", "live.mt5", "mt5.live",
  "mt5-demo1", "mt5-live1", "mt5-1",
  "dc1.mt5", "dc1.mt5demo", "trade.mt5",
];

/** A bare registrable domain from whatever the admin pasted, or null. */
export function normaliseDomain(input: string): string | null {
  const bare = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/^www\./, "")
    .replace(/:\d+$/, "");
  // Must look like a domain: at least one dot, no spaces, sane characters.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(bare)) return null;
  // An IP is not a broker's domain, and prefixing one would only produce
  // nonsense like mt5.10.0.0.1. The reachability guard would refuse it later
  // anyway; there is no reason to generate it.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return null;
  return bare;
}

export function candidateAddresses(domain: string, port = 443): string[] {
  const bare = normaliseDomain(domain);
  if (!bare) return [];
  return CANDIDATE_PREFIXES.map((p) => `${p}.${bare}:${port}`);
}
