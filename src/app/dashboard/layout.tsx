import { redirect } from "next/navigation";
import { getAuthedUser } from "@/lib/data/auth";
import { getProfile } from "@/lib/data/profile";
import { getSetupStatus } from "@/lib/data/setup";
import { getEaConnection } from "@/lib/data/api-keys";
import { eaSeenWithin, EA_CONNECTED_WINDOW_MS } from "@/lib/ea-connection";
import type { EaState } from "@/components/dashboard/ea-status";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileTopbar } from "@/components/dashboard/mobile-topbar";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { MotionProvider } from "@/components/motion/motion-provider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthedUser();

  if (!user) {
    redirect("/login");
  }

  // The onboarding gate lives here (not in proxy.ts) so the middleware stays
  // DB-free; layouts only re-run on hard entry, so this is one query per visit.
  const profile = await getProfile();
  if (!profile?.onboarded_at) {
    redirect("/onboarding");
  }

  // Slim setup-progress affordance until the EA checklist completes (or the
  // user dismisses it); derived from DB facts, so it can't be faked done.
  const setupStatus = await getSetupStatus();
  const setup =
    setupStatus.checklist.done || setupStatus.dismissed
      ? null
      : {
          completed: setupStatus.checklist.completedCount,
          total: setupStatus.checklist.total,
        };

  const { lastSeenAt } = await getEaConnection();
  const eaState: EaState = eaSeenWithin(lastSeenAt, EA_CONNECTED_WINDOW_MS)
    ? "live"
    : lastSeenAt
      ? "stale"
      : "never";

  return (
    <>
      <AutoRefresh />
      <div className="flex min-h-screen bg-obsidian">
        <Sidebar
          name={profile.full_name}
          email={user.email ?? ""}
          setup={setup}
          eaState={eaState}
          eaLastSeenAt={lastSeenAt}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopbar name={profile.full_name} email={user.email ?? ""} />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <MotionProvider>{children}</MotionProvider>
          </main>
        </div>
      </div>
    </>
  );
}
