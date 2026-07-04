import { formatCurrency } from "@/lib/format";
import type { Json, ViolationType } from "@/lib/supabase/database.types";

// The one moment a trader needs an explanation is the moment a trade was
// blocked — so every violation renders as a plain sentence built from the
// exact numbers the EA reported in `details`, not a glossary entry. Every
// accessor tolerates missing keys: legacy rows and hand-inserted violations
// fall back to a number-free sentence.

export type ViolationLike = { type: ViolationType; details: Json };

export const VIOLATION_LABELS: Record<ViolationType, string> = {
  OVERTRADING: "Overtrading",
  OUTSIDE_SESSION: "Outside session",
  DAILY_LOSS_BREACH: "Daily loss breach",
  OPEN_POSITIONS_BREACH: "Open positions breach",
  RISK_PER_TRADE_BREACH: "Risk per trade breach",
};

function asRecord(details: Json): Record<string, unknown> {
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : {};
}

function num(d: Record<string, unknown>, key: string): number | null {
  const v = d[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(d: Record<string, unknown>, key: string): string | null {
  const v = d[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

const fmtPct = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(2)}%`;

/** One-sentence "what happened", with the numbers that triggered it. */
export function explainViolation(v: ViolationLike): string {
  const d = asRecord(v.details);

  switch (v.type) {
    case "OVERTRADING": {
      const trades = num(d, "tradesToday");
      const cap = num(d, "cap");
      if (trades !== null && cap !== null)
        return `Blocked — this would've been trade #${trades} today; your limit is ${cap}.`;
      return "Blocked — you hit your daily trade cap.";
    }
    case "OPEN_POSITIONS_BREACH": {
      const open = num(d, "open");
      const cap = num(d, "cap");
      if (open !== null && cap !== null)
        return `Closed — that made ${open} open positions; your cap is ${cap}.`;
      return "Closed — too many positions were open at once.";
    }
    case "DAILY_LOSS_BREACH": {
      const loss = num(d, "lossToday");
      const limit = num(d, "limit");
      if (loss !== null && limit !== null)
        return `Locked — today's loss reached ${formatCurrency(Math.abs(loss))} against your ${formatCurrency(limit)} limit.`;
      if (str(d, "reason"))
        return "Blocked — the account was already locked for the day after the loss breach.";
      return "Locked — your daily loss limit was breached.";
    }
    case "RISK_PER_TRADE_BREACH": {
      const risk = num(d, "riskPercent");
      const cap = num(d, "cap");
      if (risk !== null && cap !== null)
        return `Closed — the trade risked ${fmtPct(risk)} of equity; your cap is ${fmtPct(cap)}.`;
      if (str(d, "reason") && cap !== null)
        return `Closed — no stop-loss meant unbounded risk; your cap is ${fmtPct(cap)}.`;
      if (str(d, "reason")) return "Closed — no stop-loss meant unbounded risk.";
      return "Closed — the trade risked more than your per-trade cap.";
    }
    case "OUTSIDE_SESSION": {
      // windowStart/windowEnd arrive with newer EA builds; timeUtc always has.
      const start = str(d, "windowStart");
      const end = str(d, "windowEnd");
      const time = str(d, "timeUtc");
      if (start && end)
        return `Closed — opened outside your session window (${start}–${end} UTC).`;
      if (time) return `Closed — opened at ${time} UTC, outside your allowed sessions.`;
      return "Closed — opened outside your allowed session windows.";
    }
  }
}

/** What the EA physically did about it (the incident view's second line). */
export function violationAction(type: ViolationType): string {
  switch (type) {
    case "DAILY_LOSS_BREACH":
      return "The EA closed every open position and locked the account until your local midnight.";
    case "OVERTRADING":
    case "OPEN_POSITIONS_BREACH":
    case "RISK_PER_TRADE_BREACH":
    case "OUTSIDE_SESSION":
      return "The EA closed the position the moment it filled and logged the breach.";
  }
}

/** Labeled figures for the expanded incident view; empty for legacy rows. */
export function violationFigures(v: ViolationLike): { label: string; value: string }[] {
  const d = asRecord(v.details);
  const figures: { label: string; value: string }[] = [];
  const push = (label: string, value: string | null) => {
    if (value !== null) figures.push({ label, value });
  };
  const numStr = (key: string) => {
    const n = num(d, key);
    return n === null ? null : String(n);
  };

  switch (v.type) {
    case "OVERTRADING":
      push("Trade number", numStr("tradesToday"));
      push("Daily cap", numStr("cap"));
      break;
    case "OPEN_POSITIONS_BREACH":
      push("Open positions", numStr("open"));
      push("Position cap", numStr("cap"));
      break;
    case "DAILY_LOSS_BREACH": {
      const loss = num(d, "lossToday");
      const limit = num(d, "limit");
      push("Loss today", loss === null ? null : formatCurrency(Math.abs(loss)));
      push("Daily limit", limit === null ? null : formatCurrency(limit));
      break;
    }
    case "RISK_PER_TRADE_BREACH": {
      const risk = num(d, "riskPercent");
      const cap = num(d, "cap");
      push("Risk taken", risk === null ? null : fmtPct(risk));
      push("Risk cap", cap === null ? null : fmtPct(cap));
      push("Stop-loss", str(d, "reason") ? "None attached" : null);
      break;
    }
    case "OUTSIDE_SESSION":
      push("Opened at (UTC)", str(d, "timeUtc"));
      push("Allowed window (UTC)", str(d, "windowStart") && str(d, "windowEnd") ? `${str(d, "windowStart")}–${str(d, "windowEnd")}` : null);
      break;
  }
  return figures;
}
