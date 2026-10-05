"use client";
import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Grid2X2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Img = { id: string; url: string; alt: string; stock?: boolean };

function Photo({ img, name, sizes, priority, className }: { img: Img; name: string; sizes: string; priority?: boolean; className?: string }) {
  return (
    <Image
      src={img.url}
      alt={img.alt || name}
      fill
      priority={priority}
      sizes={sizes}
      unoptimized={!!img.stock}
      className={cn("object-cover", className)}
    />
  );
}

/** Photo grid on larger screens, swipeable strip on phones; any photo opens a full-size viewer. */
export function Gallery({ images, name }: { images: Img[]; name: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const t = useTranslations("site");
  const tc = useTranslations("common");
  if (!images.length) return null;
  const show = (i: number) => {
    setIndex(i);
    setOpen(true);
  };
  const go = (d: number) => setIndex((i) => (i + d + images.length) % images.length);
  const grid = images.slice(0, 5);
  const current = images[index];

  return (
    <div data-testid="gallery" aria-label={t("resourceGallery")}>
      {/* Phones: horizontal swipe */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 md:hidden">
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => show(i)}
            className="relative aspect-[4/3] w-[88%] shrink-0 snap-center overflow-hidden rounded-2xl bg-muted"
            aria-label={t("imageOf", { index: i + 1, total: images.length })}
          >
            <Photo img={img} name={name} sizes="90vw" priority={i === 0} />
            {images.length > 1 ? (
              <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                {i + 1} / {images.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Tablet and up: photo grid */}
      <div
        className={cn(
          "relative hidden gap-2 overflow-hidden rounded-3xl md:grid",
          grid.length === 1 && "aspect-[21/9] grid-cols-1",
          grid.length === 2 && "aspect-[21/9] grid-cols-2",
          grid.length >= 3 && "h-[440px] grid-cols-4 grid-rows-2",
        )}
      >
        {grid.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => show(i)}
            className={cn(
              "group relative overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              grid.length >= 3 && i === 0 && "col-span-2 row-span-2",
              grid.length === 3 && i > 0 && "col-span-2",
              grid.length === 4 && i === 3 && "col-span-2",
            )}
            aria-label={t("imageOf", { index: i + 1, total: images.length })}
            data-testid={i === 0 ? "gallery-main" : undefined}
          >
            <Photo
              img={img}
              name={name}
              sizes={i === 0 ? "(max-width: 1280px) 50vw, 640px" : "(max-width: 1280px) 25vw, 320px"}
              priority={i === 0}
              className="transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transform-none"
            />
          </button>
        ))}
        {images.length > 1 ? (
          <button
            type="button"
            onClick={() => show(0)}
            className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold shadow-md hover:bg-white/90"
          >
            <Grid2X2 className="h-4 w-4" /> {t("showAllPhotos", { count: images.length })}
          </button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tc("close")} className="max-w-5xl gap-3 p-3 sm:p-4">
          <DialogTitle className="pr-10 text-sm font-semibold">
            {name} · {t("imageOf", { index: index + 1, total: images.length })}
          </DialogTitle>
          <div className="relative aspect-[3/2] overflow-hidden rounded-xl bg-muted">
            <Photo img={current} name={name} sizes="(max-width: 1024px) 100vw, 1000px" className="object-contain" />
            {images.length > 1 ? (
              <>
                <button type="button" onClick={() => go(-1)} aria-label={t("previousImage")} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md hover:bg-white">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button type="button" onClick={() => go(1)} aria-label={t("nextImage")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md hover:bg-white">
                  <ChevronRight className="h-5 w-5" />
                </button>
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
                  className={cn("relative h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 ring-offset-1", i === index ? "ring-primary" : "ring-transparent opacity-70 hover:opacity-100")}
                >
                  <Photo img={img} name={name} sizes="80px" />
                </button>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
