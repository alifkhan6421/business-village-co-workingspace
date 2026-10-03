"use client";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useServerForm } from "@/components/forms/use-server-form";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { createBlock, deleteBlock, type ResourceKind } from "@/lib/admin/resources";
import { TIME_ZONE } from "@/lib/tz";

export type BlockRow = { id: string; start_at: string; end_at: string; reason: string; note: string | null };
const REASONS = ["maintenance", "private_event", "repairs", "cleaning", "administrative_hold"];

export function BlocksManager({ kind, resourceId, blocks, today }: { kind: ResourceKind; resourceId: string; blocks: BlockRow[]; today: string }) {
  const t = useTranslations("admin.blocks");
  const tr = useTranslations("status.blockReason");
  const tc = useTranslations("common");
  const format = useFormatter();
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const router = useRouter();
  const { state, pending, onSubmit } = useServerForm(async (prev: unknown, fd: FormData) => {
    const res = await createBlock(prev, fd);
    if (res.ok) {
      if (res.data?.overlapping) toast.warning(t("overlapWarning", { count: res.data.overlapping }), { duration: 10000 });
      else toast.success(t("created"));
      router.refresh();
    }
    return res;
  });
  const fe = (k: string) => (state && !state.ok ? fieldError(state.fieldErrors?.[k]) : undefined);

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4" noValidate>
        <input type="hidden" name="resource_type" value={kind} />
        <input type="hidden" name="resource_id" value={resourceId} />
        {state && !state.ok && state.error !== "validation" ? <FormAlert className="sm:col-span-2 lg:col-span-4">{errorText(state.error)}</FormAlert> : null}
        <Field label={`${t("start")} – ${tc("date")}`} htmlFor="block-sd" error={fe("start_date")}>
          <Input id="block-sd" type="date" name="start_date" defaultValue={today} required />
        </Field>
        <Field label={`${t("start")} – ${tc("time")}`} htmlFor="block-st" error={fe("start_time")}>
          <Input id="block-st" type="time" name="start_time" defaultValue="07:00" step={900} required />
        </Field>
        <Field label={`${t("end")} – ${tc("date")}`} htmlFor="block-ed" error={fe("end_date")}>
          <Input id="block-ed" type="date" name="end_date" defaultValue={today} required />
        </Field>
        <Field label={`${t("end")} – ${tc("time")}`} htmlFor="block-et" error={fe("end_time")}>
          <Input id="block-et" type="time" name="end_time" defaultValue="21:00" step={900} required />
        </Field>
        <Field label={t("reason")} htmlFor="block-reason" error={fe("reason")}>
          <NativeSelect id="block-reason" name="reason" defaultValue="maintenance">
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {tr(r)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("note")} htmlFor="block-note" error={fe("note")} className="sm:col-span-1 lg:col-span-2">
          <Input id="block-note" name="note" maxLength={500} />
        </Field>
        <div className="flex items-end">
          <SubmitButton pending={pending} className="w-full">
            {t("add")}
          </SubmitButton>
        </div>
      </form>

      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("upcomingOnly")}</h3>
        {blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {blocks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Badge variant="warning">{tr(b.reason)}</Badge>
                <span className="font-medium">
                  {format.dateTimeRange(new Date(b.start_at), new Date(b.end_at), {
                    dateStyle: "medium",
                    timeStyle: "short",
                    hourCycle: "h23",
                    timeZone: TIME_ZONE,
                  })}
                </span>
                {b.note ? <span className="min-w-0 flex-1 break-words text-muted-foreground">{b.note}</span> : <span className="flex-1" />}
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm" className="text-destructive">
                      <Trash2 /> {t("remove")}
                    </Button>
                  }
                  title={t("remove")}
                  confirmLabel={t("remove")}
                  cancelLabel={tc("cancel")}
                  onConfirm={async () => {
                    const r = await deleteBlock(b.id);
                    if (r.ok) {
                      toast.success(t("deleted"));
                      router.refresh();
                    } else toast.error(errorText(r.error));
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
