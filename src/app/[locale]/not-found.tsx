import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "common" });
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-semibold text-primary">404</p>
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFoundText")}</p>
      <Button asChild>
        <a href={`/${locale}`}>{t("goHome")}</a>
      </Button>
    </div>
  );
}
