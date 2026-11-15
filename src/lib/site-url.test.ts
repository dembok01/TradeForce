import { describe, it, expect, afterEach } from "vitest";
import { getSiteUrl } from "./site-url";

const original = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

describe("getSiteUrl", () => {
  it("returns the configured origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.tradeforce.in";
    expect(getSiteUrl()).toBe("https://www.tradeforce.in");
  });

  // Links are built as `${getSiteUrl()}/login`. A trailing slash here makes
  // every one of them a double slash.
  it("strips a trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.tradeforce.in/";
    expect(getSiteUrl()).toBe("https://www.tradeforce.in");
    expect(`${getSiteUrl()}/login`).toBe("https://www.tradeforce.in/login");
  });

  it("trims whitespace, which a pasted env var often carries", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "  https://www.tradeforce.in  ";
    expect(getSiteUrl()).toBe("https://www.tradeforce.in");
  });

  // Loud, not plausible: a misconfigured production that says localhost gets
  // noticed, one that says a stale preview domain does not.
  it("falls back to localhost when unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it("is the same value the EA allowlist helper returns", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.tradeforce.in";
    const { siteUrl } = await import("./env");
    expect(siteUrl()).toBe(getSiteUrl());
  });
});
