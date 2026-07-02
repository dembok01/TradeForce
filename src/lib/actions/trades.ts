"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthedActionContext } from "@/lib/actions/_helpers";
import { toActionErrorMessage } from "@/lib/action-error";
import { tradeFormSchema } from "@/lib/schemas/trade";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/schemas/form";

export type TradeActionState = {
  error: string | null;
  fieldErrors?: FieldErrors;
  success?: boolean;
};

export async function createTradeAction(
  _prevState: TradeActionState,
  formData: FormData
): Promise<TradeActionState> {
  const parsed = tradeFormSchema.safeParse({
    symbol: formData.get("symbol") ?? "",
    direction: formData.get("direction") ?? "",
    entry_price: formData.get("entry_price") ?? "",
    exit_price: formData.get("exit_price") ?? "",
    quantity: formData.get("quantity") ?? "",
    pnl: formData.get("pnl") ?? "",
    entry_time: formData.get("entry_time") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const values = parsed.data;

  try {
    const ctx = await getAuthedActionContext();
    if (!ctx.ok) return { error: ctx.error };
    const { supabase, userId, account } = ctx;

    const { error } = await supabase.from("trades").insert({
      user_id: userId,
      account_id: account.id,
      symbol: values.symbol,
      direction: values.direction,
      entry_price: values.entry_price,
      exit_price: values.exit_price,
      quantity: values.quantity,
      pnl: values.pnl,
      entry_time: new Date(values.entry_time).toISOString(),
      notes: values.notes,
      source: "MANUAL",
    });

    if (error) return { error: error.message };

    revalidatePath("/dashboard/journal");
    revalidatePath("/dashboard/analytics");
    revalidatePath("/dashboard");
    return { error: null, success: true };
  } catch (err) {
    return { error: toActionErrorMessage(err, "trades") };
  }
}

export async function updateTradeNotesAction(tradeId: string, notes: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("trades").update({ notes: notes || null }).eq("id", tradeId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/journal");
}

export async function deleteTradeAction(tradeId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("trades").delete().eq("id", tradeId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/journal");
  revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard");
}
