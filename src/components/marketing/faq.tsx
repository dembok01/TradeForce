import { Plus } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { Reveal } from "@/components/motion/reveal";
import { FAQS } from "@/lib/marketing/content";

/**
 * Built on native `<details>/<summary>` rather than a Radix accordion:
 * `@radix-ui/react-accordion` is not a dependency and the plan forbids adding
 * one. Native details is keyboard-operable and screen-reader-announced for
 * free; all it needs is the default marker suppressed and a visible focus ring,
 * both below.
 *
 * Each entry is its own rounded panel rather than a hairline row — the spec
 * retires that treatment from the marketing site's own chrome.
 */
export function Faq() {
  return (
    <Section
      id="faq"
      eyebrow="Questions"
      title="Before you put it on a funded account."
      description="The answers that decide whether this is right for you — including the one about whether your firm allows it."
    >
      <div className="space-y-3">
        {FAQS.map((faq, i) => (
          <Reveal key={faq.n} y={48} delay={0.04 * i}>
            <details className="group rounded-card border border-border bg-card open:bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-5 rounded-card px-7 py-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden">
                <span className="font-mono-tabular shrink-0 text-sm text-primary/80">
                  {faq.n}
                </span>
                <h3 className="flex-1 text-base font-medium tracking-[-0.02em] sm:text-lg">
                  {faq.question}
                </h3>
                <Plus
                  className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </summary>
              <p className="px-7 pb-7 pl-[4.25rem] text-sm leading-relaxed text-muted-foreground">
                {faq.answer}
              </p>
            </details>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
