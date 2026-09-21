import { describe, expect, it } from "vitest";
import { supportIssues, type SupportSubject } from "./support-issues";

const NOW = Date.parse("2026-09-21T18:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const healthy: SupportSubject = {
  createdAt: ago(600),
  connection: "cloud",
  cloudStatus: "running",
  cloudDetail: "Connected to Alpari-MT5-Demo",
  cloudSince: ago(120),
  lastSeenAt: ago(1),
  eaTradeBlock: null,
  refusedCloses24h: 0,
  rulesConfigured: true,
  rulesActive: true,
};

const problems = (s: Partial<SupportSubject>) =>
  supportIssues({ ...healthy, ...s }, NOW).map((i) => i.problem);

describe("supportIssues", () => {
  it("a healthy trader needs nothing", () => {
    expect(supportIssues(healthy, NOW)).toEqual([]);
  });

  it("a refused sign-in carries the broker's words", () => {
    expect(problems({ cloudStatus: "login_failed", cloudDetail: "Your broker refused the sign-in (Invalid account)." }))
      .toEqual(["Your broker refused the sign-in (Invalid account)."]);
  });

  it("starting is only a problem once it has taken too long", () => {
    expect(problems({ cloudStatus: "provisioning", cloudSince: ago(5), lastSeenAt: null })).toEqual([]);
    expect(problems({ cloudStatus: "pending", cloudSince: ago(20), lastSeenAt: null }))
      .toEqual(["Still starting after 20 min (pending)"]);
  });

  it("a running terminal whose EA went quiet is down", () => {
    expect(problems({ lastSeenAt: ago(30) })).toEqual(["Terminal is up but the EA has stopped reporting"]);
  });

  it("a trade block only counts while the EA is reporting", () => {
    expect(problems({ eaTradeBlock: "ALGO_TRADING_OFF" })[0]).toContain("Algo Trading is switched off");
    expect(problems({ connection: "desktop", eaTradeBlock: "ALGO_TRADING_OFF", lastSeenAt: ago(90) }))
      .toEqual(["Desktop EA is offline"]);
  });

  it("refused closes come before softer warnings", () => {
    const got = supportIssues({ ...healthy, refusedCloses24h: 3, rulesActive: false }, NOW);
    expect(got.map((i) => i.level)).toEqual(["down", "warn"]);
    expect(got[0].problem).toBe("3 close(s) refused by the broker in the last 24h");
  });

  it("nobody connected yet is the separate 'never connected' list, not this one", () => {
    expect(problems({ connection: "none", cloudStatus: null, lastSeenAt: null, rulesConfigured: false })).toEqual([]);
  });
});
