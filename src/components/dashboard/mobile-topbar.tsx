"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { DASHBOARD_NAV_ITEMS } from "@/lib/dashboard-nav";

export function MobileTopbar({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="lg:hidden">
      <div className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
        <Link href="/dashboard" className="font-display text-base font-semibold tracking-tight">
          Trade<span className="text-gradient-gold">Force</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border"
          aria-label="Open menu"
        >
          <Menu className="size-4" />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar"
            >
              <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
                <span className="font-display text-base font-semibold tracking-tight">
                  Trade<span className="text-gradient-gold">Force</span>
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border"
                  aria-label="Close menu"
                >
                  <X className="size-4" />
                </button>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                {DASHBOARD_NAV_ITEMS.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                        active
                          ? "bg-sidebar-accent text-sidebar-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/60"
                      )}
                    >
                      <Icon className={cn("size-4", active && "text-primary")} strokeWidth={1.8} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="border-t border-sidebar-border p-4">
                <p className="truncate px-1 text-xs text-muted-foreground">{email}</p>
                <form action={signOutAction} className="mt-2">
                  <Button type="submit" variant="ghost" size="sm" className="w-full justify-start px-1">
                    Sign out
                  </Button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
