import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * What is locked until a plan is active, said where the locked thing is.
 *
 * Before paying, a trader can write their rules and sessions and nothing else:
 * the EA, the hosted terminal, the journal and the records all need a plan.
 * Saying exactly that, and nothing vaguer, is the point.
 */
export function PaywallNotice({
  title = "Unlock with a plan",
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
              Connect MT5, see every trade and get your rules enforced live. Your rules and
              sessions save now and will be waiting.
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
