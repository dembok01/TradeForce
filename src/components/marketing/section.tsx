import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

/**
 * The shared shell every landing section sits in. It owns the vertical rhythm,
 * the container width and the header treatment — eyebrow pill, display heading,
 * lead paragraph — so no section restates them and they cannot drift apart.
 *
 * Passing `children={null}` renders nothing at all, not an empty band with a
 * heading over it. That is how the sections whose data ships empty
 * (testimonials, blog, stat strip) disappear without leaving a hole between
 * their neighbours.
 */
export function Section({
  id,
  eyebrow,
  title,
  description,
  children,
  className,
  headerClassName,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
}) {
  if (children === null || children === undefined || children === false) return null;

  return (
    <section
      id={id}
      className={cn("border-t border-border/60 bg-obsidian py-20 sm:py-28", className)}
    >
      <div className="mx-auto max-w-6xl px-6">
        {(eyebrow || title || description) && (
          // y={48} rather than Reveal's default 12: the reference's entrances
          // travel further. The default is left alone because dashboard code
          // depends on it.
          <Reveal y={48} className={cn("mb-12 max-w-2xl sm:mb-16", headerClassName)}>
            {eyebrow && <p className="eyebrow mb-5">{eyebrow}</p>}
            {title && <h2 className="type-h2">{title}</h2>}
            {description && (
              <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
                {description}
              </p>
            )}
          </Reveal>
        )}
        {children}
      </div>
    </section>
  );
}
