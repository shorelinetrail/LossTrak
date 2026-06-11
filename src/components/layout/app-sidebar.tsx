"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardEdit,
  BarChart3,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  TableProperties,
  Settings,
  Tags,
  Upload,
  History,
  Factory,
  ChevronDown,
  ChevronRight,
  Activity,
  LineChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

const navigation: (NavItem | NavGroup)[] = [
  { label: "Daily", href: "/daily", icon: ClipboardEdit },
  {
    label: "Reports",
    icon: BarChart3,
    items: [
      { label: "Analysis", href: "/reports/analysis", icon: LineChart },
      { label: "Monthly", href: "/reports/monthly", icon: CalendarDays },
      { label: "Quarterly", href: "/reports/quarterly", icon: CalendarRange },
      { label: "Yearly", href: "/reports/yearly", icon: CalendarClock },
      { label: "Table", href: "/reports/table", icon: TableProperties },
    ],
  },
  {
    label: "Admin",
    icon: Settings,
    items: [
      { label: "Sites & Plants", href: "/admin/sites", icon: Factory },
      { label: "Categories", href: "/admin/categories", icon: Tags },
      { label: "Bulk Upload", href: "/admin/bulk-upload", icon: Upload },
      { label: "Historical Upload", href: "/admin/historical-upload", icon: History },
      { label: "Production Upload", href: "/admin/production-upload", icon: Factory },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

function isNavGroup(item: NavItem | NavGroup): item is NavGroup {
  return "items" in item;
}

export function AppSidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Reports: true,
    Admin: false,
  });

  const toggleGroup = (label: string) => {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-sidebar">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        <Activity className="h-4 w-4 text-primary" />
        <span className="text-sm font-bold tracking-tight">LossTrak</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="space-y-0.5">
          {navigation.map((item) => {
            if (isNavGroup(item)) {
              const isGroupActive = item.items.some((sub) =>
                pathname.startsWith(sub.href)
              );
              const isOpen = expanded[item.label] || isGroupActive;
              return (
                <li key={item.label}>
                  <button
                    onClick={() => toggleGroup(item.label)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      isGroupActive && "text-sidebar-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {isOpen && (
                    <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
                      {item.items.map((sub) => (
                        <li key={sub.href}>
                          <Link
                            href={sub.href}
                            className={cn(
                              "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                              pathname === sub.href
                                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                : "text-sidebar-foreground/60"
                            )}
                          >
                            <sub.icon className="h-3.5 w-3.5" />
                            {sub.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            }
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    pathname === item.href
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
