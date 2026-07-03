import { Reveal } from "@/components/motion/reveal";

// When `titleEmphasis` matches a substring of the title, that word gets the
// hero's gradient-gold treatment. Spent sparingly — two or three pages, not
// all of them — or it stops reading as a signature.
function renderTitle(title: string, emphasis?: string) {
  if (!emphasis) return title;
  const index = title.indexOf(emphasis);
  if (index === -1) return title;
  return (
    <>
      {title.slice(0, index)}
      <em className="text-gradient-gold not-italic">{emphasis}</em>
      {title.slice(index + emphasis.length)}
    </>
  );
}

export function PageHeader({
  eyebrow,
  title,
  titleEmphasis,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  titleEmphasis?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Reveal y={8} className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
            {eyebrow}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {renderTitle(title, titleEmphasis)}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
    </Reveal>
  );
}
