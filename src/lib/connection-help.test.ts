import { describe, expect, it } from "vitest";
import { signInHelp } from "./connection-help";

describe("signInHelp", () => {
  it("gives the step that fits the broker's reason", () => {
    expect(signInHelp("Your broker refused the sign-in (Invalid account). Check …")).toContain("trading (master) password");
    expect(signInHelp("Your broker refused the sign-in (Account disabled).")).toContain("expired demo");
    expect(signInHelp("Signed in, but this login can't trade - it looks like the investor (read-only) password.")).toContain("investor");
    expect(signInHelp("Your broker's server has not answered for 8 minutes")).toContain("can't reach that server");
  });

  it("says nothing it can't back up", () => {
    expect(signInHelp(null)).toBeNull();
    expect(signInHelp("Something unusual")).toBeNull();
  });
});
