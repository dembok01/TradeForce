import {
  LayoutGrid,
  ShieldCheck,
  Clock,
  TriangleAlert,
  BookText,
  Settings,
  Cable,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

/** `paid`: locked until a plan is active. Rules, sessions and billing never are. */
export type NavItem = { href: string; label: string; icon: LucideIcon; paid?: boolean };

export const DASHBOARD_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/trading-plan", label: "Trading Plan", icon: ShieldCheck, paid: true },
  { href: "/dashboard/sessions", label: "Sessions", icon: Clock },
  { href: "/dashboard/violations", label: "Violations", icon: TriangleAlert, paid: true },
  { href: "/dashboard/journal", label: "Journal & Analytics", icon: BookText, paid: true },
  { href: "/dashboard/ea-setup", label: "EA Setup", icon: Cable, paid: true },
  { href: "/dashboard/settings", label: "Rule Settings", icon: Settings },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];
