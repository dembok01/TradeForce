import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  isValidServerAddress,
  isAcceptableServer,
  brokerLabel,
  brokerNames,
  serversForBroker,
  brokerOf,
  helpFor,
  exnessServers,
  normaliseDomain,
  candidateAddresses,
  type Mt5Server,
} from "./mt5-brokers";

/**
 * The catalogue lives in the database now, so these read the migration's seed -
 * the one place its contents can be checked without a database, and the thing
 * that would silently go wrong if a broker were lost moving it out of code.
 */
const SEED_SQL = readFileSync("supabase/migrations/20260930000000_mt5_brokers.sql", "utf8");
const SEEDED: Mt5Server[] = [...SEED_SQL.matchAll(
  /^ {2}\('([^']+)', '((?:[^']|'')+)', '([^']+)', '(demo|live)'/gm,
)].map((m) => ({
  broker: m[1],
  label: m[2].replace(/''/g, "'"),
  address: m[3],
  kind: m[4] as "demo" | "live",
}));

const CATALOGUE: Mt5Server[] = [...SEEDED, ...exnessServers()];

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

  it("accepts any valid custom address, and every catalogued one", () => {
    expect(isAcceptableServer("some.broker.ae:443")).toBe(true);
    expect(isAcceptableServer("Exness-Real12")).toBe(false); // not a real Exness server name
    // Why isAcceptableServer needs no catalogue: membership would be redundant.
    for (const s of CATALOGUE) {
      expect(isAcceptableServer(s.address), `${s.broker} ${s.label}`).toBe(true);
    }
  });

  it("labels a known broker, echoes an unknown address", () => {
    expect(brokerLabel(CATALOGUE, SEEDED[0].address)).toContain(SEEDED[0].broker);
    expect(brokerLabel(CATALOGUE, "x.broker.com:443")).toBe("x.broker.com:443");
  });
});

describe("the seeded catalogue", () => {
  it("carries every broker the hardcoded list had", () => {
    expect(SEEDED).toHaveLength(26);
    for (const broker of [
      "Admirals", "Alpari", "Alpha Capital", "Blueberry Markets", "Deriv", "E8 Markets",
      "Equiti", "Forex.com", "Funded Trading Plus", "Fusion Markets", "Global Prime",
      "IC Markets", "IG", "Maven Trading", "MetaQuotes", "MultiBank", "Pepperstone",
      "Swissquote", "Weltrade",
    ]) {
      expect(brokerNames(SEEDED), broker).toContain(broker);
    }
  });

  it("seeds addresses only - a name would never connect", () => {
    // Exness is the sole name-based broker and is deliberately not in the table.
    for (const s of SEEDED) {
      expect(isValidServerAddress(s.address), `${s.broker} ${s.label}`).toBe(true);
      expect(s.broker).not.toBe("Exness");
    }
  });

  it("never seeds the same address twice", () => {
    const addresses = SEEDED.map((s) => s.address);
    expect(addresses).toEqual([...new Set(addresses)]);
  });
});

describe("broker picker", () => {
  it("offers each broker once, alphabetically", () => {
    const names = brokerNames(CATALOGUE);
    expect(names).toEqual([...new Set(names)].sort((a, b) => a.localeCompare(b)));
    expect(names).toContain("MetaQuotes");
  });

  it("finds a broker's servers however the trader types it", () => {
    expect(serversForBroker(CATALOGUE, "metaquotes").length).toBeGreaterThan(0);
    expect(serversForBroker(CATALOGUE, "  MetaQuotes  ").length).toBeGreaterThan(0);
    expect(serversForBroker(CATALOGUE, "Not A Broker")).toEqual([]);
    expect(serversForBroker(CATALOGUE, "")).toEqual([]);
  });
});

describe("Alpari (trial broker)", () => {
  it("uses Alpari's published access points, one per server", () => {
    const alpari = serversForBroker(CATALOGUE, "Alpari");
    expect(alpari.map((s) => s.address)).toEqual([
      "dc1.mt5demo.alpari.com:443",
      "dc1.mt5.alpari.com:443",
    ]);
    expect(alpari.map((s) => s.kind)).toEqual(["demo", "live"]);
    // Labels carry the server name the trader sees in MetaTrader and their email.
    expect(alpari[0].label).toContain("Alpari-MT5-Demo");
    expect(alpari[1].label).toContain("Alpari-MT5");
  });

  it("maps a stored address back to its broker, for the refused-login help", () => {
    expect(brokerOf(CATALOGUE, "dc1.mt5demo.alpari.com:443")).toBe("Alpari");
    expect(brokerOf(CATALOGUE, "x.broker.com:443")).toBeNull();
    expect(brokerOf(CATALOGUE, null)).toBeNull();
    // Alpari's guidance moved into the table; the migration sets it.
    expect(SEED_SQL).toContain("Alpari-MT5-Demo and real accounts");
  });
});

describe("Exness (trial broker, connected by server name)", () => {
  it("lists its servers by the names traders see in the Personal Area", () => {
    const names = serversForBroker(CATALOGUE, "Exness").map((s) => s.address);
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
    expect(brokerOf(CATALOGUE, "Exness-MT5Real45")).toBe("Exness");
  });

  it("keeps its guidance with its generated entries", () => {
    expect(helpFor(CATALOGUE, "Exness")).toContain("Personal Area");
    expect(helpFor(CATALOGUE, "MetaQuotes")).toBeNull();
  });
});

describe("finding a broker's servers from its domain", () => {
  it("takes the domain out of whatever was pasted", () => {
    expect(normaliseDomain("tickmill.com")).toBe("tickmill.com");
    expect(normaliseDomain("  TICKMILL.COM  ")).toBe("tickmill.com");
    expect(normaliseDomain("https://www.tickmill.com/trading-platforms/mt5")).toBe("tickmill.com");
    expect(normaliseDomain("tickmill.com:443")).toBe("tickmill.com");
    expect(normaliseDomain("http://sub.broker.co.uk/x?y=1")).toBe("sub.broker.co.uk");
  });

  it("refuses anything that is not a domain, including internal names", () => {
    // A single-label name could point inside the network; it never gets as far
    // as the reachability guard if it cannot be a candidate in the first place.
    for (const bad of ["", "Tickmill", "localhost", "not a domain", "10.0.0.1", "..", "-.com"]) {
      expect(normaliseDomain(bad), bad).toBeNull();
    }
    expect(candidateAddresses("localhost")).toEqual([]);
  });

  it("offers the shapes brokers actually use", () => {
    const got = candidateAddresses("tickmill.com");
    expect(got).toContain("mt5.tickmill.com:443");
    expect(got).toContain("mt5-demo.tickmill.com:443");
    expect(got).toContain("dc1.mt5demo.tickmill.com:443");
    expect(got).toHaveLength(15);
  });

  it("generates only addresses the rest of the system accepts", () => {
    // Every candidate goes on to be probed and possibly catalogued, so each one
    // has to be a valid server address by construction.
    for (const a of candidateAddresses("broker.co.uk")) {
      expect(isValidServerAddress(a), a).toBe(true);
    }
  });

  it("would have found the addresses we already catalogue for IC Markets", () => {
    // The measured case: of fifteen candidates three answered TCP and the
    // terminal confirmed two were real - both already in the seed.
    const got = candidateAddresses("icmarkets.com");
    expect(got).toContain("mt5-demo.icmarkets.com:443");
    expect(got).toContain("mt5.icmarkets.com:443");
  });
});
