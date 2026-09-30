import { createServer, type Server } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { isCustomAddress, isPublicUnicast, reachable, tcpOpen } from "./mt5-reachable";
import type { Mt5Server } from "./mt5-brokers";

/** A stand-in catalogue: the list now comes from the database, not from code. */
const CATALOGUE: Mt5Server[] = [
  { broker: "Alpari", label: "Demo", address: "dc1.mt5demo.alpari.com:443", kind: "demo" },
  { broker: "IC Markets", label: "Demo", address: "mt5-demo.icmarkets.com:443", kind: "demo" },
];

/** A real listener on a free loopback port, so "open" is not mocked. */
function listen(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      resolve({ server, port: typeof a === "object" && a ? a.port : 0 });
    });
  });
}

const open = await listen();
afterAll(() => open.server.close());

describe("tcpOpen", () => {
  it("sees a listener", async () => {
    expect(await tcpOpen("127.0.0.1", open.port, 2000)).toBe(true);
  });

  it("sees a closed port without waiting for the timeout", async () => {
    expect(await tcpOpen("127.0.0.1", 1, 2000)).toBe(false);
  });

  it("gives up on a black hole instead of hanging", async () => {
    const started = Date.now();
    expect(await tcpOpen("192.0.2.1", 443, 300)).toBe(false);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe("isPublicUnicast", () => {
  it("accepts public addresses, including a broker on an odd port's host", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "129.232.146.42", "52.202.235.91", "2606:4700::1111"]) {
      expect(isPublicUnicast(ip), ip).toBe(true);
    }
  });

  it("refuses everything that would make this a port scanner", () => {
    for (const ip of [
      "127.0.0.1", "127.1.2.3",            // loopback
      "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1",  // private
      "169.254.169.254",                   // cloud metadata
      "0.0.0.0", "100.64.0.1",             // this-network, carrier NAT
      "224.0.0.1", "255.255.255.255",      // multicast, broadcast
      "::1", "fe80::1", "fc00::1", "ff02::1",
      "2001:db8::1",                       // documentation
      "::ffff:127.0.0.1",                  // loopback wearing an IPv6 hat
      "64:ff9b::7f00:1",                   // NAT64 of loopback
    ]) {
      expect(isPublicUnicast(ip), ip).toBe(false);
    }
  });

  it("refuses anything that is not an IP at all", () => {
    expect(isPublicUnicast("mt5.example.com")).toBe(false);
    expect(isPublicUnicast("")).toBe(false);
  });
});

describe("reachable", () => {
  it("refuses a loopback address even though something IS listening there", async () => {
    // The security property: a real listener must not be discoverable this way.
    expect(await tcpOpen("127.0.0.1", open.port, 2000)).toBe(true);
    expect(await reachable(`127.0.0.1:${open.port}`, 2000)).toBe(false);
  });

  it("refuses private and metadata addresses without connecting", async () => {
    for (const a of ["10.0.0.1:443", "192.168.1.1:443", "169.254.169.254:80", "[::1]:443"]) {
      expect(await reachable(a, 200), a).toBe(false);
    }
  });

  it("refuses a host that does not resolve", async () => {
    expect(await reachable("no-such-broker.invalid:443", 2000)).toBe(false);
  });

  it("refuses a malformed address without opening a socket", async () => {
    for (const a of ["mt5.example.com", "mt5.example.com:0", "mt5.example.com:notaport", ":443"]) {
      expect(await reachable(a, 50), a).toBe(false);
    }
  });
});

describe("isCustomAddress", () => {
  it("a dropdown address is not probed", () => {
    expect(isCustomAddress("dc1.mt5demo.alpari.com:443", CATALOGUE)).toBe(false);
    expect(isCustomAddress("  mt5-demo.icmarkets.com:443  ", CATALOGUE)).toBe(false);
  });

  it("a typed-in address is probed", () => {
    // The one that cost a trader 19 hours: resolves, refuses, not in our list.
    expect(isCustomAddress("demo.icmarkets.com:443", CATALOGUE)).toBe(true);
  });

  it("a name-based server has no port to probe", () => {
    expect(isCustomAddress("Exness-MT5Trial8", CATALOGUE)).toBe(false);
    expect(isCustomAddress("ICMarketsSC-Demo", CATALOGUE)).toBe(false);
  });
});
