import { eaSeenWithin, EA_CONNECTED_WINDOW_MS } from "@/lib/ea-connection";
import { tradeBlockHelp } from "@/lib/ea-trade-block";

// What the support team should act on for one trader, worst first, and the
// sentence to say to them. Everything here is a state a trader can sit in
// without noticing: the dashboard looks calm while nothing is enforced.

export type SupportIssue = { level: "down" | "warn"; problem: string; tellThem: string };

export type SupportSubject = {
  createdAt: string;
  connection: "cloud" | "desktop" | "none";
  cloudStatus: string | null;
  cloudDetail: string | null;
  cloudSince: string | null;
  lastSeenAt: string | null;
  eaTradeBlock: string | null;
  refusedCloses24h: number;
  rulesConfigured: boolean;
  rulesActive: boolean;
};

const MIN = 60_000;
const minutesSince = (iso: string | null, now: number) =>
  iso ? Math.floor((now - Date.parse(iso)) / MIN) : null;

export function supportIssues(s: SupportSubject, now = Date.now()): SupportIssue[] {
  const out: SupportIssue[] = [];
  const live = eaSeenWithin(s.lastSeenAt, EA_CONNECTED_WINDOW_MS, now);
  const cloudAge = minutesSince(s.cloudSince, now);

  if (s.connection === "cloud") {
    if (s.cloudStatus === "login_failed") {
      out.push({
        level: "down",
        problem: s.cloudDetail ?? "The broker refused the sign-in",
        tellThem:
          "Re-enter the account number and the main trading password (not the investor password), and check the server: demo and live accounts are on different servers.",
      });
    } else if (s.cloudStatus === "error") {
      out.push({
        level: "down",
        problem: `Terminal failed to start: ${s.cloudDetail ?? "no detail"}`,
        tellThem: "We're looking into it - no action needed from you. (Support: check the agent log on the server.)",
      });
    } else if ((s.cloudStatus === "pending" || s.cloudStatus === "provisioning") && (cloudAge ?? 0) > 15) {
      out.push({
        level: "warn",
        problem: `Still starting after ${cloudAge} min (${s.cloudStatus})`,
        tellThem:
          "Your terminal is queued - we'll have it running shortly. (Support: 'pending' means no server has room - check Servers.)",
      });
    } else if (s.cloudStatus === "running" && !live && (cloudAge ?? 0) > 10) {
      out.push({
        level: "down",
        problem: "Terminal is up but the EA has stopped reporting",
        tellThem:
          "We're restarting your protection. (Support: open Full detail; if it stays silent, Stop cloud and ask them to reconnect.)",
      });
    }
  }

  if (live && s.eaTradeBlock) {
    const help = tradeBlockHelp(s.eaTradeBlock);
    if (help) out.push({ level: "down", problem: `${help.title} - rules cannot be enforced`, tellThem: help.fix });
  }

  if (s.refusedCloses24h > 0) {
    out.push({
      level: "down",
      problem: `${s.refusedCloses24h} close(s) refused by the broker in the last 24h`,
      tellThem:
        "Check MetaTrader for trades that are still open and close them. Usually Algo Trading is off, or the broker/prop firm does not allow EAs on this account.",
    });
  }

  if (s.connection === "desktop" && !live && s.lastSeenAt) {
    out.push({
      level: "warn",
      problem: "Desktop EA is offline",
      tellThem:
        "Your computer or MetaTrader is off, so nothing is watching your trades. Connecting your account on the Connect page keeps you protected 24/7.",
    });
  }

  if (s.connection !== "none" && !s.rulesConfigured) {
    out.push({
      level: "warn",
      problem: "Connected but no rules set",
      tellThem: "There's nothing to enforce yet - set your daily loss limit and trade cap under Rule Settings.",
    });
  } else if (s.connection !== "none" && !s.rulesActive) {
    out.push({
      level: "warn",
      problem: "Rules are paused",
      tellThem: "Your charter is paused, so trades are not being checked. Turn it back on under Rule Settings.",
    });
  }

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "down" ? -1 : 1));
}
