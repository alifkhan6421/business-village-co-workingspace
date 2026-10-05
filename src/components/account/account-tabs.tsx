"use client";
import { usePathname } from "next/navigation";
import { Building2, CalendarDays, LayoutDashboard, Settings, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = { dashboard: LayoutDashboard, bookings: CalendarDays, spaces: Building2, profile: UserRound, settings: Settings } as const;

export type AccountNavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean };

/** Sidebar on desktop, scrollable pill row on phones. */
export function AccountTabs({ tabs, label }: { tabs: AccountNavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {tabs.map((t) => {
          const path = t.href.split("#")[0];
          const active = !t.href.includes("#") && (t.exact ? pathname === path : pathname === path || pathname.startsWith(path + "/"));
          const Icon = ICONS[t.icon];
          return (
            <li key={t.href}>
              <a
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
