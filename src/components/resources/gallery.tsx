"use client";
import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Img = { id: string; url: string; alt: string };

export function Gallery({ images, name }: { images: Img[]; name: string }) {
  const [index, setIndex] = useState(0);
  const t = useTranslations("site");
  if (!images.length) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <ImageIcon className="h-12 w-12" />
      </div>
    );
  }
  const current = images[index];
  const go = (d: number) => setIndex((i) => (i + d + images.length) % images.length);
  return (
    <div className="space-y-3" data-testid="gallery" aria-label={t("resourceGallery")}>
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-muted">
        <Image src={current.url} alt={current.alt || name} fill priority={index === 0} sizes="(max-width: 1024px) 100vw, 66vw" className="object-cover" data-testid="gallery-main" />
        {images.length > 1 ? (
          <>
            <button type="button" onClick={() => go(-1)} aria-label={t("previousImage")} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-2 shadow hover:bg-background">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label={t("nextImage")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-2 shadow hover:bg-background">
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
              {t("imageOf", { index: index + 1, total: images.length })}
            </span>
          </>
        ) : null}
      </div>
      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={t("imageOf", { index: i + 1, total: images.length })}
              aria-current={i === index}
              className={cn("relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2", i === index ? "border-primary" : "border-transparent opacity-80 hover:opacity-100")}
            >
              <Image src={img.url} alt="" fill sizes="96px" className="object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
