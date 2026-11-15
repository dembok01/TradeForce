import "server-only";
import { Resend } from "resend";
import { log } from "@/lib/log";
import { mailer } from "./config";

/**
 * Send one transactional email, and never let it break what it reports on.
 *
 * Every send here is a side effect of something that already succeeded — a
 * payment claimed, a plan granted. The money has moved and the database says
 * so; a failed email must leave both exactly where they are. So this returns a
 * result instead of throwing, and the callers do not check it.
 *
 * Resend's SDK does not throw on API errors either: it resolves with
 * { data, error }. A try/catch alone would silently treat a rejected send as a
 * success, so the error branch is checked explicitly.
 */
export type SendResult =
  | { sent: true; id: string }
  | { sent: false; reason: "unconfigured" | "failed" };

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** For the log line, so a failure says what it was trying to tell someone. */
  kind: string;
  userId?: string;
}): Promise<SendResult> {
  const config = mailer();
  if (!config) {
    log.warn("email not sent: no mailer configured", {
      detail: `kind=${args.kind}${args.userId ? ` user=${args.userId}` : ""}`,
    });
    return { sent: false, reason: "unconfigured" };
  }

  try {
    const resend = new Resend(config.apiKey);
    const { data, error } = await resend.emails.send({
      from: config.from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    });

    if (error) {
      log.error("email send failed", {
        detail: `kind=${args.kind} ${error.name}: ${error.message}`,
      });
      return { sent: false, reason: "failed" };
    }

    log.info("email sent", { detail: `kind=${args.kind} id=${data?.id ?? "?"}` });
    return { sent: true, id: data?.id ?? "" };
  } catch (err) {
    // Network-level failure, which the SDK does throw for.
    log.error("email send threw", {
      detail: `kind=${args.kind}: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { sent: false, reason: "failed" };
  }
}
