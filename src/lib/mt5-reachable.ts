import { connect } from "node:net";
import { MT5_SERVERS } from "@/lib/mt5-brokers";

/**
 * Is anything listening at a broker address?
 *
 * This exists because of one trial account that spent 19 hours on "Connecting".
 * Its server was typed in as demo.icmarkets.com:443 - a host that resolves
 * perfectly and refuses every connection, so MetaTrader retried forever, the
 * pool agent reported "no answer from the broker", and nobody read it. A typo
 * should fail while the trader is still looking at the form.
 *
 * Node only; imported from a server action, never from a client component.
 */
const TIMEOUT_MS = 3000;

/**
 * An address the trader typed themselves, rather than one from the dropdown.
 *
 * Only these are probed. Every listed address was verified reachable from the
 * pool box, and a transient blip must never block a signup - a broker that
 * really is down is reported by the agent within minutes either way.
 */
export function isCustomAddress(server: string): boolean {
  const s = server.trim();
  return s.includes(":") && !MT5_SERVERS.some((b) => b.address === s);
}

/**
 * True if a TCP connection opens within the timeout.
 *
 * A pass is not a promise that the pool box can reach it too - this runs on the
 * web host, which has its own egress - so it is a typo catcher, not a guarantee.
 */
export function reachable(address: string, timeoutMs = TIMEOUT_MS): Promise<boolean> {
  const at = address.trim().lastIndexOf(":");
  const host = address.trim().slice(0, at);
  const port = Number(address.trim().slice(at + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return Promise.resolve(false);

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    const socket = connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}
