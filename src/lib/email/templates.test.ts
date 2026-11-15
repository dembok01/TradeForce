import { describe, it, expect } from "vitest";
import {
  esc,
  paymentClaimedEmail,
  paymentApprovedEmail,
  paymentRejectedEmail,
} from "./templates";

const SITE = "https://tradeforce.in";

describe("esc", () => {
  it("neutralises a script tag", () => {
    expect(esc('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });

  it("escapes ampersands first, so entities are not double-broken", () => {
    expect(esc("Tom & <b>Jerry</b>")).toBe("Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;");
  });
});

describe("paymentClaimedEmail", () => {
  const email = paymentClaimedEmail({
    name: "Ravi Kumar",
    reference: "TF-A1B2C3",
    amountInr: 3399,
    months: 3,
    siteUrl: SITE,
  });

  it("puts the reference in the subject, so a reply threads to the right payment", () => {
    expect(email.subject).toContain("TF-A1B2C3");
  });

  it("states amount, period and reference in both renderings", () => {
    for (const body of [email.html, email.text]) {
      expect(body).toContain("TF-A1B2C3");
      expect(body).toContain("3,399");
      expect(body).toContain("3 months");
    }
  });

  it("greets by first name only", () => {
    expect(email.html).toContain("Hi Ravi,");
    expect(email.html).not.toContain("Ravi Kumar,");
  });

  it("does not promise the plan has started", () => {
    expect(email.html).not.toMatch(/your plan is (now )?active/i);
  });
});

describe("paymentApprovedEmail", () => {
  const email = paymentApprovedEmail({
    name: "Ravi",
    reference: "TF-A1B2C3",
    amountInr: 1249,
    months: 1,
    expiresAt: new Date("2027-02-14T00:00:00Z"),
    siteUrl: SITE,
  });

  it("carries the site URL and a sign-in link — the point of the email", () => {
    expect(email.html).toContain(`${SITE}/dashboard`);
    expect(email.html).toContain(`${SITE}/login`);
    expect(email.text).toContain(`${SITE}/login`);
  });

  it("says when the plan runs out, in both renderings", () => {
    expect(email.subject).toContain("February 2027");
    expect(email.html).toContain("February 2027");
    expect(email.text).toContain("February 2027");
  });

  it("uses singular for a one-month plan", () => {
    expect(email.text).toContain("1 month,");
    expect(email.text).not.toContain("1 months");
  });
});

describe("paymentRejectedEmail", () => {
  it("passes the operator's reason through verbatim but escaped", () => {
    const email = paymentRejectedEmail({
      name: null,
      reference: "TF-A1B2C3",
      reason: 'No credit found for this ID <check "again">',
      siteUrl: SITE,
    });
    expect(email.html).toContain("No credit found for this ID &lt;check &quot;again&quot;&gt;");
    expect(email.html).not.toContain('<check "again">');
    expect(email.text).toContain('No credit found for this ID <check "again">');
  });

  it("falls back to a plain greeting with no name", () => {
    const email = paymentRejectedEmail({
      name: null,
      reference: "TF-A1B2C3",
      reason: "no credit found",
      siteUrl: SITE,
    });
    expect(email.html).toContain("Hi,");
  });

  // Money that left someone's account is the most frightening version of this
  // email. It must not read as an accusation or a dead end.
  it("tells a trader who did pay what happens next", () => {
    const email = paymentRejectedEmail({
      name: null,
      reference: "TF-A1B2C3",
      reason: "no credit found",
      siteUrl: SITE,
    });
    expect(email.html).toMatch(/if you have paid/i);
    expect(email.html).toContain(`${SITE}/dashboard/billing`);
  });
});

describe("every template", () => {
  const all = [
    paymentClaimedEmail({ name: "A", reference: "TF-1", amountInr: 1, months: 1, siteUrl: SITE }),
    paymentApprovedEmail({
      name: "A",
      reference: "TF-1",
      amountInr: 1,
      months: 1,
      expiresAt: new Date(),
      siteUrl: SITE,
    }),
    paymentRejectedEmail({ name: "A", reference: "TF-1", reason: "r", siteUrl: SITE }),
  ];

  it("has a subject, html and text", () => {
    for (const e of all) {
      expect(e.subject.length).toBeGreaterThan(0);
      expect(e.html).toContain("<!doctype html>");
      expect(e.text.length).toBeGreaterThan(0);
    }
  });

  // Blocked by default in most clients; an email about money that renders as
  // empty boxes reads like a phishing attempt.
  it("contains no images", () => {
    for (const e of all) expect(e.html).not.toContain("<img");
  });

  it("leaks no unresolved template holes", () => {
    for (const e of all) {
      expect(e.html).not.toContain("undefined");
      expect(e.text).not.toContain("undefined");
      expect(e.html).not.toContain("[object Object]");
    }
  });
});
