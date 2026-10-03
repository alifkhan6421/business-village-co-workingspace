"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("common");
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <ErrorState title={t("errorTitle")} description={t("unknownError")} action={<Button onClick={reset}>{t("tryAgain")}</Button>} />
    </div>
  );
}
