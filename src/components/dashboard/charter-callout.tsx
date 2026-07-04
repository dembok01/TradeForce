import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * The one gold "next action" callout — shared by every page that previously
 * hand-rolled its own version, so "nothing here yet" always looks the same.
 */
export function CharterCallout({
  title,
  href,
  cta,
  children,
}: {
  title: string;
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-gold-glow rounded-xl border border-primary/30 bg-primary/5 p-5">
      <p className="font-display text-base font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
      <Button variant="gold" size="sm" className="mt-4" asChild>
        <Link href={href}>{cta}</Link>
      </Button>
    </div>
  );
}
