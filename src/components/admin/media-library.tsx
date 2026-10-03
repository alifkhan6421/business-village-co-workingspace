"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useErrorText } from "@/components/forms/use-error-text";
import { UploadButton } from "./media-picker";
import { useAdminForm } from "./people-forms";
import { deleteMedia, getMediaUsage, updateMedia, type MediaItem, type MediaUsage } from "@/lib/admin/media";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function UsageList({ usage }: { usage: MediaUsage[] }) {
  const t = useTranslations("admin.media.usageTypes");
  return (
    <ul className="list-inside list-disc text-sm">
      {usage.map((u, i) => (
        <li key={i}>
          {t(u.usage_type)}: <strong>{u.label}</strong>
        </li>
      ))}
    </ul>
  );
}

function EditDialog({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const t = useTranslations("admin.media");
  const tg = useTranslations("admin.gallery");
  const tc = useTranslations("common");
  const ta = useTranslations("admin.common");
  const errorText = useErrorText();
  const router = useRouter();
  const f = useFormatter();
  const [usage, setUsage] = useState<MediaUsage[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const { onSubmit, pending, fe, alert } = useAdminForm(updateMedia, ta("updated"), () => {
    onClose();
    router.refresh();
  });
  useEffect(() => {
    getMediaUsage(item.id).then((r) => setUsage(r.ok ? (r.data ?? []) : []));
  }, [item.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" closeLabel={tc("close")}>
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription className="break-all">{item.file_name}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div className="space-y-2 text-xs text-muted-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.file_url} alt={item.alt_text_de} className="w-full rounded-md border bg-muted object-contain" />
            <div>{t("dimensions")}: {item.width}×{item.height}</div>
            <div>{t("size")}: {formatBytes(item.file_size)}</div>
            <div>{t("uploaded")}: {f.dateTime(new Date(item.created_at), "short")}</div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(item.file_url).then(() => toast.success(tc("copied")))}
            >
              <Copy /> {t("copyUrl")}
            </Button>
          </div>
          <form onSubmit={onSubmit} className="space-y-3" noValidate>
            <input type="hidden" name="id" value={item.id} />
            {alert}
            <Field label={tg("title")} htmlFor="m-title" error={fe("title")}>
              <Input id="m-title" name="title" defaultValue={item.title} maxLength={200} />
            </Field>
            <Field label={tg("altDe")} htmlFor="m-alt-de" error={fe("alt_text_de")}>
              <Input id="m-alt-de" name="alt_text_de" defaultValue={item.alt_text_de} maxLength={300} />
            </Field>
            <Field label={tg("altEn")} htmlFor="m-alt-en" error={fe("alt_text_en")}>
              <Input id="m-alt-en" name="alt_text_en" defaultValue={item.alt_text_en} maxLength={300} />
            </Field>
            <div>
              <div className="mb-1 text-sm font-medium">{t("usage")}</div>
              {usage === null ? <p className="text-sm text-muted-foreground">{tc("loading")}</p> : usage.length ? <UsageList usage={usage} /> : <p className="text-sm text-muted-foreground">{t("unused")}</p>}
            </div>
            {confirmDelete ? (
              usage && usage.length ? (
                <FormAlert>
                  {t("inUse")}
                  <UsageList usage={usage} />
                </FormAlert>
              ) : (
                <FormAlert>{tc("areYouSure")} {tc("cannotUndo")}</FormAlert>
              )
            ) : null}
            <DialogFooter className="pt-2">
              {confirmDelete && usage && !usage.length ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleting}
                  data-testid="media-delete-confirm"
                  onClick={() =>
                    startDelete(async () => {
                      const r = await deleteMedia(item.id);
                      if (!r.ok) toast.error(errorText(r.error));
                      else {
                        toast.success(ta("deleted"));
                        onClose();
                        router.refresh();
                      }
                    })
                  }
                >
                  {tc("yesDelete")}
                </Button>
              ) : (
                <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={usage === null} data-testid="media-delete">
                  <Trash2 /> {tc("delete")}
                </Button>
              )}
              <SubmitButton pending={pending}>{tc("save")}</SubmitButton>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MediaLibrary({ items, counts }: { items: MediaItem[]; counts: Record<string, number> }) {
  const t = useTranslations("admin.media");
  const router = useRouter();
  const [editing, setEditing] = useState<MediaItem | null>(null);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <UploadButton variant="default" label={t("upload")} onUploaded={() => router.refresh()} />
        <span className="text-xs text-muted-foreground">{t("uploadHint")}</span>
      </div>
      {items.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6" data-testid="media-grid">
          {items.map((m) => (
            <li key={m.id} className="group overflow-hidden rounded-lg border bg-card">
              <button type="button" onClick={() => setEditing(m)} className="block w-full text-left" aria-label={`${t("editTitle")}: ${m.title || m.file_name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.file_url} alt={m.alt_text_de} className="aspect-[4/3] w-full bg-muted object-cover" loading="lazy" />
                <div className="space-y-1 p-2">
                  <div className="truncate text-sm font-medium">{m.title || m.file_name}</div>
                  <div className="flex items-center justify-between gap-1">
                    {counts[m.id] ? <Badge variant="secondary">{t("usedTimes", { count: counts[m.id] })}</Badge> : <Badge variant="muted">{t("unused")}</Badge>}
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </div>
                  {!m.alt_text_de || !m.alt_text_en ? <div className="text-[11px] text-amber-700">{t("altMissing")}</div> : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing ? <EditDialog item={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
