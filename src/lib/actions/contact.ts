"use server";

import { createClient } from "@/lib/supabase/server";
import { toActionErrorMessage } from "@/lib/action-error";

export type ContactActionState = {
  error: string | null;
  success?: boolean;
};

export async function submitEnquiryAction(
  _prevState: ContactActionState,
  formData: FormData
): Promise<ContactActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name || !email || !message) {
    return { error: "Every field is required." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "That email address doesn't look right." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("contact_messages").insert({ name, email, message });

    if (error) {
      return { error: "Couldn't send your message — try again in a moment." };
    }

    return { error: null, success: true };
  } catch (err) {
    return { error: toActionErrorMessage(err, "contact") };
  }
}
