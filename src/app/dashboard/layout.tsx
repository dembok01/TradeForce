import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data/profile";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileTopbar } from "@/components/dashboard/mobile-topbar";
import { MotionProvider } from "@/components/motion/motion-provider";
import { TourProvider } from "@/components/tour/tour-provider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // The onboarding gate lives here (not in proxy.ts) so the middleware stays
  // DB-free; layouts only re-run on hard entry, so this is one query per visit.
  const profile = await getProfile(supabase);
  if (!profile?.onboarded_at) {
    redirect("/onboarding");
  }

  return (
    <TourProvider autoStart={!profile.tour_completed_at}>
      <div className="flex min-h-screen bg-obsidian">
        <Sidebar email={user.email ?? ""} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopbar email={user.email ?? ""} />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <MotionProvider>{children}</MotionProvider>
          </main>
        </div>
      </div>
    </TourProvider>
  );
}
