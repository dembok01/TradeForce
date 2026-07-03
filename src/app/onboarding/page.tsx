import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data/profile";
import { OnboardingWizard } from "@/components/onboarding/wizard";

// Deliberately outside the dashboard shell: the charter is drafted on its own
// full-screen stage, and the dashboard layout's gate redirects here.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  const profile = await getProfile(supabase);
  if (profile?.onboarded_at) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-obsidian p-4 sm:p-8">
      <OnboardingWizard defaultFullName={profile?.full_name ?? ""} />
    </main>
  );
}
