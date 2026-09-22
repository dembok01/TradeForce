import { describe, it, expect } from "vitest";
import {
  isValidServerAddress,
  isAcceptableServer,
  brokerLabel,
  serversForBroker,
  MT5_SERVERS,
  MT5_BROKER_NAMES,
  BROKER_HELP,
  brokerOf,
} from "./mt5-brokers";

describe("mt5 server address validation", () => {
  it("accepts ip:port and host:port", () => {
    expect(isValidServerAddress("129.232.146.42:1950")).toBe(true);
    expect(isValidServerAddress("live.icmarkets.com:443")).toBe(true);
    expect(isValidServerAddress("mt5-real.exness.com:1950")).toBe(true);
  });

  it("rejects a bare server NAME - the form MT5 cannot resolve without servers.dat", () => {
    expect(isValidServerAddress("Exness-Real12")).toBe(false);
    expect(isValidServerAddress("ICMarketsSC-MT5")).toBe(false);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "host", "host:", ":443", "host:0", "host:99999", "a b:443"]) {
      expect(isValidServerAddress(bad)).toBe(false);
    }
  });

  it("accepts listed brokers and any valid custom address", () => {
    expect(isAcceptableServer(MT5_SERVERS[0].address)).toBe(true);
    expect(isAcceptableServer("some.broker.ae:443")).toBe(true);
    expect(isAcceptableServer("Exness-Real12")).toBe(false); // not a real Exness server name
  });

  it("labels a known broker, echoes an unknown address", () => {
    expect(brokerLabel(MT5_SERVERS[0].address)).toContain(MT5_SERVERS[0].broker);
    expect(brokerLabel("x.broker.com:443")).toBe("x.broker.com:443");
  });
});

describe("broker picker", () => {
  it("offers each broker once, alphabetically", () => {
    expect(MT5_BROKER_NAMES).toEqual([...new Set(MT5_BROKER_NAMES)].sort((a, b) => a.localeCompare(b)));
    expect(MT5_BROKER_NAMES).toContain("MetaQuotes");
  });

  it("finds a broker's servers however the trader types it", () => {
    expect(serversForBroker("metaquotes").length).toBeGreaterThan(0);
    expect(serversForBroker("  MetaQuotes  ").length).toBeGreaterThan(0);
    expect(serversForBroker("Not A Broker")).toEqual([]);
    expect(serversForBroker("")).toEqual([]);
  });

  it("every catalogued server is an address - except Exness, which goes by name", () => {
    // A name only connects if the image's servers.dat knows it; Exness is the
    // one broker seeded that way. Anyone else listed by name would never connect.
    for (const s of MT5_SERVERS) {
      if (s.broker === "Exness") expect(isValidServerAddress(s.address)).toBe(false);
      else expect(isValidServerAddress(s.address), `${s.broker} ${s.label}`).toBe(true);
    }
  });

  it("never lists the same address twice", () => {
    const addresses = MT5_SERVERS.map((s) => s.address);
    expect(addresses).toEqual([...new Set(addresses)]);
  });
});

describe("Alpari (trial broker)", () => {
  it("uses Alpari's published access points, one per server", () => {
    const alpari = serversForBroker("Alpari");
    expect(alpari.map((s) => s.address)).toEqual(["dc1.mt5demo.alpari.com:443", "dc1.mt5.alpari.com:443"]);
    expect(alpari.map((s) => s.kind)).toEqual(["demo", "live"]);
    // Labels carry the server name the trader sees in MetaTrader and their email.
    expect(alpari[0].label).toContain("Alpari-MT5-Demo");
    expect(alpari[1].label).toContain("Alpari-MT5");
  });

  it("maps a stored address back to its broker, for the refused-login help", () => {
    expect(brokerOf("dc1.mt5demo.alpari.com:443")).toBe("Alpari");
    expect(brokerOf("x.broker.com:443")).toBeNull();
    expect(brokerOf(null)).toBeNull();
    expect(BROKER_HELP.Alpari).toContain("Alpari-MT5-Demo");
  });
});

describe("Exness (trial broker, connected by server name)", () => {
  it("lists its servers by the names traders see in the Personal Area", () => {
    const names = serversForBroker("Exness").map((s) => s.address);
    expect(names).toContain("Exness-MT5Real");
    expect(names).toContain("Exness-MT5Real8");
    expect(names).toContain("Exness-MT5Trial8");
    expect(names).not.toContain("Exness-MT5Real13"); // did not answer on 22 Sep
    expect(names).toHaveLength(37 + 16);
    expect(names.every((n) => isAcceptableServer(n))).toBe(true);
  });

  it("accepts an unlisted Exness server name, but nothing that merely looks like one", () => {
    expect(isAcceptableServer("Exness-MT5Real45")).toBe(true);
    expect(isAcceptableServer("ExnessKE-MT5Real4")).toBe(true);
    expect(isAcceptableServer("Exness-MT5Real8; rm -rf /")).toBe(false);
    expect(isAcceptableServer("Exness-MT4Real8")).toBe(false);
    expect(brokerOf("Exness-MT5Real45")).toBe("Exness");
  });
});
