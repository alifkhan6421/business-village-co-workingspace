"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useErrorText } from "@/components/forms/use-error-text";
import { renameDesk } from "@/lib/admin/resources";

/** Desk name, saved when the field loses focus. */
export function DeskLabelInput({ id, label, position }: { id: string; label: string; position: number }) {
  const t = useTranslations("admin.resources");
  const errorText = useErrorText();
  const router = useRouter();
  const [value, setValue] = useState(label);
  const [pending, start] = useTransition();
  return (
    <Input
      aria-label={t("deskName", { position })}
      value={value}
      maxLength={40}
      disabled={pending}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const next = value.trim();
        if (!next || next === label) {
          setValue(label);
          return;
        }
        start(async () => {
          const res = await renameDesk(id, next);
          if (res.ok) {
            toast.success(t("deskRenamed"));
            router.refresh();
          } else {
            toast.error(errorText(res.error));
            setValue(label);
          }
        });
      }}
      className="h-9"
    />
  );
}
