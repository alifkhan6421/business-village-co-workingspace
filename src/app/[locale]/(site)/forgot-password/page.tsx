import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotForm } from "@/components/auth/forgot-form";
import { buildMetadata } from "@/lib/seo";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "auth" });
  return buildMetadata({ locale, internalPath: "/forgot-password", title: t("forgotTitle"), noindex: true });
}

export default async function ForgotPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth" });
  return (
    <AuthShell
      title={t("forgotTitle")}
      subtitle={t("forgotSubtitle")}
      footer={<a className="text-primary hover:underline" href={localizeHref("/login", locale)}>{t("backToLogin")}</a>}
    >
      <ForgotForm />
    </AuthShell>
  );
}
