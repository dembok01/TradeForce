/**
 * Brokers a hosted terminal can connect to.
 *
 * MT5 resolves `[Common] Server=` two ways, and the difference decides how hard
 * it is to add a broker (verified by experiment 18 Aug 2026):
 *
 *   Server=<name>            works ONLY if that name is already in the image's
 *                            Config/servers.dat -- otherwise "no connection".
 *   Server=<host_or_ip:port> works for ANY broker with no pre-registration.
 *                            The terminal connects and then writes its own
 *                            servers.dat afterwards.
 *
 * So we always store the address form. Adding a broker is a data change here,
 * never a Docker image rebuild.
 *
 * Ports are typically 443 or 1950. An address is obtained once per broker
 * either from the broker's own documentation/support, or by reading the live
 * socket of a terminal already logged in to them:
 *   docker exec <c> sh -lc 'cat /proc/$(pgrep -f terminal64)/net/tcp'
 *
 * NEVER guess an address. A wrong one fails at login with a message the user
 * cannot act on.
 */
export type Mt5Broker = {
  /** Stable value stored in mt5_instances.mt5_server and written to tf.ini. */
  server: string;
  label: string;
  kind: "demo" | "broker" | "prop";
};

export const MT5_BROKERS: Mt5Broker[] = [
  // Verified working end-to-end on 18 Aug 2026.
  { server: "129.232.146.42:1950", label: "MetaQuotes Demo (test account)", kind: "demo" },
];

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
 * Accepts a listed broker, or any address the user supplies for a broker we
 * haven't catalogued -- which is most of them, worldwide.
 */
export function isAcceptableServer(v: string): boolean {
  const s = v.trim();
  return MT5_BROKERS.some((b) => b.server === s) || isValidServerAddress(s);
}

export function brokerLabel(server: string): string {
  return MT5_BROKERS.find((b) => b.server === server)?.label ?? server;
}
