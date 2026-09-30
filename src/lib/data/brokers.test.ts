import { describe, it, expect } from "vitest";
import { discoverFrom, type SignedInRow } from "./brokers";

/**
 * A broker we don't list first shows up as one trader typing their own address.
 * These check that such an address is surfaced once, with the server name the
 * broker itself reported - and that anything already catalogued stays out.
 */
const row = (address: string, server: string | null, updated: string): SignedInRow => ({
  mt5_server: address,
  status_detail: server === null ? null : `Connected to ${server}`,
  updated_at: updated,
});

describe("discoverFrom", () => {
  it("surfaces an address we do not list, with the name the broker reported", () => {
    const got = discoverFrom([row("mt5-demo.tickmill.com:443", "Tickmill-Demo", "2026-09-30")], []);
    expect(got).toEqual([
      {
        address: "mt5-demo.tickmill.com:443",
        server: "Tickmill-Demo",
        accounts: 1,
        lastSeen: "2026-09-30",
      },
    ]);
  });

  it("ignores what the picker already offers", () => {
    const got = discoverFrom(
      [row("dc1.mt5demo.alpari.com:443", "Alpari-MT5-Demo", "2026-09-30")],
      ["dc1.mt5demo.alpari.com:443"],
    );
    expect(got).toEqual([]);
  });

  it("counts the accounts on one address and keeps the newest sighting", () => {
    const got = discoverFrom(
      [
        row("mt5.newbroker.com:443", "New-Demo", "2026-09-28"),
        row("mt5.newbroker.com:443", "New-Demo", "2026-09-30"),
        row("mt5.newbroker.com:443", "New-Demo", "2026-09-29"),
      ],
      [],
    );
    expect(got).toHaveLength(1);
    expect(got[0].accounts).toBe(3);
    expect(got[0].lastSeen).toBe("2026-09-30");
  });

  it("only trusts a row that actually signed in", () => {
    // A pending or refused account proves nothing about the address.
    const got = discoverFrom(
      [
        { mt5_server: "mt5.unproven.com:443", status_detail: null, updated_at: "2026-09-30" },
        {
          mt5_server: "mt5.unproven.com:443",
          status_detail: "Your broker refused the sign-in (Invalid account).",
          updated_at: "2026-09-30",
        },
      ],
      [],
    );
    expect(got).toEqual([]);
  });

  it("keeps a server name from whichever row has one", () => {
    const got = discoverFrom(
      [
        { mt5_server: "mt5.x.com:443", status_detail: "Connected to ", updated_at: "2026-09-28" },
        row("mt5.x.com:443", "X-Live", "2026-09-29"),
      ],
      [],
    );
    expect(got[0].server).toBe("X-Live");
  });

  it("puts the most recently seen first", () => {
    const got = discoverFrom(
      [row("a.broker.com:443", "A", "2026-09-01"), row("b.broker.com:443", "B", "2026-09-30")],
      [],
    );
    expect(got.map((d) => d.address)).toEqual(["b.broker.com:443", "a.broker.com:443"]);
  });

  it("skips a blank address rather than inventing a row", () => {
    expect(discoverFrom([row("   ", "X", "2026-09-30")], [])).toEqual([]);
  });
});
