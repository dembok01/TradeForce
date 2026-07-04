import {
  LayoutGrid,
  ShieldCheck,
  Clock,
  TriangleAlert,
  BookText,
  BarChart3,
  Settings,
  Cable,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const DASHBOARD_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/trading-plan", label: "Trading Plan", icon: ShieldCheck },
  { href: "/dashboard/sessions", label: "Sessions", icon: Clock },
  { href: "/dashboard/violations", label: "Violations", icon: TriangleAlert },
  { href: "/dashboard/journal", label: "Journal", icon: BookText },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/ea-setup", label: "EA Setup", icon: Cable },
  { href: "/dashboard/settings", label: "Rule Settings", icon: Settings },
];
