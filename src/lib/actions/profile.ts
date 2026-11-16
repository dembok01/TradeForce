"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthedActionContext } from "@/lib/actions/_helpers";
import { getAuthedUser } from "@/lib/data/auth";
import { getProfile } from "@/lib/data/profile";
import { sealSecret } from "@/lib/mt5-crypto";
import { logConnection } from "@/lib/connection-log";
import { toActionErrorMessage } from "@/lib/action-error";
import {
  connectionRouteEnum,
  profileDetailsSchema,
  type ConnectionRoute,
} from "@/lib/schemas/onboarding";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/schemas/form";
import { log } from "@/lib/log";

export type ProfileActionState = {
  error: string | null;
  fieldErrors?: FieldErrors;
  success?: boolean;
};

export async function updateProfileAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const parsed = profileDetailsSchema.safeParse({
    full_name: formData.get("full_name") ?? "",
    markets_traded: formData.getAll("markets_traded"),
    prop_firm: formData.get("prop_firm") ?? "",
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    const user = await getAuthedUser();
    if (!user) return { error: "Not authenticated." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.full_name,
        markets_traded: parsed.data.markets_traded,
        prop_firm: parsed.data.prop_firm,
        phone: parsed.data.phone,
      })
      .eq("id", user.id);

    if (error) {
      log.error("profile update failed", { detail: error.message, userId: user.id });
      return { error: "Couldn't save your profile. Please try again." };
    }

    // "layout" so the sidebar greeting refreshes on every dashboard page.
    revalidatePath("/dashboard", "layout");
    return { error: null, success: true };
  } catch (err) {
    return { error: toActionErrorMessage(err, "profile") };
  }
}

/**
 * Switch between normal account mode (our hosted terminal, signed in with the
 * trader's MT5 password) and funded account mode (the downloadable EA on their
 * own MT5).
 *
 * One account, one connection. Two EAs reporting into the same dashboard would
 * fight over the same trades, rules and lockouts, so a switch first tears down
 * both kinds of connection (see disconnect() below), and only then changes
 * mode. If the teardown fails nothing is switched, so the trader is never left
 * in a mode whose connection is not the only one.
 */
export async function setAccountModeAction(route: ConnectionRoute) {
  const parsed = connectionRouteEnum.safeParse(route);
  if (!parsed.success) throw new Error("Unknown account mode.");
  const target = parsed.data;

  const ctx = await getAuthedActionContext();
  if (!ctx.ok) throw new Error(ctx.error);
  const { supabase, userId, account } = ctx;

  const profile = await getProfile();
  const current = profile?.connection_route === "funded" ? "funded" : "broker";

  if (target !== current) {
    const cleared = await disconnect(ctx, "both");
    if (cleared) {
      await logConnection(
        account.id,
        userId,
        "mode_switched",
        "info",
        target === "funded"
          ? "You switched to funded account mode. Your hosted terminal was stopped and its saved login cleared."
          : "You switched to normal account mode. Your EA keys were revoked, so the EA on your computer is disconnected."
      );
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ connection_route: target })
    .eq("id", userId);
  if (error) {
    log.error("account mode update failed", { detail: error.message, userId });
    throw new Error("Couldn't switch modes. Please try again.");
  }

  revalidatePath("/dashboard", "layout");
  redirect(target === "funded" ? "/dashboard/ea-setup/funded" : "/dashboard/ea-setup");
}

/**
 * For accounts that had both connections live before modes were exclusive:
 * keep the current mode's connection and disconnect the other one.
 */
export async function disconnectOtherConnectionAction() {
  const ctx = await getAuthedActionContext();
  if (!ctx.ok) throw new Error(ctx.error);

  const funded = (await getProfile())?.connection_route === "funded";
  if (await disconnect(ctx, funded ? "hosted" : "downloaded")) {
    await logConnection(
      ctx.account.id,
      ctx.userId,
      "duplicate_cleared",
      "info",
      funded
        ? "You stopped the hosted terminal so only your downloadable EA is connected."
        : "You revoked your downloaded EA's keys so only the hosted terminal is connected."
    );
  }

  revalidatePath("/dashboard", "layout");
  redirect(funded ? "/dashboard/ea-setup/funded" : "/dashboard/ea-setup");
}

/** The hosted terminal's keys are minted by enableCloudEaAction under this label. */
const HOSTED_KEY_LABEL = "Cloud EA";

/**
 * Tears a connection down, and throws without having switched anything if a
 * step fails. "hosted": the terminal is set to `removed` (the pool agent then
 * deletes the container), its saved MT5 password is overwritten, and its keys
 * are revoked. ea_key_cipher is left alone: the agent unseals it on every pass,
 * removed rows included. "downloaded": every other live key is revoked, so the
 * EA on the trader's computer gets 401 on its next sync. Revoking also clears
 * the dashboard's "connected", which is a live key's last_used_at.
 *
 * Returns how many things it actually disconnected.
 */
async function disconnect(
  { supabase, account }: { supabase: Awaited<ReturnType<typeof createClient>>; account: { id: string } },
  what: "hosted" | "downloaded" | "both"
): Promise<number> {
  const now = new Date().toISOString();
  let count = 0;

  if (what !== "downloaded") {
    const { data, error } = await createServiceClient()
      .from("mt5_instances")
      .update({ desired_state: "removed", mt5_password_cipher: sealSecret(""), updated_at: now })
      .eq("account_id", account.id)
      .neq("desired_state", "removed")
      .select("id");
    if (error) {
      log.error("disconnect: hosted terminal teardown failed", { detail: error.message, accountId: account.id });
      throw new Error("Couldn't stop your hosted terminal, so nothing was changed. Please try again.");
    }
    count += data?.length ?? 0;
  }

  let keys = supabase
    .from("api_keys")
    .update({ revoked_at: now })
    .eq("account_id", account.id)
    .is("revoked_at", null);
  if (what === "hosted") keys = keys.eq("label", HOSTED_KEY_LABEL);
  if (what === "downloaded") keys = keys.neq("label", HOSTED_KEY_LABEL);
  const { data, error } = await keys.select("id");
  if (error) {
    log.error("disconnect: key revoke failed", { detail: error.message, accountId: account.id });
    throw new Error("Couldn't disconnect your EA, so nothing was changed. Please try again.");
  }
  return count + (data?.length ?? 0);
}
