import { Section } from "@/components/marketing/section";
import { TESTIMONIALS } from "@/lib/marketing/content";

/**
 * Built, and deliberately silent.
 *
 * The reference fills this slot with a scrolling marquee of invented customers
 * — "Danielle M., Freelance UX Designer" and so on. Copying the shape is fine;
 * copying the practice is not, so the layout is here and `TESTIMONIALS` ships
 * empty. The moment real quotes with real attribution exist, this renders.
 *
 * `content.test.ts` fails if that array gains entries, which is the guard
 * against someone filling the gap with template filler later.
 *
 * The scroll is a CSS animation, not a JS loop, so the global
 * prefers-reduced-motion block stops it without this component knowing.
 */
export function Testimonials() {
  if (TESTIMONIALS.length === 0) return null;

  // Duplicated once so the track can translate -50% and loop seamlessly.
  const track = [...TESTIMONIALS, ...TESTIMONIALS];

  return (
    <Section
      eyebrow="Testimonials"
      title="What traders say once the rules hold."
      className="overflow-hidden"
    >
      <div className="marquee relative -mx-6 overflow-hidden px-6">
        <div className="marquee-track flex gap-4">
          {track.map((testimonial, i) => (
            <figure
              key={`${testimonial.name}-${i}`}
              className="flex w-80 shrink-0 flex-col rounded-card border border-border bg-card p-7"
            >
              <blockquote className="text-sm leading-relaxed text-foreground">
                “{testimonial.quote}”
              </blockquote>
              <figcaption className="mt-5 text-sm">
                <span className="font-medium">{testimonial.name}</span>
                <span className="block text-xs text-muted-foreground">{testimonial.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        {/* Edge fades, so cards enter and leave rather than being cut off. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-background to-transparent" />
      </div>
    </Section>
  );
}
