import { TriangleAlert } from "lucide-react";
import { tradeBlockHelp } from "@/lib/ea-trade-block";

/**
 * The EA is running but cannot close trades (Algo Trading off, broker blocks
 * EAs, investor login...). Everything else on the dashboard looks healthy in
 * that state, which is exactly why it needs its own loud line.
 */
export function TradeBlockAlert({ code, className }: { code: string | null; className?: string }) {
  const help = tradeBlockHelp(code);
  if (!help) return null;
  return (
    <div
      role="alert"
      className={`rounded-xl border border-destructive/40 bg-destructive/10 p-5 ${className ?? ""}`}
    >
      <p className="flex items-center gap-2 font-display text-base font-medium text-destructive">
        <TriangleAlert className="size-4 shrink-0" />
        {help.title}. Your rules can&apos;t be enforced right now.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{help.fix}</p>
    </div>
  );
}
