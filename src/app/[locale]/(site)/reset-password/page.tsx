import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/reset-form";
import { FormAlert } from "@/components/forms/form-alert";
import { buildMetadata } from "@/lib/seo";
import { localizeHref } from "@/lib/href";
import { getCurrentUser } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "auth" });
  return buildMetadata({ locale, internalPath: "/reset-password", title: t("resetTitle"), noindex: true });
}

export default async function ResetPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth" });
  const current = await getCurrentUser();
  return (
    <AuthShell title={t("resetTitle")} subtitle={t("resetSubtitle")}>
      {current ? (
        <ResetForm />
      ) : (
        <div className="space-y-3">
          <FormAlert>{t("resetNoSession")}</FormAlert>
          <a className="text-sm text-primary hover:underline" href={localizeHref("/forgot-password", locale)}>{t("forgotTitle")}</a>
        </div>
      )}
    </AuthShell>
  );
}
