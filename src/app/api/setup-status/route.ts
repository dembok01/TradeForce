import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { computeSetupChecklist } from "@/lib/data/setup";
import { EA_DOWNLOADED_COOKIE } from "@/lib/setup-checklist";
import { log } from "@/lib/log";

// Polled by the EA Setup page (every ~5s while incomplete) so the "first
// check-in" step flips within seconds of the terminal's first ping. Session-
// authed; reads only, no create-on-miss.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .maybeSingle();
  if (accountError) {
    log.error("setup-status account read failed", { detail: accountError.message, userId: user.id });
    return NextResponse.json({ error: "Failed to load setup status." }, { status: 500 });
  }
  if (!account) return NextResponse.json({ error: "No account." }, { status: 404 });

  try {
    const cookieStore = await cookies();
    const status = await computeSetupChecklist(
      supabase,
      account.id,
      cookieStore.get(EA_DOWNLOADED_COOKIE)?.value === "1"
    );
    return NextResponse.json(status);
  } catch (err) {
    log.error("setup-status compute failed", {
      detail: err instanceof Error ? err.message : String(err),
      userId: user.id,
    });
    return NextResponse.json({ error: "Failed to load setup status." }, { status: 500 });
  }
}
