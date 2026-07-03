import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-obsidian px-6 text-center">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
        404 — Not on the ledger
      </p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        This page isn&apos;t in the charter.
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
        The address may have changed, or it never existed. Nothing on your
        account was touched.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="gold" asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}
