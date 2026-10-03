"use client";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AccountTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="mt-3 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <a
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium", active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </a>
        );
      })}
    </nav>
  );
}
