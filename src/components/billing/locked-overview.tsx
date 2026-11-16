import Link from "next/link";
import { ArrowRight, Clock, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroFrame } from "@/components/marketing/hero-frame";
import { Reveal } from "@/components/motion/reveal";
import { PERIODS, formatInr } from "@/lib/billing/plans";

/**
 * The overview before a plan is active: a preview of what the dashboard shows,
 * dimmed and marked as a preview so nobody reads it as their own numbers, and
 * the two things a trader can do right now.
 */
export function LockedOverview({
  firstName,
  expired,
  funded,
}: {
  firstName: string | null;
  expired: boolean;
  /** Funded account mode: the plan unlocks the EA download, not the hosted terminal. */
  funded: boolean;
}) {
  const fromPerMonth = formatInr(
    Math.min(...PERIODS.map((p) => Math.round(p.amountInr / p.months)))
  );
  const ready = [
    { href: "/dashboard/settings", icon: ShieldCheck, title: "Set your rules", body: "Loss limit, trade cap, risk." },
    { href: "/dashboard/sessions", icon: Clock, title: "Set your sessions", body: "When you are allowed to trade." },
  ];

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">Dashboard</p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        {firstName ? `Welcome, ${firstName}.` : "Welcome."}{" "}
        <span className="text-muted-foreground">
          {expired ? "Your plan has ended." : "Your dashboard is locked."}
        </span>
      </h1>

      <Reveal className="mt-8">
        <div className="relative">
          <div className="pointer-events-none select-none opacity-40 blur-[2px]" aria-hidden>
            <HeroFrame />
          </div>
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-xl border border-primary/30 bg-card/95 p-6 text-center shadow-2xl backdrop-blur-sm">
              <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Lock className="size-4" aria-hidden />
              </span>
              <p className="mt-4 font-display text-lg font-semibold tracking-tight">
                {expired ? "Renew to unlock" : "Choose a plan to unlock"}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {funded
                  ? "Get the EA for your funded account, see every trade and get your rules enforced live."
                  : "Connect MT5 through our hosted terminal, see every trade and get your rules enforced live."}
              </p>
              <Button variant="gold" className="mt-5 w-full" asChild>
                <Link href="/pay">
                  {expired ? "Renew your plan" : "Choose a plan"}
                  <ArrowRight />
                </Link>
              </Button>
              <p className="mt-3 text-[11px] text-muted-foreground">
                From {fromPerMonth} a month · Preview, not your account
              </p>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.08} className="mt-8">
        <p className="text-sm font-medium">While you decide</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ready.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <item.icon className="size-4 text-primary" aria-hidden />
              <p className="mt-3 text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
            </Link>
          ))}
        </div>
      </Reveal>
    </div>
  );
}
