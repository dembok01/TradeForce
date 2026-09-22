import { describe, expect, it } from "vitest";
import { openProblems, type Step } from "./connection-problems";

const step = (account: string, at: string, kind: string, level: string, extra: Partial<Step> = {}): Step => ({
  account_id: account, user_id: `u-${account}`, at, kind, level, message: kind, detail: null, handled_at: null, ...extra,
});

describe("openProblems", () => {
  it("one row per trader: the latest failure, counting the attempts", () => {
    const got = openProblems([
      step("a", "10:05", "login_refused", "warn", { detail: { reason: "Invalid account", journal: ["x"] } }),
      step("a", "10:03", "signed_in", "info"),
      step("a", "10:01", "login_refused", "warn"),
      step("b", "10:04", "ea_failed", "error", { detail: { error: "docker: no space left" } }),
    ]);
    expect(got.map((p) => [p.accountId, p.kind, p.attempts])).toEqual([["a", "login_refused", 2], ["b", "ea_failed", 1]]);
    expect(got[0]).toMatchObject({ reason: "Invalid account", journal: ["x"] });
    expect(got[1].journal).toEqual(["docker: no space left"]);
  });

  it("a later recovery closes the problem; an earlier one does not", () => {
    const got = openProblems([
      step("a", "10:09", "protected", "info"),
      step("a", "10:05", "login_refused", "warn"),
      step("b", "10:09", "quiet", "warn"),
      step("b", "10:05", "protected", "info"),
    ]);
    expect(got.map((p) => p.accountId)).toEqual(["b"]);
  });

  it("handled problems stay handled", () => {
    expect(openProblems([step("a", "10:05", "no_answer", "error", { handled_at: "10:06" })])).toEqual([]);
  });
});
