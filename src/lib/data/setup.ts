import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getAccountContext } from "@/lib/data/context";
import { countExact, getEaLastSeenAt } from "@/lib/data/_shared";
import {
  deriveSetupChecklist,
  COMPLETED_CHECKLIST,
  EA_DOWNLOADED_COOKIE,
  SETUP_DONE_COOKIE,
  SETUP_DISMISSED_COOKIE,
  type SetupChecklist,
} from "@/lib/setup-checklist";
import type { ServerClient } from "@/lib/data/account";

export type SetupStatus = {
  checklist: SetupChecklist;
  lastSeenAt: string | null;
  dismissed: boolean;
};

/** The DB half of the checklist facts. Plain function so route handlers can use it too. */
export async function computeSetupChecklist(
  supabase: ServerClient,
  accountId: string,
  downloadClicked: boolean
): Promise<{ checklist: SetupChecklist; lastSeenAt: string | null }> {
  const [keyCount, lastSeenAt, eaTradeCount] = await Promise.all([
    countExact(() =>
      supabase
        .from("api_keys")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .is("revoked_at", null)
    ),
    getEaLastSeenAt(supabase, accountId),
    countExact(() =>
      supabase
        .from("trades")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .eq("source", "EA")
    ),
  ]);

  const checklist = deriveSetupChecklist({
    hasKey: keyCount > 0,
    hasCheckedIn: lastSeenAt !== null,
    hasEaTrade: eaTradeCount > 0,
    downloadClicked,
  });
  return { checklist, lastSeenAt };
}

/**
 * Setup state for the current request (layout affordance + EA Setup page).
 * Once the checklist has completed on this browser (done-cookie), the reads
 * are skipped entirely so finished users don't pay for them on every page.
 */
export const getSetupStatus = cache(async (): Promise<SetupStatus> => {
  const cookieStore = await cookies();
  const dismissed = cookieStore.get(SETUP_DISMISSED_COOKIE)?.value === "1";
  if (cookieStore.get(SETUP_DONE_COOKIE)?.value === "1") {
    return { checklist: COMPLETED_CHECKLIST, lastSeenAt: null, dismissed };
  }

  const { supabase, account } = await getAccountContext();
  const { checklist, lastSeenAt } = await computeSetupChecklist(
    supabase,
    account.id,
    cookieStore.get(EA_DOWNLOADED_COOKIE)?.value === "1"
  );
  return { checklist, lastSeenAt, dismissed };
});
