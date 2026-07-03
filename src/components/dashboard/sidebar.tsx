"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { DASHBOARD_NAV_ITEMS } from "@/lib/dashboard-nav";
import { useTour } from "@/components/tour/tour-provider";

// Stable anchor ids for the guided tour, derived from the route segment.
export function navTourId(href: string) {
  return `nav-${href.split("/")[2] ?? "overview"}`;
}

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const { startTour } = useTour();

  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <Link href="/" className="flex h-16 items-center border-b border-sidebar-border px-6">
        <span className="font-display text-lg font-semibold tracking-tight text-sidebar-foreground">
          Trade<span className="text-gradient-gold">Force</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {DASHBOARD_NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour-id={navTourId(item.href)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon className={cn("size-4", active && "text-primary")} strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate px-1 text-xs text-muted-foreground">{email}</p>
          <button
            type="button"
            onClick={startTour}
            aria-label="Replay the dashboard tour"
            className="flex size-7 shrink-0 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
          >
            <HelpCircle className="size-3.5" />
          </button>
        </div>
        <form action={signOutAction} className="mt-2">
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start px-1">
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
