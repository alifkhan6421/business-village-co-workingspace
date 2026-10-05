"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Copy, ExternalLink, EyeOff, MoreHorizontal, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useErrorText } from "@/components/forms/use-error-text";
import { deleteResource, duplicateResource, setResourceStatus, type ResourceKind } from "@/lib/admin/resources";

/** Overflow menu on a space card: view, duplicate, enable/disable, delete. */
export function ResourceCardActions({ kind, id, name, status, publicHref }: { kind: ResourceKind; id: string; name: string; status: string; publicHref: string }) {
  const t = useTranslations("admin.resources");
  const tc = useTranslations("admin.common");
  const tCommon = useTranslations("common");
  const errorText = useErrorText();
  const router = useRouter();
  const locale = useLocale();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      toast.error(errorText(res.error ?? "unknown"));
      return false;
    }
    toast.success(success);
    return true;
  };
  const disabled = status === "disabled";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label={t("moreActions", { name })} disabled={busy} data-testid="resource-actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild>
            <a href={publicHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> {t("publicPage")}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              const res = await duplicateResource(kind, id, t("copySuffix"));
              if (res.ok && res.data) {
                toast.success(t("duplicated"));
                router.push(`/${locale}/admin/${kind === "workspace" ? "workspaces" : "rooms"}/${res.data.id}`);
              } else toast.error(errorText(res.ok ? "unknown" : res.error));
            }}
          >
            <Copy /> {t("duplicate")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              if (await run(() => setResourceStatus(kind, id, disabled ? "available" : "disabled"), disabled ? t("enabled") : t("disabledToast"))) router.refresh();
            }}
          >
            {disabled ? <Power /> : <EyeOff />} {disabled ? t("enable") : t("disable")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 /> {tc("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={tc("deleteConfirm", { name })}
        description={t("deleteHint")}
        confirmLabel={tCommon("yesDelete")}
        cancelLabel={tCommon("cancel")}
        onConfirm={async () => {
          if (await run(() => deleteResource(kind, id), tc("deleted"))) router.refresh();
        }}
      />
    </>
  );
}
