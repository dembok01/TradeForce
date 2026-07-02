import { cn } from "@/lib/utils";

type Accent = "neutral" | "success" | "warning" | "destructive";

const ACCENT_BORDER: Record<Accent, string> = {
  neutral: "before:bg-border",
  success: "before:bg-success",
  warning: "before:bg-warning",
  destructive: "before:bg-destructive",
};

export function StatTile({
  label,
  value,
  sublabel,
  emptyHint,
  accent = "neutral",
}: {
  label: string;
  value: string | null;
  sublabel?: string;
  emptyHint?: string;
  accent?: Accent;
}) {
  const isEmpty = value === null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-5",
        "before:absolute before:inset-x-0 before:top-0 before:h-0.5",
        ACCENT_BORDER[accent]
      )}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      {isEmpty ? (
        <>
          <p className="mt-3 font-display text-xl text-muted-foreground/60">—</p>
          {emptyHint && <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p>}
        </>
      ) : (
        <>
          <p className="mt-3 font-mono-tabular font-display text-2xl font-semibold text-foreground">
            {value}
          </p>
          {sublabel && <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>}
        </>
      )}
    </div>
  );
}
