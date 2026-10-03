"use client";
import { useState } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./language-switcher";

export function MobileNav({
  items,
  actions,
  title,
}: {
  items: { href: string; label: string; newTab: boolean; active: boolean }[];
  actions: React.ReactNode;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("common");
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="xl:hidden" aria-label={t("openMenu")}>
          <Menu className="!size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={t("close")}>
        <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
        <nav className="flex flex-col gap-1" onClick={() => setOpen(false)}>
          {items.map((i) => (
            <a
              key={i.href + i.label}
              href={i.href}
              target={i.newTab ? "_blank" : undefined}
              rel={i.newTab ? "noopener noreferrer" : undefined}
              className={`rounded-md px-3 py-2.5 text-base hover:bg-muted ${i.active ? "bg-muted font-semibold" : ""}`}
            >
              {i.label}
            </a>
          ))}
        </nav>
        <div className="flex flex-col gap-2 border-t pt-4" onClick={() => setOpen(false)}>
          {actions}
        </div>
        <LanguageSwitcher className="mt-auto" />
      </SheetContent>
    </Sheet>
  );
}
