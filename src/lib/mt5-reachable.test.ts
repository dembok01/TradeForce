import { createServer, type Server } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { isCustomAddress, reachable } from "./mt5-reachable";

/** A real listener on a free port, so "open" is not mocked. */
function listen(): Promise<{ server: Server; address: string }> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      const port = typeof a === "object" && a ? a.port : 0;
      resolve({ server, address: `127.0.0.1:${port}` });
    });
  });
}

const open = await listen();
afterAll(() => open.server.close());

describe("reachable", () => {
  it("accepts an address something is listening on", async () => {
    expect(await reachable(open.address, 2000)).toBe(true);
  });

  it("rejects a port nothing is listening on", async () => {
    // Port 1 on loopback: refused immediately, no waiting for a timeout.
    expect(await reachable("127.0.0.1:1", 2000)).toBe(false);
  });

  it("rejects a host that does not resolve", async () => {
    expect(await reachable("no-such-broker.invalid:443", 2000)).toBe(false);
  });

  it("rejects a malformed address without opening a socket", async () => {
    expect(await reachable("mt5.example.com", 50)).toBe(false);
    expect(await reachable("mt5.example.com:0", 50)).toBe(false);
    expect(await reachable("mt5.example.com:notaport", 50)).toBe(false);
    expect(await reachable(":443", 50)).toBe(false);
  });

  it("gives up rather than hanging on a black hole", async () => {
    // Reserved, non-routable documentation range: packets go nowhere.
    const started = Date.now();
    expect(await reachable("192.0.2.1:443", 300)).toBe(false);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe("isCustomAddress", () => {
  it("a dropdown address is not probed", () => {
    expect(isCustomAddress("dc1.mt5demo.alpari.com:443")).toBe(false);
    expect(isCustomAddress("  mt5-demo.icmarkets.com:443  ")).toBe(false);
  });

  it("a typed-in address is probed", () => {
    // The one that cost a trader 19 hours: resolves, refuses, not in our list.
    expect(isCustomAddress("demo.icmarkets.com:443")).toBe(true);
  });

  it("a name-based server has no port to probe", () => {
    expect(isCustomAddress("Exness-MT5Trial8")).toBe(false);
    expect(isCustomAddress("ICMarketsSC-Demo")).toBe(false);
  });
});
