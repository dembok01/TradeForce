import { Badge } from "@/components/ui/badge";
import type { AccountStatus } from "@/lib/data/dashboard";

const CONFIG: Record<AccountStatus, { label: string; variant: "secondary" | "success" | "warning" | "destructive" }> = {
  not_configured: { label: "Not configured", variant: "secondary" },
  safe: { label: "Safe", variant: "success" },
  warning: { label: "Warning", variant: "warning" },
  locked: { label: "Locked", variant: "destructive" },
};

export function StatusBadge({ status }: { status: AccountStatus }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
