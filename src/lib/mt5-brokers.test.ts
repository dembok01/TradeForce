import { describe, it, expect } from "vitest";
import { isValidServerAddress, isAcceptableServer, brokerLabel, MT5_BROKERS } from "./mt5-brokers";

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
    expect(isAcceptableServer(MT5_BROKERS[0].server)).toBe(true);
    expect(isAcceptableServer("some.broker.ae:443")).toBe(true);
    expect(isAcceptableServer("Exness-Real12")).toBe(false);
  });

  it("labels a known broker, echoes an unknown address", () => {
    expect(brokerLabel(MT5_BROKERS[0].server)).toContain("MetaQuotes");
    expect(brokerLabel("x.broker.com:443")).toBe("x.broker.com:443");
  });
});
