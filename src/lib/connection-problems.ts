// Which traders' connections are failing and not yet dealt with, from the
// connection log (newest first): the latest unhandled warn/error step per
// account, unless a LATER step shows protection working again.

export type Step = {
  account_id: string;
  user_id: string;
  at: string;
  kind: string;
  level: string;
  message: string;
  detail: unknown;
  handled_at: string | null;
};

export type Problem = {
  accountId: string;
  userId: string;
  kind: string;
  level: "warn" | "error";
  message: string;
  journal: string[];
  reason: string | null;
  at: string;
  attempts: number;
};

/**
 * Drop problems for accounts whose protection is working right now. The log
 * alone isn't enough: a recovery that happened while the agent was restarting
 * is learned silently, and the trader would sit in the inbox for ever.
 */
export function stillOpen(problems: Problem[], protectedNow: Set<string>): Problem[] {
  return problems.filter((p) => !protectedNow.has(p.accountId));
}

export function openProblems(newestFirst: Step[]): Problem[] {
  const recovered = new Set<string>();
  const out = new Map<string, Problem>();
  for (const s of newestFirst) {
    if (s.kind === "protected" || s.kind === "resumed") recovered.add(s.account_id);
    if (s.level === "info" || s.handled_at || recovered.has(s.account_id)) continue;
    const seen = out.get(s.account_id);
    if (seen) {
      seen.attempts++;
      continue;
    }
    const d = (s.detail ?? {}) as { journal?: string[]; reason?: string; error?: string };
    out.set(s.account_id, {
      accountId: s.account_id,
      userId: s.user_id,
      kind: s.kind,
      level: s.level as "warn" | "error",
      message: s.message,
      journal: d.journal ?? (d.error ? [d.error] : []),
      reason: d.reason ?? null,
      at: s.at,
      attempts: 1,
    });
  }
  return [...out.values()];
}
