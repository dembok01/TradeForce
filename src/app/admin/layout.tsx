import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/data/auth";
import { isAdmin, adminEmails } from "@/lib/admin";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const NAV = [
  ["/admin", "Overview"],
  ["/admin/users", "Users"],
  ["/admin/inbox", "Inbox"],
  ["/admin/instances", "EAs"],
  ["/admin/servers", "Servers"],
  ["/admin/outages", "Outages"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthedUser();
  if (!user) redirect("/login");

  // notFound() rather than a 403: an internal console shouldn't confirm its own
  // existence to a signed-in customer who guessed the URL.
  if (!(await isAdmin())) {
    // Logged so a denial is diagnosable from Vercel logs: the usual cause is
    // ADMIN_EMAILS missing from the running build (env vars need a redeploy),
    // not a genuinely unauthorised user.
    log.warn("admin access denied", {
      detail: `email=${user.email ?? "none"} allowlistSize=${adminEmails().length}`,
    });
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-8">
          <span className="text-sm font-semibold">TradeForce ops</span>
          <nav className="flex gap-4 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="text-muted-foreground hover:text-foreground">
                {label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-xs text-muted-foreground">{user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4 md:p-8">{children}</main>
    </div>
  );
}
