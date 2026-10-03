import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { buildMetadata } from "@/lib/seo";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ next?: string; error?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return buildMetadata({ locale, internalPath: "/login", title: t("loginTitle"), noindex: true });
}

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, error } = await searchParams;
  const t = await getTranslations({ locale, namespace: "auth" });
  return (
    <AuthShell
      title={t("loginTitle")}
      subtitle={next?.includes("booking=") ? t("loginToBook") : t("loginSubtitle")}
      footer={
        <>
          {t("noAccount")}{" "}
          <a className="font-medium text-primary hover:underline" href={localizeHref("/signup", locale) + (next ? `?next=${encodeURIComponent(next)}` : "")}>
            {t("createAccount")}
          </a>
        </>
      }
    >
      <LoginForm next={next} linkError={error === "link"} />
    </AuthShell>
  );
}
