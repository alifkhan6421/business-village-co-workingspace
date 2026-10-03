"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useErrorText } from "@/components/forms/use-error-text";
import { MediaPickerDialog, UploadButton } from "./media-picker";
import { setGallery, type ResourceKind } from "@/lib/admin/resources";
import { updateMedia, type MediaItem } from "@/lib/admin/media";

type Entry = { media: MediaItem; altDe: string; altEn: string; dirty: boolean };

export function GalleryManager({
  kind,
  resourceId,
  initial,
  initialCoverId,
}: {
  kind: ResourceKind;
  resourceId: string;
  initial: MediaItem[];
  initialCoverId: string | null;
}) {
  const t = useTranslations("admin.gallery");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>(
    initial.map((m) => ({ media: m, altDe: m.alt_text_de, altEn: m.alt_text_en, dirty: false })),
  );
  const [cover, setCover] = useState<string | null>(initialCoverId ?? initial[0]?.id ?? null);
  const [changed, setChanged] = useState(false);
  const [picker, setPicker] = useState(false);
  const [pending, start] = useTransition();

  const add = (items: MediaItem[]) => {
    setEntries((cur) => {
      const have = new Set(cur.map((e) => e.media.id));
      const next = [...cur, ...items.filter((m) => !have.has(m.id)).map((m) => ({ media: m, altDe: m.alt_text_de, altEn: m.alt_text_en, dirty: false }))];
      if (!cover && next[0]) setCover(next[0].media.id);
      return next;
    });
    setChanged(true);
  };
  const move = (i: number, d: -1 | 1) => {
    setEntries((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setChanged(true);
  };
  const remove = (id: string) => {
    setEntries((cur) => cur.filter((e) => e.media.id !== id));
    if (cover === id) setCover(entries.find((e) => e.media.id !== id)?.media.id ?? null);
    setChanged(true);
  };
  const setAlt = (id: string, field: "altDe" | "altEn", value: string) => {
    setEntries((cur) => cur.map((e) => (e.media.id === id ? { ...e, [field]: value, dirty: true } : e)));
    setChanged(true);
  };

  const save = () =>
    start(async () => {
      for (const e of entries.filter((x) => x.dirty)) {
        const fd = new FormData();
        fd.set("id", e.media.id);
        fd.set("title", e.media.title);
        fd.set("alt_text_de", e.altDe);
        fd.set("alt_text_en", e.altEn);
        const r = await updateMedia(null, fd);
        if (!r.ok) {
          toast.error(errorText(r.error));
          return;
        }
      }
      const res = await setGallery(kind, resourceId, entries.map((e) => e.media.id), cover);
      if (!res.ok) {
        toast.error(errorText(res.error));
        return;
      }
      setEntries((cur) => cur.map((e) => ({ ...e, dirty: false })));
      setChanged(false);
      toast.success(t("saved"));
      router.refresh();
    });

  return (
    <div className="space-y-4" data-testid="gallery-manager">
      <div className="flex flex-wrap gap-2">
        <UploadButton onUploaded={add} />
        <Button type="button" variant="outline" onClick={() => setPicker(true)}>
          <ImagePlus /> {t("fromLibrary")}
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {entries.map((e, i) => (
            <li key={e.media.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row" data-testid="gallery-item">
              <div className="relative w-full shrink-0 sm:w-40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.media.file_url} alt={e.altDe} className="aspect-[4/3] w-full rounded-md bg-muted object-cover" />
                {cover === e.media.id ? (
                  <Badge variant="success" className="absolute left-1.5 top-1.5">
                    <Star className="h-3 w-3" /> {t("cover")}
                  </Badge>
                ) : null}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="space-y-1">
                  <Label htmlFor={`alt-de-${e.media.id}`} className="text-xs">{t("altDe")}</Label>
                  <Input id={`alt-de-${e.media.id}`} value={e.altDe} maxLength={300} onChange={(ev) => setAlt(e.media.id, "altDe", ev.target.value)} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`alt-en-${e.media.id}`} className="text-xs">{t("altEn")}</Label>
                  <Input id={`alt-en-${e.media.id}`} value={e.altEn} maxLength={300} onChange={(ev) => setAlt(e.media.id, "altEn", ev.target.value)} className="h-8" />
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={tc("moveUp")}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === entries.length - 1} aria-label={tc("moveDown")}>
                    <ArrowDown />
                  </Button>
                  {cover !== e.media.id ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCover(e.media.id);
                        setChanged(true);
                      }}
                    >
                      <Star /> {t("setCover")}
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => remove(e.media.id)} title={t("removeHint")}>
                    <Trash2 /> {t("remove")}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-end gap-3">
        {changed ? <span className="text-sm text-amber-700">{t("unsaved")}</span> : null}
        <Button type="button" onClick={save} disabled={pending || !changed} data-testid="gallery-save">
          {pending ? <Loader2 className="animate-spin" /> : null}
          {tc("save")}
        </Button>
      </div>
      <MediaPickerDialog open={picker} onOpenChange={setPicker} multiple onPick={add} excludeIds={entries.map((e) => e.media.id)} />
    </div>
  );
}
