import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { TERMS, TERMS_EFFECTIVE, TERMS_VERSION, TERMS_HIGHLIGHTS } from "@/lib/legal/terms";

export const metadata: Metadata = {
  title: "Terms of Service — TradeForce",
  description:
    "The agreement between you and TradeForce: what the Service does, what it does not, how payment works, and who carries which risk.",
};

/**
 * One long document, one column, nothing to click.
 *
 * Reachable from the signup checkbox, the payment disclaimer and the footer,
 * and from nowhere else — the client asked for the terms to be available
 * rather than advertised. That is a placement decision, not a hiding place:
 * the signup checkbox links straight here, the page is indexable, and the
 * clauses that cost a trader money sit in the summary at the top where they
 * cannot be missed.
 *
 * Deliberately not inside the `landing` class: this is a legal document and it
 * reads in the app's own Inter/Fraunces, not the marketing page's Manrope.
 */
export default function TermsPage() {
  return (
    <main className="min-h-screen bg-obsidian">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          TradeForce
        </Link>

        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
          Legal
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          In effect from {TERMS_EFFECTIVE} · version{" "}
          <span className="font-mono">{TERMS_VERSION}</span>
        </p>

        <section
          aria-labelledby="summary-heading"
          className="mt-10 rounded-lg border border-amber-500/30 bg-amber-500/5 p-6"
        >
          <h2 id="summary-heading" className="font-display text-lg font-semibold">
            The five that matter most
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            A summary, not the agreement. The clauses below are what govern.
          </p>
          <ul className="mt-4 space-y-2.5">
            {TERMS_HIGHLIGHTS.map((line) => (
              <li key={line} className="flex gap-3 text-sm leading-relaxed">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-14 space-y-12">
          {TERMS.map((clause) => (
            <section key={clause.id} id={clause.id} aria-labelledby={`${clause.id}-heading`}>
              <h2
                id={`${clause.id}-heading`}
                className="font-display text-xl font-semibold tracking-tight"
              >
                {clause.heading}
              </h2>
              <div className="mt-4 space-y-4">
                {clause.body.map((paragraph, i) => (
                  <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 border-t border-border/60 pt-8">
          <p className="text-xs text-muted-foreground">
            You accepted version <span className="font-mono">{TERMS_VERSION}</span> of these terms
            when you created your account. We keep a record of which version that was.
          </p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <Link href="/" className="text-primary hover:underline">
              Back to TradeForce
            </Link>
            <Link href="/signup" className="text-muted-foreground hover:text-foreground">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
