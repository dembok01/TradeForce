import Link from "next/link";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { HeroFrame } from "@/components/marketing/hero-frame";

/**
 * Centred, as the reference is: eyebrow pill, display headline, lead, two CTAs,
 * then the product frame under a gold bloom.
 *
 * The old left-hand "Live enforcement ledger" aside and its hairline rows are
 * gone — that was the retired grammar, and the frame does the same job better
 * by showing the product rather than listing it. The 3D governor ring moved to
 * the bento, where it no longer competes with the frame for the same attention.
 *
 * Above-the-fold content animates with the CSS `.rise-in` class rather than
 * `Reveal`: Reveal writes opacity:0 into the server HTML and only animates once
 * motion hydrates, which would leave the headline — the LCP element — blank
 * until JS arrives. The frame, lower down, uses Reveal as every other section
 * does.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-obsidian">
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pb-28 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow rise-in">For all traders and trading accounts</p>

          <h1 className="type-h1 rise-in mt-7" style={{ animationDelay: "60ms" }}>
            {/* Explicit {" "} — JSX trims each text line, so a space sitting at
                the start of a wrapped line after </em> is silently dropped. */}
            No more{" "}
            <em className="text-gradient-gold not-italic">Emotional Trading</em>{" "}
            or trades out of the plan.
          </h1>

          <p
            className="rise-in mx-auto mt-7 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            style={{ animationDelay: "120ms" }}
          >
            TradeForce runs on your account and holds the line your plan sets — daily loss,
            trade count, exposure and session hours — the moment a rule would be broken, not
            after the damage is done.
          </p>

          <div
            className="rise-in mt-10 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <Button variant="gold" size="lg" className="rounded-full" asChild>
              <Link href="/signup">Start free</Link>
            </Button>
            <Button variant="secondary" size="lg" className="rounded-full" asChild>
              <a href="#proof">
                <Play />
                Watch it block trade #6
              </a>
            </Button>
          </div>
        </div>

        <Reveal y={48} delay={0.1} className="mt-16 sm:mt-20">
          <HeroFrame />
        </Reveal>
      </div>
    </section>
  );
}
