import { describe, it, expect } from "vitest";
import { parseMailer, addressOf } from "./config";

const KEY = "re_test_123";

describe("addressOf", () => {
  it("pulls the address out of a display-name sender", () => {
    expect(addressOf("TradeForce <billing@tradeforce.in>")).toBe("billing@tradeforce.in");
  });

  it("passes a bare address through", () => {
    expect(addressOf("billing@tradeforce.in")).toBe("billing@tradeforce.in");
  });
});

describe("parseMailer", () => {
  it("accepts a display-name sender", () => {
    expect(parseMailer({ RESEND_API_KEY: KEY, EMAIL_FROM: "TradeForce <billing@tradeforce.in>" }))
      .toEqual({ apiKey: KEY, from: "TradeForce <billing@tradeforce.in>", replyTo: null });
  });

  it("accepts a bare sender", () => {
    expect(parseMailer({ RESEND_API_KEY: KEY, EMAIL_FROM: "billing@tradeforce.in" })?.from)
      .toBe("billing@tradeforce.in");
  });

  // The whole point of returning null: a deployment with no key still takes
  // payments, it just does not announce them.
  it("is null without a key", () => {
    expect(parseMailer({ EMAIL_FROM: "billing@tradeforce.in" })).toBeNull();
  });

  it("is null without a sender", () => {
    expect(parseMailer({ RESEND_API_KEY: KEY })).toBeNull();
  });

  it.each([
    ["not-an-email", "no @"],
    ["billing@localhost", "no dot in the domain"],
    ["billing @tradeforce.in", "space in it"],
    ["@tradeforce.in", "nothing before the @"],
    ["billing@", "nothing after the @"],
  ])("is null for a malformed sender: %s (%s)", (from) => {
    expect(parseMailer({ RESEND_API_KEY: KEY, EMAIL_FROM: from })).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(parseMailer({ RESEND_API_KEY: `  ${KEY} `, EMAIL_FROM: " billing@tradeforce.in " }))
      .toEqual({ apiKey: KEY, from: "billing@tradeforce.in", replyTo: null });
  });

  it("keeps a valid reply-to", () => {
    expect(
      parseMailer({
        RESEND_API_KEY: KEY,
        EMAIL_FROM: "billing@tradeforce.in",
        EMAIL_REPLY_TO: "support@tradeforce.in",
      })?.replyTo
    ).toBe("support@tradeforce.in");
  });

  // A broken reply-to must not cost us the whole mailer: the send still works,
  // replies just go to the sender.
  it("drops a malformed reply-to but keeps sending", () => {
    const m = parseMailer({
      RESEND_API_KEY: KEY,
      EMAIL_FROM: "billing@tradeforce.in",
      EMAIL_REPLY_TO: "nonsense",
    });
    expect(m).not.toBeNull();
    expect(m?.replyTo).toBeNull();
  });
});
