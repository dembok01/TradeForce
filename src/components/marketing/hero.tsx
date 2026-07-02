"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroScene } from "@/components/three/hero-scene";

const PROVISIONS = [
  "Daily loss limit",
  "Max trades per day",
  "Max open positions",
  "Risk per trade",
  "Session window",
];

export function Hero() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((v) => (v + 1) % PROVISIONS.length), 1900);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="relative overflow-hidden bg-obsidian">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-[280px_1fr] lg:gap-8 lg:pb-28 lg:pt-24">
        {/* The ledger — signature element. A live-reading audit trail of the rules TradeForce enforces. */}
        <aside className="order-2 lg:order-1">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Live enforcement ledger
          </p>
          <ol className="space-y-0">
            {PROVISIONS.map((label, i) => (
              <li key={label} className="ledger-row flex items-center gap-3 py-3">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={`flex-1 text-sm transition-colors duration-500 ${
                    active === i ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
                <motion.span
                  animate={{ opacity: active === i ? 1 : 0, scale: active === i ? 1 : 0.6 }}
                  transition={{ duration: 0.3 }}
                  className="flex size-4 items-center justify-center rounded-full bg-primary/20 text-primary"
                >
                  <Check className="size-2.5" strokeWidth={3} />
                </motion.span>
              </li>
            ))}
          </ol>
        </aside>

        <div className="order-1 grid items-center gap-10 lg:order-2 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
              For funded &amp; evaluation accounts
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Discipline, <em className="text-gradient-gold not-italic">enforced</em>
              <br />
              before it&apos;s broken.
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
              TradeForce runs on your account and holds the line your plan sets — daily
              loss, trade count, exposure, and session hours — the moment a rule would
              be broken, not after the damage is done.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Button variant="gold" size="lg" asChild>
                <Link href="/signup">Start enforcing discipline</Link>
              </Button>
              <Button variant="ghost" size="lg" asChild>
                <a href="#charter">Read the charter →</a>
              </Button>
            </div>
          </div>

          <div className="relative">
            <HeroScene />
          </div>
        </div>
      </div>
    </section>
  );
}
