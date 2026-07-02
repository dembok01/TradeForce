import Link from "next/link";

const PROVISIONS = [
  "Daily loss limit",
  "Max trades per day",
  "Max open positions",
  "Risk per trade",
  "Session window",
];

export function AuthShell({
  children,
  eyebrow,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="grid min-h-screen bg-obsidian lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border/60 p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 30% 20%, hsl(42 62% 58% / 0.12), transparent)",
          }}
          aria-hidden
        />
        <Link href="/" className="relative font-display text-lg font-semibold tracking-tight">
          Trade<span className="text-gradient-gold">Force</span>
        </Link>

        <div className="relative">
          <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Live enforcement ledger
          </p>
          <ol>
            {PROVISIONS.map((label, i) => (
              <li key={label} className="ledger-row flex items-center gap-3 py-3">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm text-foreground">{label}</span>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Every account on TradeForce is held to the same charter — set once,
            enforced continuously.
          </p>
        </div>
      </div>

      <div className="flex flex-col justify-center px-6 py-16 sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-10 block font-display text-lg font-semibold tracking-tight lg:hidden">
            Trade<span className="text-gradient-gold">Force</span>
          </Link>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
            {eyebrow}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
