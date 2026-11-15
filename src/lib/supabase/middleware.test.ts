import { describe, it, expect } from "vitest";
import { isPublicPath } from "./middleware";

/**
 * The list itself, not the session plumbing.
 *
 * Worth a test because the failure is silent and expensive: a legal page or a
 * buy page quietly behind a login wall still returns a 200, just the wrong
 * one, and nobody notices until a customer cannot read the terms they are
 * being asked to accept.
 */
describe("isPublicPath", () => {
  it("lets a signed-out visitor read the terms they are asked to accept", () => {
    expect(isPublicPath("/terms")).toBe(true);
  });

  it("lets a buy button reach the payment page, which redirects to signup itself", () => {
    expect(isPublicPath("/pay")).toBe(true);
  });

  it("keeps the marketing and auth pages open", () => {
    for (const path of ["/", "/login", "/signup", "/reset-password", "/update-password"]) {
      expect(isPublicPath(path), path).toBe(true);
    }
  });

  it("keeps the EA and cron APIs open — they carry their own credentials", () => {
    expect(isPublicPath("/api/ea/sync")).toBe(true);
    expect(isPublicPath("/api/cron/discipline-scores")).toBe(true);
  });

  it("still guards the dashboard and the operator console", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/billing",
      "/dashboard/settings",
      "/onboarding",
      "/admin",
      "/admin/payments",
      "/api/setup-status",
    ]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });

  // A prefix match would make "/terms-and-conditions-FAKE" or "/paywall-bypass"
  // public too. These are exact matches, and this is what says so.
  it("matches exactly, not by prefix", () => {
    expect(isPublicPath("/terms/extra")).toBe(false);
    expect(isPublicPath("/payments")).toBe(false);
    expect(isPublicPath("/signupx")).toBe(false);
  });
});
