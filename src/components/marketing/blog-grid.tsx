import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { Reveal } from "@/components/motion/reveal";
import { POSTS } from "@/lib/marketing/content";

/**
 * Built, and silent for the same reason as the testimonials: there is no CMS
 * and no posts, so `POSTS` ships empty and this renders nothing rather than
 * linking to pages that do not exist.
 *
 * The layout is the reference's — one featured post, three compact ones — and
 * appears the moment real posts exist.
 */
export function BlogGrid() {
  if (POSTS.length === 0) return null;

  const [featured, ...rest] = POSTS;

  return (
    <Section
      eyebrow="Blog"
      title="Notes on discipline, drawdown and funded accounts."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal y={48}>
          <Link
            href={`/blog/${featured.slug}`}
            className="group flex h-full flex-col rounded-card border border-border bg-card p-8 transition-colors hover:border-primary/30"
          >
            <span className="eyebrow self-start">{featured.category}</span>
            <h3 className="mt-6 text-2xl font-medium tracking-[-0.03em]">{featured.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {featured.excerpt}
            </p>
            <span className="mt-auto flex items-center gap-2 pt-8 text-sm text-primary">
              Read more
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </Reveal>

        <div className="grid gap-4">
          {rest.map((post, i) => (
            <Reveal key={post.slug} y={48} delay={0.06 * (i + 1)}>
              <Link
                href={`/blog/${post.slug}`}
                className="group flex items-center justify-between gap-6 rounded-card border border-border bg-card p-7 transition-colors hover:border-primary/30"
              >
                <span>
                  <span className="text-xs uppercase tracking-wider text-primary/80">
                    {post.category}
                  </span>
                  <span className="mt-2 block font-medium tracking-[-0.02em]">{post.title}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}
