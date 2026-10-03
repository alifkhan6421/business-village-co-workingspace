"use client";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLinks({ items }: { items: { href: string; label: string; newTab: boolean }[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((i) => {
        const active = i.href === pathname || (i.href.split("/").length > 2 && pathname.startsWith(i.href + "/"));
        return (
          <a
            key={i.href + i.label}
            href={i.href}
            target={i.newTab ? "_blank" : undefined}
            rel={i.newTab ? "noopener noreferrer" : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              active && "text-foreground",
            )}
          >
            {i.label}
          </a>
        );
      })}
    </>
  );
}
