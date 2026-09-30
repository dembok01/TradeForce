import { lookup } from "node:dns/promises";
import { connect, isIP } from "node:net";
import type { Mt5Server } from "@/lib/mt5-brokers";

/**
 * Is anything listening at a broker address?
 *
 * This exists because of one trial account that spent 19 hours on "Connecting".
 * Its server was typed in as demo.icmarkets.com:443 - a host that resolves
 * perfectly and refuses every connection - so MetaTrader retried forever, the
 * pool agent reported "no answer from the broker", and nobody read it. A typo
 * should fail while the trader is still looking at the form.
 *
 * Opening a socket to an address a user supplied is also a server-side request
 * forgery primitive: without a policy it would tell anyone whether the web host
 * can reach 127.0.0.1:22, 169.254.169.254 or anything on the private network,
 * one port at a time. So the address must resolve to public unicast only, and
 * the socket goes to the resolved literal IP rather than the name, leaving no
 * window to re-point DNS in between. Node only; called from a server action.
 */
const TIMEOUT_MS = 3000;

/**
 * An address the trader typed themselves, rather than one from the dropdown.
 *
 * Only these are probed. Every listed address was verified reachable from the
 * pool box, and a transient blip must never block a signup - a broker that
 * really is down is reported by the agent within minutes either way.
 */
export function isCustomAddress(server: string, catalogue: Mt5Server[]): boolean {
  const s = server.trim();
  return s.includes(":") && !catalogue.some((b) => b.address === s);
}

/**
 * Public, routable unicast only.
 *
 * Ports cannot be restricted instead - one catalogued broker answers on 1950 -
 * so the address range is the whole defence.
 */
export function isPublicUnicast(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const o = ip.split(".").map(Number);
    if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    const [a, b] = o;
    if (a === 0 || a === 10 || a === 127) return false;              // this-network, private, loopback
    if (a === 100 && b >= 64 && b <= 127) return false;              // carrier NAT
    if (a === 169 && b === 254) return false;                        // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;               // private
    if (a === 192 && (b === 168 || b === 0)) return false;           // private, protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return false;           // benchmarking
    if (a === 203 && b === 0) return false;                          // documentation
    if (a >= 224) return false;                                      // multicast, reserved, broadcast
    return true;
  }
  if (v === 6) {
    const low = ip.toLowerCase();
    if (low.startsWith("::ffff:") || low.startsWith("64:ff9b:")) return false;  // IPv4 in disguise
    if (low.startsWith("2001:db8")) return false;                               // documentation
    const head = Number.parseInt(low.split(":")[0] || "0", 16);
    return head >= 0x2000 && head <= 0x3fff;                                    // global unicast only
  }
  return false;
}

/** A TCP connect with a deadline, and no policy of its own. */
export function tcpOpen(ip: string, port: number, timeoutMs = TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    const socket = connect({ host: ip, port });
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/**
 * True if a broker address answers a TCP connection within the timeout.
 *
 * A pass is not a promise that the pool box can reach it too - this runs on the
 * web host, which has its own egress - so it is a typo catcher, not a guarantee.
 */
export async function reachable(address: string, timeoutMs = TIMEOUT_MS): Promise<boolean> {
  const s = address.trim();
  const at = s.lastIndexOf(":");
  const host = s.slice(0, at);
  const port = Number(s.slice(at + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return false;

  let ips: string[];
  if (isIP(host)) {
    ips = [host];
  } else {
    try {
      ips = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      return false;
    }
  }
  // Every answer has to be public: a name that resolves to one public and one
  // private address must not become a way to reach the private one.
  if (!ips.length || !ips.every(isPublicUnicast)) return false;
  return tcpOpen(ips[0], port, timeoutMs);
}
