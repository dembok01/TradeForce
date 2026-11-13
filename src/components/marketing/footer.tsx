import Link from "next/link";

/**
 * Three columns, as the reference has them: brand blurb, then two link lists.
 *
 * Every link goes somewhere that exists. The reference's footer carries Privacy
 * Policy, Terms and Blog; those pages are not in this app, and a footer link to
 * a 404 is worse than a shorter footer.
 */
const PRODUCT = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#proof", label: "Live demo" },
  { href: "#pricing", label: "Pricing" },
];

const ACCOUNT = [
  { href: "/login", label: "Sign in" },
  { href: "/signup", label: "Create account" },
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
              Discipline enforced in the terminal, not recorded after the fact. Set the charter
              once; the Expert Advisor is what holds you to it.
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
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-14 border-t border-border/60 pt-8">
          <p className="text-xs text-muted-foreground">
            TradeForce — discipline enforced, automatically. Trading carries risk; rule
            enforcement reduces breaches, it does not produce profits.
          </p>
        </div>
      </div>
    </footer>
  );
}
