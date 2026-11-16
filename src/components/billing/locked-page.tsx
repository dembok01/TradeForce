import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaywallNotice } from "@/components/billing/paywall-notice";
import { Reveal } from "@/components/motion/reveal";

/**
 * A whole dashboard page that needs a plan. Rendered by the page itself, before
 * it reads anything else, so a locked page never fetches data it will not show.
 */
export function LockedPage({
  eyebrow,
  title,
  expired,
  children,
}: {
  eyebrow: string;
  title: string;
  expired: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <PageHeader eyebrow={eyebrow} title={title} />
      <Reveal>
        <PaywallNotice title={`${title} unlocks with a plan`} expired={expired}>
          {children}
        </PaywallNotice>
      </Reveal>
      <p className="mt-6 text-sm text-muted-foreground">
        Meanwhile, set your{" "}
        <Link href="/dashboard/settings" className="text-primary hover:underline">
          rules
        </Link>{" "}
        and{" "}
        <Link href="/dashboard/sessions" className="text-primary hover:underline">
          sessions
        </Link>
        . They save now and apply the moment you connect.
      </p>
    </div>
  );
}
