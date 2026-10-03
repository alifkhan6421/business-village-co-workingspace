"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Two-click map embed: nothing is loaded from the map provider until the visitor agrees. */
export function MapEmbed({ url, title }: { url: string; title: string }) {
  const [show, setShow] = useState(false);
  const t = useTranslations("site");
  return (
    <div className="aspect-[16/9] overflow-hidden rounded-xl border bg-muted">
      {show ? (
        <iframe src={url} title={title || "Map"} className="h-full w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-popups" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">{t("mapConsentText")}</p>
          <Button variant="outline" onClick={() => setShow(true)}>{t("mapLoad")}</Button>
        </div>
      )}
    </div>
  );
}
