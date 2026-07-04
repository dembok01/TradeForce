"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { DASHBOARD_NAV_ITEMS } from "@/lib/dashboard-nav";
import { SETUP_DISMISSED_COOKIE } from "@/lib/setup-checklist";
import { EaStatusDot, type EaState } from "@/components/dashboard/ea-status";

export type SetupProgress = { completed: number; total: number } | null;

export function Sidebar({
  name,
  email,
  setup,
  eaState,
  eaLastSeenAt,
}: {
  name: string | null;
  email: string;
  setup: SetupProgress;
  eaState: EaState;
  eaLastSeenAt: string | null;
}) {
  const pathname = usePathname();
  const [setupHidden, setSetupHidden] = useState(false);

  function dismissSetup() {
    document.cookie = `${SETUP_DISMISSED_COOKIE}=1; path=/; max-age=31536000; SameSite=Lax`;
    setSetupHidden(true);
  }

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

      <div className="px-3 pb-1">
        <EaStatusDot state={eaState} lastSeenAt={eaLastSeenAt} />
      </div>

      {setup && !setupHidden && (
        <div className="mx-3 mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-start justify-between gap-2">
            <Link href="/dashboard/ea-setup" className="min-w-0 flex-1">
              <p className="text-xs font-medium text-sidebar-foreground">EA setup</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {setup.completed} of {setup.total} steps done
              </p>
            </Link>
            <button
              type="button"
              onClick={dismissSetup}
              aria-label="Dismiss setup reminder"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${(setup.completed / setup.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 px-1">
            {name && <p className="truncate text-sm text-sidebar-foreground">{name}</p>}
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
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
