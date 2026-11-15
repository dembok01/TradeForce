import { describe, it, expect } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps a path on this site", () => {
    expect(safeNext("/pay")).toBe("/pay");
    expect(safeNext("/dashboard/billing")).toBe("/dashboard/billing");
  });

  it("keeps the query string and fragment with it", () => {
    expect(safeNext("/pay?period=12")).toBe("/pay?period=12");
  });

  // The whole point. An unchecked `next` on a login page is a phishing kit:
  // our domain, our password prompt, their landing page.
  it("refuses an absolute URL", () => {
    expect(safeNext("https://evil.test/steal")).toBe("/dashboard");
    expect(safeNext("http://evil.test")).toBe("/dashboard");
  });

  it("refuses a protocol-relative URL, which looks like a path but isn't", () => {
    expect(safeNext("//evil.test/steal")).toBe("/dashboard");
  });

  // Some browsers normalise the backslash to a second forward slash, turning
  // this into the case above after our check would have passed it.
  it("refuses a backslash the browser may normalise", () => {
    expect(safeNext("/\\evil.test")).toBe("/dashboard");
    expect(safeNext("/dashboard\\@evil.test")).toBe("/dashboard");
  });

  /**
   * The one that got through the first version of this function.
   *
   * The WHATWG URL parser strips ASCII tab, LF and CR *before* parsing, so
   * "/<tab>/evil.test" is not the local path it looks like: the tab
   * disappears and "//evil.test" is left, which is protocol-relative and
   * leaves the site. A tab is a legal HTTP field-value character, so Node
   * puts it in the Location header and the browser follows it off-site.
   *
   * Each case below is asserted twice — that the guard refuses it, and that
   * a URL parser would indeed have gone somewhere else if it had not. The
   * second half is what makes this a test of the threat rather than of the
   * implementation.
   */
  it("refuses whitespace a URL parser deletes mid-string", () => {
    // Exactly these three, and no others: the spec strips tab, LF and CR.
    // Vertical tab and form feed are NOT stripped, so they are refused as
    // plain control characters in the test below rather than claimed here.
    for (const raw of ["/\t/evil.test", "/\n/evil.test", "/\r/evil.test"]) {
      expect(new URL(raw, "https://site.test").origin, `${JSON.stringify(raw)} is a real escape`)
        .not.toBe("https://site.test");
      expect(safeNext(raw), JSON.stringify(raw)).toBe("/dashboard");
    }
  });

  it("refuses control characters and DEL anywhere in the value", () => {
    for (const raw of ["/pay\u0000", "/pay\u0007x", "/pay\u007f", "/\u0001pay", "/\u000b/x", "/\u000c/x"]) {
      expect(safeNext(raw), JSON.stringify(raw)).toBe("/dashboard");
    }
  });

  // Percent-encoded, these are inert: the browser resolves the path on our
  // own origin rather than decoding them back into separators first. They
  // must survive, or every legitimate encoded path would be refused with them.
  it("leaves a percent-encoded path alone — it does not escape the origin", () => {
    expect(new URL("/%5C/evil.test", "https://site.test").origin).toBe("https://site.test");
    expect(safeNext("/%5C/evil.test")).toBe("/%5C/evil.test");
  });

  it("hands back the parser's normalised path, not the caller's string", () => {
    expect(safeNext("/dashboard/../pay")).toBe("/pay");
    expect(safeNext("/pay#top")).toBe("/pay#top");
  });

  /**
   * The second bypass, and the sibling of the first.
   *
   * Resolving "/.//evil.test" against a base keeps it on that base, so an
   * origin check on the parsed URL passes — but its pathname has normalised
   * to "//evil.test", which is protocol-relative the moment it is handed back
   * on its own. The input was fine; the output was the attack.
   */
  it("refuses a path that normalises into a protocol-relative one", () => {
    for (const raw of [
      "/.//evil.test",
      "/a/..//evil.test",
      "/a/../..//evil.test",
      "/././/evil.test",
      "/a/..//evil.test?x=1",
      "/a/..//evil.test#f",
    ]) {
      // The premise: this really does normalise to something that escapes.
      expect(new URL(raw, "https://site.test").pathname, JSON.stringify(raw)).toMatch(/^\/\//);
      expect(safeNext(raw), JSON.stringify(raw)).toBe("/dashboard");
    }
  });

  // A scheme-looking value that does not start with "/" is already refused,
  // but these are the ones people reach for next.
  it("refuses the other ways out of the origin", () => {
    for (const raw of ["/\thttps://evil.test", "https:/evil.test", "/@evil.test/", "/\u0009@evil.test"]) {
      const out = safeNext(raw);
      expect(new URL(out, "https://site.test").origin, JSON.stringify(raw)).toBe("https://site.test");
    }
  });

  /**
   * The property, not the instances.
   *
   * Both bugs in this function were the same mistake — validating one
   * representation of the value and returning another — and each was found
   * only after someone thought of the specific string. So the invariant is
   * asserted directly instead: whatever comes out must stay on our origin
   * when a browser resolves it, AND must be a fixed point, because a value
   * that changes when it is re-read has a second reading a browser can find.
   *
   * A new bypass class now has to beat this loop, not just the examples.
   */
  it("whatever it returns stays on our origin and does not change on re-reading", () => {
    const hostile = [
      "//evil.test",
      "/\\evil.test",
      "/\t/evil.test",
      "/\n/evil.test",
      "/\r/evil.test",
      "/.//evil.test",
      "/a/..//evil.test",
      "/a/../../..///evil.test",
      "/\t/.//evil.test",
      "/%2F%2Fevil.test",
      "/%5C%5Cevil.test",
      "/..//..//evil.test",
      "///evil.test",
      "/\u0009///evil.test",
      "https://evil.test",
      "javascript:alert(1)",
      "/pay\u0000//evil.test",
      "/./././/evil.test",
    ];
    for (const raw of hostile) {
      const out = safeNext(raw);
      expect(new URL(out, "https://site.test").origin, `${JSON.stringify(raw)} escaped`).toBe(
        "https://site.test"
      );
      expect(safeNext(out), `${JSON.stringify(raw)} is not a fixed point`).toBe(out);
    }
  });

  it("and the real targets are all fixed points too", () => {
    for (const good of ["/pay", "/onboarding", "/dashboard", "/dashboard/billing", "/pay?period=12"]) {
      expect(safeNext(good)).toBe(good);
      expect(safeNext(safeNext(good))).toBe(good);
    }
  });

  it("refuses anything that is not a string", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext(["/pay"])).toBe("/dashboard");
  });

  it("falls back to whatever the caller asked for", () => {
    expect(safeNext("", "/pay")).toBe("/pay");
    expect(safeNext("https://evil.test", "/pay")).toBe("/pay");
  });

  it("trims whitespace, which a copied link carries", () => {
    expect(safeNext("  /pay  ")).toBe("/pay");
  });
});
