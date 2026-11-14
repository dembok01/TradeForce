"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "#mobile", label: "Mobile" },
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-6 px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="text-lg font-semibold tracking-[-0.04em]">
            Trade<span className="text-gradient-gold">Force</span>
          </span>
        </Link>

        {/* Centred links, as the reference has them — absolutely positioned so
            they stay centred on the page rather than between two unequal sides. */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-9 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2.5 lg:flex">
          <Button variant="secondary" size="sm" className="rounded-full" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button variant="gold" size="sm" className="rounded-full" asChild>
            <Link href="/signup">
              Start free
              <ArrowRight />
            </Link>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex size-10 items-center justify-center rounded-tile border border-border text-muted-foreground transition-colors hover:text-foreground lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden border-t border-border/40 lg:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-5">
              {LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="py-2.5 text-sm text-muted-foreground"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-4 flex flex-col gap-2.5">
                <Button variant="secondary" className="rounded-full" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button variant="gold" className="rounded-full" asChild>
                  <Link href="/signup">
                    Start free
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
