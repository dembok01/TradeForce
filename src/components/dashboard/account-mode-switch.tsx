import { Building2, Trophy } from "lucide-react";
import { setAccountModeAction } from "@/lib/actions/profile";
import type { ConnectionRoute } from "@/lib/schemas/onboarding";
import { cn } from "@/lib/utils";

const MODES: Array<{ value: ConnectionRoute; label: string; hint: string; icon: typeof Trophy }> = [
  { value: "broker", label: "Normal account", hint: "Hosted terminal", icon: Building2 },
  { value: "funded", label: "Funded account", hint: "Downloadable EA", icon: Trophy },
];

/**
 * Which setup the EA page shows. Plain forms posting a server action, so it
 * works without client JS; the current mode is a disabled, highlighted button.
 */
export function AccountModeSwitch({ current }: { current: ConnectionRoute }) {
  return (
    <div className="mb-6 inline-flex rounded-xl border border-border bg-card p-1" role="group" aria-label="Account mode">
      {MODES.map((mode) => {
        const active = mode.value === current;
        return (
          <form key={mode.value} action={setAccountModeAction.bind(null, mode.value)}>
            <button
              type="submit"
              disabled={active}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-left transition-colors",
                active
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <mode.icon className={cn("size-4", active && "text-primary")} aria-hidden />
              <span>
                <span className="block text-sm font-medium">{mode.label}</span>
                <span className="block text-[11px] text-muted-foreground">{mode.hint}</span>
              </span>
            </button>
          </form>
        );
      })}
    </div>
  );
}
