"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Activity,
  Building2,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  Mail,
  Megaphone,
  Menu,
  Monitor,
  Settings,
  Sparkles,
  UserRound,
  Users,
  DoorOpen,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/site/language-switcher";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";

type Item = { path: string; key: string; icon: React.ComponentType<{ className?: string }> };
const GROUPS: { key: string; items: Item[] }[] = [
  {
    key: "operations",
    items: [
      { path: "", key: "overview", icon: LayoutDashboard },
      { path: "/calendar", key: "calendar", icon: CalendarDays },
      { path: "/bookings", key: "bookings", icon: ClipboardList },
    ],
  },
  {
    key: "resources",
    items: [
      { path: "/workspaces", key: "workspaces", icon: Monitor },
      { path: "/rooms", key: "rooms", icon: DoorOpen },
      { path: "/amenities", key: "amenities", icon: Sparkles },
    ],
  },
  {
    key: "people",
    items: [
      { path: "/users", key: "users", icon: Users },
      { path: "/guests", key: "guests", icon: UserRound },
      { path: "/inquiries", key: "inquiries", icon: Inbox },
      { path: "/announcements", key: "announcements", icon: Megaphone },
    ],
  },
  {
    key: "content",
    items: [
      { path: "/website", key: "website", icon: Globe },
      { path: "/media", key: "media", icon: ImageIcon },
    ],
  },
  {
    key: "system",
    items: [
      { path: "/email-logs", key: "emailLogs", icon: Mail },
      { path: "/activity", key: "activity", icon: Activity },
      { path: "/settings", key: "settings", icon: Settings },
    ],
  },
];

function NavList({ onNavigate, badges }: { onNavigate?: () => void; badges: Record<string, number> }) {
  const t = useTranslations("admin.nav");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const base = `/${locale}/admin`;
  return (
    <nav className="flex flex-col gap-5" aria-label={t("adminArea")}>
      {GROUPS.map((g) => (
        <div key={g.key}>
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t(g.key)}</div>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => {
              const href = base + i.path;
              const active = i.path === "" ? pathname === base : pathname === href || pathname.startsWith(href + "/");
              const Icon = i.icon;
              return (
                <li key={i.key}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted",
                      active ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{t(i.key)}</span>
                    {badges[i.key] ? (
                      <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{badges[i.key]}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({
  children,
  userName,
  badges,
  siteHref,
}: {
  children: React.ReactNode;
  userName: string;
  badges: Record<string, number>;
  siteHref: string;
}) {
  const t = useTranslations("admin.nav");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-background lg:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Building2 className="h-5 w-5 text-primary" />
          <span className="whitespace-nowrap text-sm font-semibold">Business Village</span>
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{t("adminArea")}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <NavList badges={badges} />
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={tc("openMenu")}>
                <Menu className="!size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" closeLabel={tc("close")}>
              <SheetTitle className="font-semibold">Business Village · {t("adminArea")}</SheetTitle>
              <NavList badges={badges} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-semibold lg:hidden">{t("adminArea")}</span>
          <div className="ml-auto flex items-center gap-2">
            <a href={siteHref} className="hidden items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:flex">
              <ExternalLink className="h-4 w-4" /> {t("viewSite")}
            </a>
            <LanguageSwitcher />
            <span className="hidden max-w-[12rem] truncate text-sm font-medium md:inline">{userName}</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

export function AdminPageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-1 inline-block text-sm text-muted-foreground hover:text-foreground">
            ← {back.label}
          </Link>
        ) : null}
        <h1 className="break-words text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
