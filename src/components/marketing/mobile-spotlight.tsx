import Image from "next/image";
import { CloudCog, Download, type LucideIcon } from "lucide-react";
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
 * No `"use client"` and no `motion` here: the phone is a muted, looping
 * `<video>`, so the whole section still ships as static HTML. `Reveal` is the
 * only client boundary, and it is the same one every other section uses.
 */

const ROUTE_ICON: Record<string, LucideIcon> = { cloud: CloudCog, own: Download };

/**
 * The phone: a 4.8s clip of three over-limit trades being closed and the
 * terminal locking. `aria-hidden`, because the argument it illustrates is in
 * the prose beside it.
 *
 * The file is cut from a 1080x1920 master. Three things were done to it, and a
 * re-export has to repeat all three:
 *
 *  - Cropped to the handset's own outline (802x1382 of the master), so the
 *    clip is the phone and needs no drawn bezel around it. The radius below is
 *    that outline's corner: 50px of 802 across, 50px of 1382 down.
 *  - The master strobes the whole screen white six times in 0.85s while the
 *    positions close. That is about 7 Hz, on a loop that never ends. The cut
 *    holds the frames between the flashes instead, so the positions still
 *    close one after another and nothing flashes.
 *  - Its navy and blue are remapped to this site's warm black and gold. Red
 *    and green are left alone, because on this screen they mean breach and
 *    saved.
 *
 * CSS cannot pause a video, so reduced motion swaps it for a still. The global
 * prefers-reduced-motion block in globals.css only shortens CSS animations and
 * would leave this playing.
 *
 * The clip's wording is burned into the pixels, so content.test.ts cannot
 * guard it the way it guards MOBILE_ROUTES. It says "0.05s". The paragraph
 * under the route cards says seconds, and that is the figure the EA supports.
 * Changing the claim means re-rendering the clip, not editing copy here.
 */
function Phone() {
  return (
    <div className="bloom-gold mx-auto w-[340px] max-w-full" aria-hidden>
      <div
        className="relative z-10 aspect-[401/691] overflow-hidden bg-black shadow-2xl shadow-black/60"
        style={{ borderRadius: "6.2% / 3.6%" }}
      >
        {/* ponytail: autoplay fetches all 364KB on page load although the
            phone sits below the fold. Gate it on an IntersectionObserver if
            the clip ever grows well past that. */}
        <video
          className="size-full object-cover motion-reduce:hidden"
          width={680}
          height={1172}
          autoPlay
          muted
          loop
          playsInline
        >
          <source src="/media/mobile-spotlight.mp4" type="video/mp4" />
        </video>
        {/* `unoptimized`: the file is already a 20KB WebP at 2x, so the image
            optimizer has nothing to add. Lazy by default and display:none
            outside reduced motion, so nobody else downloads it. */}
        <Image
          className="hidden size-full object-cover motion-reduce:block"
          src="/media/mobile-spotlight-still.webp"
          alt=""
          width={680}
          height={1172}
          unoptimized
        />
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
      description="Phone apps run no EAs. We can host the terminal for you, so your rules hold whichever device you trade on."
    >
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
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
            Corrective, not a veto: MT5 lets no EA refuse an order, so a trade that breaks a rule
            is closed seconds after it fills.
          </p>
        </div>
      </div>
    </Section>
  );
}
