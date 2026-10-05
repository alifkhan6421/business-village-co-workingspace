"use client";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function isActiveHref(href: string, pathname: string) {
  return href === pathname || (href.split("/").length > 2 && pathname.startsWith(href + "/"));
}

export function NavLinks({ items }: { items: { href: string; label: string; newTab: boolean }[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((i) => {
        const active = isActiveHref(i.href, pathname);
        return (
          <a
            key={i.href + i.label}
            href={i.href}
            target={i.newTab ? "_blank" : undefined}
            rel={i.newTab ? "noopener noreferrer" : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-muted text-foreground",
            )}
          >
            {i.label}
          </a>
        );
      })}
    </>
  );
}
