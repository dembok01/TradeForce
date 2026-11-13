import { Section } from "@/components/marketing/section";
import { Reveal } from "@/components/motion/reveal";
import { STEPS } from "@/lib/marketing/content";

export function HowItWorks() {
  return (
    <Section
      id="how"
      eyebrow="How it works"
      title="Three steps, then it holds the line for you."
      description="Nothing to learn and nothing to remember. Once the charter is written, the terminal is what enforces it."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal key={step.n} y={48} delay={0.06 * i}>
            <div className="flex h-full flex-col rounded-card border border-border bg-card p-7">
              <span className="eyebrow self-start font-mono-tabular">{step.n}</span>
              <h3 className="mt-6 text-lg font-medium tracking-[-0.03em]">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
