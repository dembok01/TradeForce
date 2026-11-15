import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * What a free account cannot do, said once, where the thing it cannot do is.
 *
 * The free dashboard is not a teaser: the charter, the journal, the analytics
 * and every number on screen are real and stay. What a payment buys is the
 * part that costs us money to run and the part that actually intervenes — the
 * EA key, the hosted terminal, and enforcement itself.
 *
 * Saying that plainly is the point. A locked panel that implies the whole
 * product is withheld makes a trader wonder what else is pretend.
 */
export function PaywallNotice({
  title = "Enforcement starts when you pay",
  children,
  expired = false,
  className,
}: {
  title?: string;
  children?: React.ReactNode;
  expired?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("border-primary/30 bg-primary/5", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="size-4 text-primary" aria-hidden />
          {expired ? "Your paid period has ended" : title}
        </CardTitle>
        <CardDescription>
          {children ?? (
            <>
              Your dashboard, charter and journal stay open and keep working. The EA key, the
              hosted terminal and rule enforcement in MetaTrader start once a payment is
              confirmed.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="gold" asChild>
          <Link href="/pay">{expired ? "Renew your plan" : "Choose a plan"}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
