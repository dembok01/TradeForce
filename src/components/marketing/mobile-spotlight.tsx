import { BellRing, CloudCog, Download, type LucideIcon } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { Reveal } from "@/components/motion/reveal";
import { MOBILE_ROUTES } from "@/lib/marketing/content";

/**
 * The page's sharpest differentiator: the rules follow the account, not the
 * desktop the EA happens to be installed on.
 *
 * MetaTrader's mobile apps run no Expert Advisors — none do — so the ordinary
 * answer to "I trade from my phone" is that nothing is enforced. The hosted
 * terminal answers it, which is why this sits directly under the hero.
 *
 * No `"use client"` and no `motion` here: the phone's push-alert loop is the
 * `.push-alert` CSS animation in globals.css, so the whole section ships as
 * static HTML and the global prefers-reduced-motion block stills it. `Reveal`
 * is the only client boundary, and it is the same one every other section uses.
 *
 * The two alert strings are the EA's own, from `ea/TradeForce.mq5` — the
 * daily-loss arm message and the lockdown message that follows it. Nothing on
 * this screen is a sentence the product cannot actually send.
 */

const ROUTE_ICON: Record<string, LucideIcon> = { cloud: CloudCog, own: Download };

const ALERTS = [
  "Daily loss limit hit — MT5 closes in 30 seconds. Locked until your local midnight.",
  "Closing MT5 — daily loss limit. Trading resumes after your local midnight.",
];

const POSITIONS = [
  { symbol: "XAUUSD", side: "sell 0.50", pl: "−238.40" },
  { symbol: "EURUSD", side: "buy 0.20", pl: "−147.80" },
  { symbol: "US30", side: "buy 1.00", pl: "−7.60" },
];

/**
 * The equity curve on the screen, as bar heights in percent. It falls, because
 * the alert dropping onto it is a daily-loss breach: the picture and the
 * sentence have to be telling the same story. The last nine bars are the
 * drawdown and are drawn in the destructive colour.
 */
const CURVE = [38, 46, 41, 55, 62, 58, 71, 66, 74, 69, 61, 52, 44, 36, 30, 24, 19, 13];
const CURVE_BREACH_FROM = 9;

