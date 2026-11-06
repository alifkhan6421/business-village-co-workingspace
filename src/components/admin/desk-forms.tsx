"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRightLeft, Check } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useServerForm } from "@/components/forms/use-server-form";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { assignWorkspaceDesks, saveWorkspaceRequestDetails } from "@/lib/admin/requests";
import { WORKSPACE_MAX_UNITS, type WorkspaceUnit } from "@/lib/pricing/calc";
import { cn } from "@/lib/utils";
import { useAction } from "./request-forms";

export type DeskOption = {
  id: string;
  label: string;
  /** Another reservation holds this desk in the period ("BV-2026-000012 · 16.11.–20.11."). */
  busy: string | null;
};
export type WorkspaceDeskOption = {
  id: string;
  name: string;
  capacity: number;
  status: string;
  blocked: boolean;
  desks: DeskOption[];
};

/** Start date, per day / per month, number of days or months, people (workspace requests). */
export function WorkspaceDetailsForm({
  r,
}: {
  r: { id: string; unit: WorkspaceUnit; date: string; count: number; participants: number; priceAdjusted: boolean; confirmed: boolean };
}) {
  const t = useTranslations("admin.requests");
  const tw = useTranslations("pricing.workspace");
  const tc = useTranslations("common");
  const [unit, setUnit] = useState<WorkspaceUnit>(r.unit);
  const { onSubmit, pending, fe, alert } = useAction(saveWorkspaceRequestDetails, t("saved"));
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2" noValidate data-testid="workspace-details-form">
      <input type="hidden" name="id" value={r.id} />
      {alert ? <div className="sm:col-span-2">{alert}</div> : null}
      <Field label={tw("unitLegend")} htmlFor="ws-unit" error={fe("unit")}>
        <NativeSelect id="ws-unit" name="unit" value={unit} onChange={(e) => setUnit(e.target.value as WorkspaceUnit)}>
          <option value="day">{tw("unit.day")}</option>
          <option value="month">{tw("unit.month")}</option>
        </NativeSelect>
      </Field>
      <Field label={t("startDate")} htmlFor="ws-date" error={fe("date")}>
        <Input id="ws-date" type="date" name="date" defaultValue={r.date} />
      </Field>
      <Field label={tw("howLong")} htmlFor="ws-count" error={fe("count")}>
        <NativeSelect id="ws-count" name="count" defaultValue={String(Math.min(r.count, WORKSPACE_MAX_UNITS[unit]))} key={unit}>
          {Array.from({ length: WORKSPACE_MAX_UNITS[unit] }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{tw(`count.${unit}`, { count: n })}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t("people")} htmlFor="ws-people" error={fe("participants")} hint={r.confirmed ? t("peopleLockedHint") : t("peopleDesksHint")}>
        <Input id="ws-people" type="number" name="participants" min={1} max={500} defaultValue={r.participants} readOnly={r.confirmed} />
      </Field>
      <Field label={t("changeNote")} htmlFor="ws-note" className="sm:col-span-2">
        <Input id="ws-note" name="note" maxLength={2000} />
      </Field>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="recalculate" defaultChecked={!r.priceAdjusted} className="mt-0.5 h-4 w-4 accent-primary" />
          <span>
            {t("recalculateOnSave")}
            {r.priceAdjusted ? <span className="block text-xs text-muted-foreground">{t("recalculateAdjustedHint")}</span> : null}
          </span>
        </label>
        <SubmitButton pending={pending}>{tc("save")}</SubmitButton>
      </div>
    </form>
  );
}

/**
 * Workspace and desk assignment: shows every workspace with its free desks for
 * the request's period and lets the admin pick one desk per person. On a
 * confirmed booking the same form moves the person (with an email).
 */
