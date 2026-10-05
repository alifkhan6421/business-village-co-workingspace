"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, Loader2, RefreshCw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useErrorText } from "@/components/forms/use-error-text";
import { MediaPickerDialog, UploadButton, UploadDropzone } from "./media-picker";
import { cn } from "@/lib/utils";
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);

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

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    setEntries((cur) => {
      const next = [...cur];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setChanged(true);
  };
  const replace = (id: string, m: MediaItem) => {
    setEntries((cur) => cur.map((e) => (e.media.id === id ? { media: m, altDe: m.alt_text_de, altEn: m.alt_text_en, dirty: false } : e)));
    if (cover === id) setCover(m.id);
    setChanged(true);
  };

  return (
    <div className="space-y-5" data-testid="gallery-manager">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-stretch">
        <UploadDropzone onUploaded={add} />
        <div className="flex flex-row gap-2 sm:flex-col sm:justify-center">
          <UploadButton onUploaded={add} />
          <Button type="button" variant="outline" onClick={() => setPicker(true)}>
            <ImagePlus /> {t("fromLibrary")}
          </Button>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          {entries.length > 1 ? <p className="text-xs text-muted-foreground">{t("dragHint")}</p> : null}
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {entries.map((e, i) => (
              <li
                key={e.media.id}
                draggable
                onDragStart={(ev) => {
                  setDragIndex(i);
                  ev.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(ev) => {
                  if (dragIndex === null) return;
                  ev.preventDefault();
                  setOverIndex(i);
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  if (dragIndex !== null) reorder(dragIndex, i);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-[box-shadow,opacity]",
                  dragIndex === i && "opacity-50",
                  overIndex === i && dragIndex !== i && "ring-2 ring-primary",
                )}
                data-testid="gallery-item"
              >
                <div className="relative cursor-grab active:cursor-grabbing">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.media.file_url} alt={e.altDe} loading="lazy" className="aspect-[4/3] w-full bg-muted object-cover" draggable={false} />
                  <span className="absolute left-2 top-2 flex items-center gap-1.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-xs font-bold shadow-xs">{i + 1}</span>
                    {cover === e.media.id ? (
                      <Badge variant="success" className="bg-white/95 shadow-xs">
                        <Star className="h-3 w-3 fill-current" /> {t("cover")}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="absolute right-2 top-2 rounded-full bg-white/95 p-1.5 text-muted-foreground shadow-xs" aria-hidden="true">
                    <GripVertical className="h-4 w-4" />
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-3">
                  <div className="space-y-1">
                    <Label htmlFor={`alt-de-${e.media.id}`} className="text-xs">{t("altDe")}</Label>
                    <Input id={`alt-de-${e.media.id}`} value={e.altDe} maxLength={300} onChange={(ev) => setAlt(e.media.id, "altDe", ev.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`alt-en-${e.media.id}`} className="text-xs">{t("altEn")}</Label>
                    <Input id={`alt-en-${e.media.id}`} value={e.altEn} maxLength={300} onChange={(ev) => setAlt(e.media.id, "altEn", ev.target.value)} className="h-9" />
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-1">
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={tc("moveUp")}>
                      <ArrowUp />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === entries.length - 1} aria-label={tc("moveDown")}>
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
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => setReplacing(e.media.id)} aria-label={t("replace")} title={t("replace")}>
                      <RefreshCw />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => remove(e.media.id)} aria-label={t("remove")} title={t("removeHint")}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex items-center justify-end gap-3">
        {changed ? <span className="text-sm text-amber-700">{t("unsaved")}</span> : null}
        <Button type="button" onClick={save} disabled={pending || !changed} data-testid="gallery-save">
          {pending ? <Loader2 className="animate-spin" /> : null}
          {tc("save")}
        </Button>
      </div>
      <MediaPickerDialog open={picker} onOpenChange={setPicker} multiple onPick={add} excludeIds={entries.map((e) => e.media.id)} />
      <MediaPickerDialog
        open={replacing !== null}
        onOpenChange={(o) => !o && setReplacing(null)}
        onPick={(items) => {
          if (replacing && items[0]) replace(replacing, items[0]);
          setReplacing(null);
        }}
        excludeIds={entries.map((e) => e.media.id)}
      />
    </div>
  );
}
