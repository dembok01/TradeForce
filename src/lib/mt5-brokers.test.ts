import { describe, it, expect } from "vitest";
import {
  isValidServerAddress,
  isAcceptableServer,
  brokerLabel,
  serversForBroker,
  MT5_SERVERS,
  MT5_BROKER_NAMES,
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
    expect(isAcceptableServer("Exness-Real12")).toBe(false);
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

  it("every catalogued address is one MT5 would accept", () => {
    for (const s of MT5_SERVERS) {
      expect(isValidServerAddress(s.address), `${s.broker} ${s.label}`).toBe(true);
    }
  });

  it("never lists the same address twice", () => {
    const addresses = MT5_SERVERS.map((s) => s.address);
    expect(addresses).toEqual([...new Set(addresses)]);
  });
});