export function DeskAssignment({
  r,
  workspaces,
}: {
  r: { id: string; participants: number; workspaceId: string | null; deskIds: string[]; confirmed: boolean; preferredId: string | null };
  workspaces: WorkspaceDeskOption[];
}) {
  const t = useTranslations("admin.requests");
  const router = useRouter();
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const free = (w: WorkspaceDeskOption) => (w.status !== "available" || w.blocked ? [] : w.desks.filter((d) => !d.busy));
  const firstFree = (w: WorkspaceDeskOption | undefined) => (w ? free(w).slice(0, r.participants).map((d) => d.id) : []);
  const initialWs = r.workspaceId ?? workspaces.find((w) => w.id === r.preferredId && free(w).length >= r.participants)?.id ?? workspaces.find((w) => free(w).length >= r.participants)?.id ?? "";
  const [wsId, setWsId] = useState(initialWs);
  const [selected, setSelected] = useState<string[]>(r.workspaceId === initialWs && r.deskIds.length ? r.deskIds : firstFree(workspaces.find((w) => w.id === initialWs)));
  const ws = useMemo(() => workspaces.find((w) => w.id === wsId), [workspaces, wsId]);
  const unchanged = wsId === r.workspaceId && selected.length === r.deskIds.length && selected.every((x) => r.deskIds.includes(x));

  const { state, pending, onSubmit } = useServerForm(async (prev: unknown, fd: FormData) => {
    const res = await assignWorkspaceDesks(prev, fd);
    if (res.ok) {
      toast.success(res.data?.moved ? (res.data.emailed ? t("movedEmailed") : t("moved")) : t("desksAssigned"));
      router.refresh();
    }
    return res;
  });
  const err = state && !state.ok ? state : null;

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= r.participants ? [...cur.slice(1), id] : [...cur, id]));

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate data-testid="desk-assignment">
      <input type="hidden" name="id" value={r.id} />
      <input type="hidden" name="workspace_id" value={wsId} />
      {selected.map((d) => (
        <input key={d} type="hidden" name="desk_ids" value={d} />
      ))}
      {err ? <FormAlert>{errorText(err.error)}</FormAlert> : null}
      <Field label={t("workspace")} htmlFor="ds-ws" error={err ? fieldError(err.fieldErrors?.workspace_id) : undefined}>
        <NativeSelect
          id="ds-ws"
          value={wsId}
          onChange={(e) => {
            setWsId(e.target.value);
            setSelected(e.target.value === r.workspaceId && r.deskIds.length ? r.deskIds : firstFree(workspaces.find((w) => w.id === e.target.value)));
          }}
        >
          <option value="">{t("chooseWorkspace")}</option>
          {workspaces.map((w) => {
            const n = free(w).length;
            const state = w.status !== "available" ? t("spaceState.unavailable") : w.blocked ? t("spaceState.blocked") : t("desksFree", { free: n, total: w.desks.length });
            return (
              <option key={w.id} value={w.id} disabled={w.status !== "available" || w.blocked || n < r.participants}>
                {w.name} · {state}
              </option>
            );
          })}
        </NativeSelect>
      </Field>
      {ws ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("chooseDesks", { count: r.participants })}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="desk-grid">
            {ws.desks.map((d) => {
              const mine = ws.id === r.workspaceId && r.deskIds.includes(d.id);
              const taken = !!d.busy;
              const on = selected.includes(d.id);
              return (
                <label
                  key={d.id}
                  className={cn(
                    "flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors",
                    on && "border-primary bg-primary/5 ring-1 ring-primary",
                    taken && "cursor-not-allowed bg-muted text-muted-foreground",
                  )}
                  data-testid={`desk-${d.label}`}
                >
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={on} disabled={taken} onChange={() => toggle(d.id)} />
                  <span className="min-w-0">
                    <span className="block font-semibold">{t("deskLabel", { label: d.label })}</span>
                    <span className="block truncate text-xs">{taken ? d.busy : mine ? t("deskCurrent") : t("deskFree")}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className={cn("mt-2 text-xs", selected.length === r.participants ? "text-muted-foreground" : "text-destructive")}>
            {t("desksSelected", { selected: selected.length, count: r.participants })}
          </p>
        </fieldset>
      ) : null}
      {r.confirmed ? (
        <>
          <Field label={t("changeNote")} htmlFor="ds-note">
            <Input id="ds-note" name="note" maxLength={2000} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-primary" />
            {t("notifyMove")}
          </label>
        </>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton pending={pending} disabled={!ws || selected.length !== r.participants || unchanged} data-testid="assign-desks">
          {r.confirmed ? <ArrowRightLeft /> : <Check />} {r.confirmed ? t("moveBooking") : t("assignDesks")}
        </SubmitButton>
      </div>
    </form>
  );
}
