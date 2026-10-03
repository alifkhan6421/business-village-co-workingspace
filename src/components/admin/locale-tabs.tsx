"use client";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * DE / EN tabs. Both panels stay mounted (only hidden), so form fields of
 * both languages are always submitted together.
 */
export function LocaleTabs({
  de,
  en,
  missing = {},
  defaultValue = "de",
}: {
  de: React.ReactNode;
  en: React.ReactNode;
  missing?: { de?: boolean; en?: boolean };
  defaultValue?: "de" | "en";
}) {
  const t = useTranslations("admin.common");
  return (
    <Tabs defaultValue={defaultValue}>
      <TabsList>
        <TabsTrigger value="de" data-testid="tab-de">
          🇩🇪 {t("german")}
          {missing.de ? <span className="h-2 w-2 rounded-full bg-amber-500" title={t("missingGerman")} /> : null}
        </TabsTrigger>
        <TabsTrigger value="en" data-testid="tab-en">
          🇬🇧 {t("english")}
          {missing.en ? <span className="h-2 w-2 rounded-full bg-amber-500" title={t("missingTranslation")} /> : null}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="de" forceMount className="data-[state=inactive]:hidden" lang="de">
        {de}
      </TabsContent>
      <TabsContent value="en" forceMount className="data-[state=inactive]:hidden" lang="en">
        {en}
      </TabsContent>
    </Tabs>
  );
}
