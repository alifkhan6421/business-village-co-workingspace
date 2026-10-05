"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  LayoutDashboard,
  Mail,
  Megaphone,
  MessageSquare,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
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
      { path: "/bookings", key: "bookings", icon: ClipboardList },
      { path: "/calendar", key: "calendar", icon: CalendarDays },
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
      { path: "/inquiries", key: "inquiries", icon: MessageSquare },
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

function NavList({ onNavigate, badges, collapsed }: { onNavigate?: () => void; badges: Record<string, number>; collapsed?: boolean }) {
  const t = useTranslations("admin.nav");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const base = `/${locale}/admin`;
  return (
    <nav className="flex flex-col gap-5" aria-label={t("adminArea")}>
      {GROUPS.map((g) => (
        <div key={g.key}>
          {collapsed ? (
            <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden="true" />
          ) : (
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t(g.key)}</div>
          )}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => {
              const href = base + i.path;
              const active = i.path === "" ? pathname === base : pathname === href || pathname.startsWith(href + "/");
              const Icon = i.icon;
              const badge = badges[i.key];
              return (
                <li key={i.key}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? t(i.key) : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      collapsed && "justify-center px-0",
                      active ? "bg-primary/10 text-primary" : "text-foreground/70 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {collapsed ? (
                      <span className="sr-only">{t(i.key)}</span>
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{t(i.key)}</span>
                    )}
                    {badge ? (
                      <span
                        className={cn(
                          "rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-[18px] text-primary-foreground",
                          collapsed && "absolute right-1.5 top-1 min-w-[18px] text-center",
                        )}
                      >
                        {badge}
                      </span>
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

const COLLAPSE_KEY = "bv-admin-sidebar";

export function AdminShell({
  children,
  userName,
  userEmail,
  badges,
  siteHref,
  brand,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  badges: Record<string, number>;
  siteHref: string;
  brand: React.ReactNode;
}) {
  const t = useTranslations("admin.nav");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };
  const initials = userName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-surface">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-background transition-[width] duration-200 lg:flex",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <div className={cn("flex h-16 items-center border-b", collapsed ? "justify-center px-2" : "px-4")}>
          <a href={siteHref} className="min-w-0 overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={t("viewSite")}>
            {collapsed ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-[13px] font-bold text-primary-foreground">BV</span>
            ) : (
              brand
            )}
          </a>
        </div>
        <div className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
          <NavList badges={badges} collapsed={collapsed} />
        </div>
        <div className={cn("border-t p-3", collapsed && "px-2")}>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
            title={collapsed ? t("expand") : undefined}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
            {collapsed ? <span className="sr-only">{t("expand")}</span> : <span>{t("collapse")}</span>}
          </button>
        </div>
      </aside>
      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[4.5rem]" : "lg:pl-64")}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={tc("openMenu")}>
                <Menu className="!size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" closeLabel={tc("close")} className="max-w-[18rem] p-4">
              <SheetTitle className="pr-8">{brand}</SheetTitle>
              <NavList badges={badges} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="truncate font-semibold lg:hidden">{t("adminArea")}</span>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <a
              href={siteHref}
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
            >
              <ExternalLink className="h-4 w-4" /> {t("viewSite")}
            </a>
            <LanguageSwitcher />
            <div className="hidden items-center gap-2.5 border-l pl-3 md:flex">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden="true">
                {initials || "A"}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block max-w-[11rem] truncate text-sm font-semibold">{userName}</span>
                <span className="block max-w-[11rem] truncate text-xs text-muted-foreground">{userEmail}</span>
              </span>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
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
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
            ← {back.label}
          </Link>
        ) : null}
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
