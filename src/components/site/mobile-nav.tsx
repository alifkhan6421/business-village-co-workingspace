"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./language-switcher";
import { isActiveHref } from "./nav-links";

export function MobileNav({
  items,
  title,
  bookHref,
  bookLabel,
  auth,
}: {
  items: { href: string; label: string; newTab: boolean; active: boolean }[];
  title: string;
  bookHref: string;
  bookLabel: string;
  auth: { loginHref: string; loginLabel: string; signupHref: string; signupLabel: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("common");
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="-mr-2 lg:hidden" aria-label={t("openMenu")}>
          <Menu className="!size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={t("close")} className="gap-6 pt-6">
        <SheetTitle className="text-base font-bold tracking-tight">{title}</SheetTitle>
        <nav className="-mx-2 flex flex-col gap-0.5" onClick={() => setOpen(false)}>
          {items.map((i) => {
            const active = isActiveHref(i.href, pathname);
            return (
              <a
                key={i.href + i.label}
                href={i.href}
                target={i.newTab ? "_blank" : undefined}
                rel={i.newTab ? "noopener noreferrer" : undefined}
                aria-current={active ? "page" : undefined}
                className={cn("rounded-lg px-3 py-3 text-[15px] font-medium hover:bg-muted", active && "bg-muted text-primary")}
              >
                {i.label}
              </a>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t pt-5" onClick={() => setOpen(false)}>
          <Button asChild size="lg">
            <a href={bookHref}>{bookLabel}</a>
          </Button>
          {auth ? (
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline">
                <a href={auth.loginHref}>{auth.loginLabel}</a>
              </Button>
              <Button asChild variant="ghost">
                <a href={auth.signupHref}>{auth.signupLabel}</a>
              </Button>
            </div>
          ) : null}
        </div>
        <LanguageSwitcher className="self-start" />
      </SheetContent>
    </Sheet>
  );
}
