"use client";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, LayoutDashboard, LogOut, Shield, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-actions";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";

export function UserMenu({ name, email, isAdmin }: { name: string; email: string; isAdmin: boolean }) {
  const t = useTranslations("nav");
  const locale = useLocale() as Locale;
  const initials = (name || email).split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 rounded-full pl-1 pr-1 lg:pr-3" data-testid="user-menu">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground ring-1 ring-primary/10">{initials}</span>
          <span className="hidden max-w-[9rem] truncate lg:inline">{(name || email).split(" ")[0]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={localizeHref("/account", locale)}>
            <LayoutDashboard /> {t("dashboard")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={localizeHref("/account/bookings", locale)}>
            <CalendarDays /> {t("myBookings")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={localizeHref("/account/profile", locale)}>
            <User /> {t("profile")}
          </a>
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <a href={`/${locale}/admin`}>
              <Shield /> {t("admin")}
            </a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut(locale)}>
          <LogOut /> {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
