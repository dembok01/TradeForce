import Link from "next/link";
import { Building2, Trophy } from "lucide-react";
import { setAccountModeAction } from "@/lib/actions/profile";
import type { ConnectionRoute } from "@/lib/schemas/onboarding";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODES: Array<{ value: ConnectionRoute; label: string; hint: string; icon: typeof Trophy }> = [
  { value: "broker", label: "Normal account", hint: "Hosted terminal", icon: Building2 },
  { value: "funded", label: "Funded account", hint: "Downloadable EA", icon: Trophy },
];

const PAGE: Record<ConnectionRoute, string> = {
  broker: "/dashboard/ea-setup",
  funded: "/dashboard/ea-setup/funded",
};

/** What a switch away from the current mode disconnects, said before it happens. */
const CONSEQUENCE: Record<ConnectionRoute, string> = {
  funded:
    "This stops your hosted terminal, clears your saved MT5 login and disconnects it from your dashboard. Then you connect the downloadable EA on your own MT5.",
  broker:
    "This revokes your EA keys, so the EA on your computer disconnects. Remove it from your MT5 chart too. Then you connect through our hosted terminal.",
};

/**
 * One account, one connection: normal mode is the hosted terminal, funded mode
 * is the downloadable EA, never both. Switching disconnects whatever the old
 * mode connected (setAccountModeAction), so when something is connected the
 * switch asks first, via `?switch=` on the same page. Plain links and forms,
 * so it needs no client JS.
 */
export function AccountModeSwitch({
  current,
  connected,
  confirming,
}: {
  current: ConnectionRoute;
  /** A hosted terminal is on, or a live EA key exists. */
  connected: boolean;
  /** The `?switch=` value, when the trader has asked to switch. */
  confirming: string | null | undefined;
}) {
  const target = MODES.find((m) => m.value === confirming && m.value !== current);

  return (
    <div className="mb-6">
      <div className="inline-flex rounded-xl border border-border bg-card p-1" role="group" aria-label="Account mode">
        {MODES.map((mode) => {
          const active = mode.value === current;
          const className = cn(
            "flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-left transition-colors",
            active
              ? "bg-primary/15 text-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          );
          const inner = (
            <>
              <mode.icon className={cn("size-4", active && "text-primary")} aria-hidden />
              <span>
                <span className="block text-sm font-medium">{mode.label}</span>
                <span className="block text-[11px] text-muted-foreground">{mode.hint}</span>
              </span>
            </>
          );

          if (active) {
            return (
              <span key={mode.value} className={className} aria-current="true">
                {inner}
              </span>
            );
          }
          if (connected) {
            return (
              <Link key={mode.value} href={`${PAGE[current]}?switch=${mode.value}`} className={className}>
                {inner}
              </Link>
            );
          }
          return (
            <form key={mode.value} action={setAccountModeAction.bind(null, mode.value)}>
              <button type="submit" className={className}>
                {inner}
              </button>
            </form>
          );
        })}
      </div>

      {target && connected && (
        <div className="mt-3 max-w-xl rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">Switch to {target.label.toLowerCase()} mode?</p>
          <p className="mt-1 text-sm text-muted-foreground">{CONSEQUENCE[target.value]}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={setAccountModeAction.bind(null, target.value)}>
              <Button type="submit" variant="destructive" size="sm">
                Disconnect and switch
              </Button>
            </form>
            <Button variant="ghost" size="sm" asChild>
              <Link href={PAGE[current]}>Cancel</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
