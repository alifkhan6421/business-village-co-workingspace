"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useErrorText } from "@/components/forms/use-error-text";
import type { ActionResult } from "@/lib/action-result";

/** Generic confirm-then-delete button for admin entities. */
export function DeleteButton({
  action,
  name,
  description,
  redirectTo,
  label,
  size = "sm",
  disabled,
}: {
  action: () => Promise<ActionResult>;
  name: string;
  description?: string;
  redirectTo?: string;
  label?: string;
  size?: "sm" | "default";
  disabled?: boolean;
}) {
  const t = useTranslations("admin.common");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size={size} className="text-destructive hover:text-destructive" disabled={disabled}>
          <Trash2 /> {label ?? t("delete")}
        </Button>
      }
      title={t("deleteConfirm", { name })}
      description={description ?? tc("cannotUndo")}
      confirmLabel={tc("yesDelete")}
      cancelLabel={tc("cancel")}
      onConfirm={async () => {
        const res = await action();
        if (!res.ok) {
          toast.error(errorText(res.error));
          return;
        }
        toast.success(t("deleted"));
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      }}
    />
  );
}
