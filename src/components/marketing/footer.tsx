import Link from "next/link";

/**
 * Three columns, as the reference has them: brand blurb, then two link lists.
 *
 * Every link goes somewhere that exists. The reference's footer carries a Blog
 * that this app does not have, and a footer link to a 404 is worse than a
 * shorter footer.
 *
 * This is also where the free account lives. The client asked for the buy path
 * to be the only one visible above the fold and for the free option to be
 * reachable "only if they scroll down enough" — so it is a line of plain text
 * at the bottom of the page rather than a button, next to the sign-in link a
 * returning free user needs anyway. Reachable, not advertised: no dark
 * pattern, no hidden tier, just not competing with the thing being sold.
 */
const PRODUCT = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#proof", label: "Live demo" },
  { href: "#pricing", label: "Pricing" },
];

const ACCOUNT = [
  { href: "/pay", label: "Get access" },
  { href: "/login", label: "Sign in" },
  { href: "#faq", label: "FAQ" },
  { href: "#contact", label: "Contact" },
];

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-obsidian py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr] lg:gap-8">
          <div className="max-w-sm">
            <span className="text-lg font-semibold tracking-[-0.04em]">
              Trade<span className="text-gradient-gold">Force</span>
            </span>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Discipline enforced in the terminal, not recorded after the fact.
            </p>
          </div>

          <nav aria-label="Product">
            <h2 className="text-sm font-medium">Product</h2>
            <ul className="mt-4 space-y-3">
              {PRODUCT.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Account">
            <h2 className="text-sm font-medium">Account</h2>
            <ul className="mt-4 space-y-3">
              {ACCOUNT.map((link) => (
                <li key={link.href}>
                  {link.href.startsWith("#") ? (
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-14 border-t border-border/60 pt-8">
          <p className="text-sm text-muted-foreground">
            Not ready to pay?{" "}
            <Link
              href="/signup?next=/onboarding"
              className="text-foreground underline underline-offset-4 hover:text-primary"
            >
              Start free
            </Link>
            : set your rules and log trades by hand. MT5 enforcement starts when you pay.
          </p>
          <p className="mt-6 text-xs text-muted-foreground">
            Trading carries risk. Enforcement is best effort and does not produce profits. See
            the{" "}
            <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
