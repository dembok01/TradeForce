import { Badge } from "@/components/ui/badge";

const CONFIG = {
  active: { label: "Active", variant: "success" as const },
  warning: { label: "Warning", variant: "warning" as const },
  suspended: { label: "Suspended", variant: "destructive" as const },
};

export function RuleStatusBadge({ status }: { status: "active" | "warning" | "suspended" }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
