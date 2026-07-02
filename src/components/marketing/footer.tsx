import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-obsidian py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <span className="font-display text-sm tracking-tight text-muted-foreground">
          Trade<span className="text-primary">Force</span> — discipline enforced, automatically.
        </span>
        <div className="flex items-center gap-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
          <a href="#pricing" className="hover:text-foreground">
            Pricing
          </a>
          <a href="#contact" className="hover:text-foreground">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