/** One push banner. `className` carries the negative-delay variant. */
function Alert({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={`push-alert rounded-tile border border-primary/25 bg-card/95 p-3 shadow-lg shadow-black/50 backdrop-blur-sm ${className ?? ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-primary/15 text-primary">
          <BellRing className="size-3" strokeWidth={2} />
        </span>
        <span className="text-[10px] font-semibold tracking-[-0.02em]">TradeForce</span>
        <span className="ml-auto text-[9px] text-muted-foreground">now</span>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-snug text-foreground/90">{text}</p>
    </div>
  );
}

/**
 * The phone. Drawn rather than screenshotted so it stays in the palette and
 * costs no image bytes. `aria-hidden`: every claim it illustrates is in the
 * prose beside it, so a screen reader gets the argument without the furniture.
 */
function Phone() {
  return (
    <div className="bloom-gold mx-auto w-[270px] max-w-full" aria-hidden>
      <div className="relative z-10 rounded-[2.5rem] border border-border bg-card p-2.5 shadow-2xl shadow-black/60">
        <div className="relative flex aspect-[9/16] flex-col overflow-hidden rounded-[2rem] bg-background">
          {/* Status bar and notch. */}
          <div className="font-mono-tabular flex items-center justify-between px-5 pt-3 text-[10px] text-muted-foreground">
            <span>14:43</span>
            <span className="h-2.5 w-5 rounded-[3px] border border-current opacity-70" />
          </div>
          <span className="absolute left-1/2 top-2.5 h-1.5 w-14 -translate-x-1/2 rounded-full bg-border" />

          {/* Account header. */}
          <div className="mt-3 flex items-baseline justify-between border-b border-border px-5 pb-2.5">
            <p className="text-[12px] font-medium tracking-[-0.02em]">Trade</p>
            <p className="text-[9px] text-muted-foreground">MetaTrader 5</p>
          </div>

          <div className="px-5 pt-3.5">
            <div className="font-mono-tabular flex items-baseline justify-between">
              <span className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                Equity
              </span>
              <span className="text-sm text-destructive">9 614.20</span>
            </div>
            <div className="font-mono-tabular mt-1 flex items-baseline justify-between text-[9px] text-muted-foreground">
              <span>Balance 10 000.00</span>
              <span className="text-destructive">−3.86%</span>
            </div>

            {/* The day, falling. This is the band the alerts land over. */}
            <div className="mt-4 flex h-24 items-end gap-[3px]">
              {CURVE.map((height, i) => (
                <span
                  key={i}
                  className={`flex-1 rounded-full ${
                    i >= CURVE_BREACH_FROM ? "bg-destructive/45" : "bg-primary/25"
                  }`}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>

          {/* Open positions sit at the foot of the screen, below where the
              alert stack can reach — two banners deep is roughly the top
              third, and a notification covering the book would hide the thing
              the notification is about. */}
          <div className="mt-auto px-5">
            <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              Open positions
            </p>
            <ul className="mt-1">
              {POSITIONS.map((position) => (
                <li
                  key={position.symbol}
                  className="flex items-baseline justify-between border-t border-border py-2"
                >
                  <span className="w-14 text-[10.5px] font-medium">{position.symbol}</span>
                  <span className="text-[9px] text-muted-foreground">{position.side}</span>
                  <span className="font-mono-tabular w-14 text-right text-[10.5px] text-destructive">
                    {position.pl}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* The app's own tab bar, so the screen reads as a phone and not a
              cropped dashboard. */}
          <div className="mt-3 flex items-center justify-between border-t border-border px-4 pb-4 pt-2.5 text-[8px] text-muted-foreground">
            <span>Quotes</span>
            <span>Charts</span>
            <span className="text-primary">Trade</span>
            <span>History</span>
            <span>Settings</span>
          </div>

          {/* The alerts, over the screen. In flow so reduced motion shows both. */}
          <div className="absolute inset-x-0 top-0 flex flex-col gap-2 p-3 pt-9">
            <Alert text={ALERTS[0]} />
            <Alert text={ALERTS[1]} className="push-alert-late" />
          </div>

          <span className="absolute bottom-1.5 left-1/2 h-1 w-20 -translate-x-1/2 rounded-full bg-border" />
        </div>
      </div>
    </div>
  );
}

export function MobileSpotlight() {
  return (
    <Section
      id="mobile"
      eyebrow="Phone trading"
      title="Trade from your phone. The rules come with you."
      description="MetaTrader's mobile app runs no Expert Advisors — no mobile app does — so a rule set that lives in your desktop terminal stops the moment you close the laptop. TradeForce can hold the terminal for you instead: signed into your account, enforcing your charter, whichever device the order came from."
    >
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_270px] lg:gap-16">
        <Reveal y={48} className="lg:order-2">
          <Phone />
        </Reveal>

        <div className="lg:order-1">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {MOBILE_ROUTES.map((route, i) => {
              const Icon = ROUTE_ICON[route.id];
              return (
                <Reveal key={route.id} y={48} delay={0.06 * i}>
                  <div className="flex h-full flex-col rounded-card border border-border bg-card p-7">
                    <div className="flex items-center gap-3">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-primary/10 text-primary">
                        <Icon className="size-5" strokeWidth={1.75} />
                      </span>
                      <span className="eyebrow">{route.badge}</span>
                    </div>
                    <h3 className="mt-6 text-lg font-medium tracking-[-0.03em]">{route.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {route.body}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>

          {/* The limitation, stated here rather than left for the trader to
              discover: FUNDED-ACCOUNTS.md §7.1 and §7.2. MQL5 gives an EA no
              pre-broker veto on a manual order, so a phone trade is corrected,
              never refused, and a single large fill can still breach a hard
              drawdown before the EA reacts. Saying so on the page is cheaper
              than a trader finding out at a payout review. */}
          <p className="mt-6 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
            Enforcement is corrective, not a veto. MetaTrader gives an Expert Advisor no way to
            turn an order down before it reaches the broker, so a trade that breaks your charter is
            closed seconds after it fills, a pending order is deleted, a missing stop is fixed. That
            is the difference between a breach you pay the spread on and one you
            explain at a payout review.
          </p>
        </div>
      </div>
    </Section>
  );
}
