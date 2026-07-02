const PROVISIONS = [
  {
    numeral: "I",
    title: "Real-time rule enforcement",
    description:
      "Set a daily loss limit, a max trade count, a position cap, and a risk-per-trade ceiling. TradeForce checks every order against them before it's allowed to stand.",
  },
  {
    numeral: "II",
    title: "Session control",
    description:
      "Restrict trading to London, New York, Asian, or the London/NY overlap — or draw a custom window in your own timezone. Outside it, the account stays flat.",
  },
  {
    numeral: "III",
    title: "Violation centre",
    description:
      "Every breach is logged with a timestamp and the trade that caused it — overtrading, outside-session attempts, loss and exposure breaches — tallied weekly and monthly.",
  },
  {
    numeral: "IV",
    title: "Discipline score",
    description:
      "A single number out of 100, recomputed daily from four factors: rule adherence, session adherence, overtrading prevention, and risk management.",
  },
  {
    numeral: "V",
    title: "Trade journal",
    description:
      "Every trade — symbol, direction, entry, exit, P/L, time — with a notes field for what actually happened. Filter by date range in seconds.",
  },
  {
    numeral: "VI",
    title: "Performance analytics",
    description:
      "Win rate, trade volume by week and month, and P/L charted daily, weekly, and monthly — the record your discipline is actually producing.",
  },
];

export function CharterFeatures() {
  return (
    <section id="charter" className="border-t border-border/60 bg-obsidian py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-14 max-w-2xl">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
            The Charter
          </p>
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Six provisions. No exceptions.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Everything TradeForce does for a funded account, written down the way a
            trading plan should be — plainly, and in order.
          </p>
        </div>

        <div>
          {PROVISIONS.map((p) => (
            <div
              key={p.numeral}
              className="ledger-row grid grid-cols-[3rem_1fr] gap-6 py-7 sm:grid-cols-[4rem_1fr] sm:gap-10 md:grid-cols-[4rem_16rem_1fr]"
            >
              <span className="font-display text-2xl text-primary/70">{p.numeral}</span>
              <h3 className="font-display text-lg font-medium">{p.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground md:max-w-md">
                {p.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
