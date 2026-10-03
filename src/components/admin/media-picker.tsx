"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ImagePlus, Loader2, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useErrorText } from "@/components/forms/use-error-text";
import { listMedia, uploadMedia, type MediaItem } from "@/lib/admin/media";
import { cn } from "@/lib/utils";

/** Uploads files one at a time (keeps each request under the body size limit). */
export function useMediaUpload() {
  const [uploading, setUploading] = useState(false);
  const errorText = useErrorText();
  const t = useTranslations("admin.gallery");
  const upload = useCallback(
    async (files: FileList | File[]): Promise<MediaItem[]> => {
      setUploading(true);
      const done: MediaItem[] = [];
      try {
        for (const file of Array.from(files)) {
          const fd = new FormData();
          fd.set("file", file);
          const res = await uploadMedia(fd).catch(() => ({ ok: false as const, error: "uploadFailed" }));
          if (res.ok && res.data) done.push(res.data);
          else if (!res.ok) toast.error(`${file.name}: ${errorText(res.error)}`);
        }
        if (done.length) toast.success(t("uploaded", { count: done.length }));
      } finally {
        setUploading(false);
      }
      return done;
    },
    [errorText, t],
  );
  return { upload, uploading };
}

export function UploadButton({
  onUploaded,
  multiple = true,
  label,
  variant = "outline",
}: {
  onUploaded: (items: MediaItem[]) => void;
  multiple?: boolean;
  label?: string;
  variant?: "outline" | "default";
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useMediaUpload();
  const t = useTranslations("admin.gallery");
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple={multiple}
        className="sr-only"
        data-testid="media-upload-input"
        onChange={async (e) => {
          const files = e.target.files;
          if (!files?.length) return;
          const items = await upload(files);
          e.target.value = "";
          if (items.length) onUploaded(items);
        }}
      />
      <Button type="button" variant={variant} disabled={uploading} onClick={() => ref.current?.click()}>
        {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
        {uploading ? t("uploading") : label ?? t("upload")}
      </Button>
    </>
  );
}

export function MediaPickerDialog({
  open,
  onOpenChange,
  onPick,
  multiple = false,
  excludeIds = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (items: MediaItem[]) => void;
  multiple?: boolean;
  excludeIds?: string[];
}) {
  const t = useTranslations("admin.media");
  const tc = useTranslations("common");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [selected, setSelected] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    const res = await listMedia(term, 120, 0).catch(() => null);
    setItems(res && res.ok && res.data ? res.data.items : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    const id = setTimeout(() => void load(q), q ? 250 : 0);
    return () => clearTimeout(id);
  }, [open, q, load]);

  const toggle = (m: MediaItem) => {
    if (!multiple) {
      setSelected([m]);
      return;
    }
    setSelected((s) => (s.some((x) => x.id === m.id) ? s.filter((x) => x.id !== m.id) : [...s, m]));
  };

  const visible = (items ?? []).filter((m) => !excludeIds.includes(m.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" closeLabel={tc("close")}>
        <DialogHeader>
          <DialogTitle>{t("pick")}</DialogTitle>
          <DialogDescription>{t("uploadHint")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} className="pl-9" aria-label={tc("search")} />
          </div>
          <UploadButton
            onUploaded={(up) => {
              setItems((cur) => [...up, ...(cur ?? [])]);
              setSelected((s) => (multiple ? [...s, ...up] : [up[0]]));
            }}
            multiple={multiple}
          />
        </div>
        <div className="min-h-[16rem]">
          {loading && !items ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {visible.map((m) => {
                const isSel = selected.some((s) => s.id === m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => toggle(m)}
                      onDoubleClick={() => {
                        if (!multiple) {
                          onPick([m]);
                          onOpenChange(false);
                        }
                      }}
                      aria-pressed={isSel}
                      className={cn(
                        "group relative block w-full overflow-hidden rounded-lg border-2 text-left",
                        isSel ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-muted-foreground/30",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.file_url} alt={m.alt_text_de || m.title} className="aspect-[4/3] w-full bg-muted object-cover" loading="lazy" />
                      <span className="block truncate px-1.5 py-1 text-xs">{m.title || m.file_name}</span>
                      {isSel ? (
                        <span className="absolute right-1.5 top-1.5 rounded-full bg-primary p-0.5 text-primary-foreground">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            type="button"
            disabled={selected.length === 0}
            onClick={() => {
              onPick(selected);
              onOpenChange(false);
            }}
            data-testid="media-pick-confirm"
          >
            {t("choose")}
            {multiple && selected.length ? ` (${selected.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type ImageValue = { id: string; url: string; alt?: string } | null;

/** Single image selection backed by a hidden input with the media id. */
export function ImageField({
  name,
  value: initial,
  onChange,
  aspect = "aspect-[16/9]",
}: {
  name: string;
  value: ImageValue;
  onChange?: (v: ImageValue) => void;
  aspect?: string;
}) {
  const t = useTranslations("admin.media");
  const [value, setValue] = useState<ImageValue>(initial);
  const [open, setOpen] = useState(false);
  const set = (v: ImageValue) => {
    setValue(v);
    onChange?.(v);
  };
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={value?.id ?? ""} />
      {value ? (
        <div className={cn("relative w-full max-w-sm overflow-hidden rounded-lg border bg-muted", aspect)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.url} alt={value.alt ?? ""} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className={cn("flex w-full max-w-sm items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground", aspect)}>
          {t("noImage")}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <ImagePlus /> {value ? t("change") : t("pick")}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => set(null)}>
            <X /> {t("removeImage")}
          </Button>
        ) : null}
      </div>
      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        onPick={(items) => items[0] && set({ id: items[0].id, url: items[0].file_url, alt: items[0].alt_text_de })}
      />
    </div>
  );
}
