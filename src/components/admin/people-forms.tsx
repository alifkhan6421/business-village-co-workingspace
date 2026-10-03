"use client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useServerForm } from "@/components/forms/use-server-form";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import type { ActionResult } from "@/lib/action-result";
import { adminUpdateProfile, saveAnnouncement, setUserRole, setUserSuspended, updateGuest, updateInquiry } from "@/lib/admin/people";
import { LocaleTabs } from "./locale-tabs";
import { RichTextEditor } from "./rich-text-editor";

/** Shared submit/validation plumbing for admin forms. */
export function useAdminForm<T>(action: (prev: unknown, fd: FormData) => Promise<ActionResult<T>>, success: string, after?: (res: ActionResult<T>) => void) {
  const router = useRouter();
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const form = useServerForm(async (prev: unknown, fd: FormData) => {
    const res = await action(prev, fd);
    if (res.ok) {
      toast.success(success);
      if (after) after(res);
      else router.refresh();
    }
    return res;
  });
  const fe = (k: string) => (form.state && !form.state.ok ? fieldError(form.state.fieldErrors?.[k]) : undefined);
  const alert = form.state && !form.state.ok ? <FormAlert>{errorText(form.state.error)}</FormAlert> : null;
  return { ...form, fe, alert };
}

export function ProfileAdminForm({ p }: { p: { id: string; first_name: string; last_name: string; phone: string | null; company: string | null; department: string | null; preferred_locale: string } }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const ta = useTranslations("admin");
  const { onSubmit, pending, fe, alert } = useAdminForm(adminUpdateProfile, ta("common.updated"));
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2" noValidate>
      <input type="hidden" name="id" value={p.id} />
      {alert ? <div className="sm:col-span-2">{alert}</div> : null}
      <Field label={t("firstName")} htmlFor="pf-first" error={fe("first_name")}>
        <Input id="pf-first" name="first_name" defaultValue={p.first_name} maxLength={100} />
      </Field>
      <Field label={t("lastName")} htmlFor="pf-last" error={fe("last_name")}>
        <Input id="pf-last" name="last_name" defaultValue={p.last_name} maxLength={100} />
      </Field>
      <Field label={tc("phone")} htmlFor="pf-phone" error={fe("phone")}>
        <Input id="pf-phone" name="phone" defaultValue={p.phone ?? ""} maxLength={40} />
      </Field>
      <Field label={tc("company")} htmlFor="pf-company" error={fe("company")}>
        <Input id="pf-company" name="company" defaultValue={p.company ?? ""} maxLength={200} />
      </Field>
      <Field label={ta("users.department")} htmlFor="pf-dept" error={fe("department")}>
        <Input id="pf-dept" name="department" defaultValue={p.department ?? ""} maxLength={200} />
      </Field>
      <Field label={ta("users.language")} htmlFor="pf-locale">
        <NativeSelect id="pf-locale" name="preferred_locale" defaultValue={p.preferred_locale}>
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </NativeSelect>
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton pending={pending}>{tc("save")}</SubmitButton>
      </div>
    </form>
  );
}

export function UserAccessActions({ userId, name, role, suspended, isSelf }: { userId: string; name: string; role: string; suspended: boolean; isSelf: boolean }) {
  const t = useTranslations("admin.users");
  const tr = useTranslations("status.role");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const router = useRouter();
  const next = role === "admin" ? "member" : "admin";
  const run = async (p: Promise<ActionResult>, msg: string) => {
    const r = await p;
    if (r.ok) {
      toast.success(msg);
      router.refresh();
    } else toast.error(errorText(r.error));
  };
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmDialog
        trigger={<Button variant="outline" data-testid="role-toggle">{next === "admin" ? t("makeAdmin") : t("makeMember")}</Button>}
        title={t("roleConfirm", { name, role: tr(next) })}
        description={isSelf ? t("selfDemoteWarning") : undefined}
        confirmLabel={tc("confirm")}
        cancelLabel={tc("cancel")}
        destructive={next === "member"}
        onConfirm={() => run(setUserRole(userId, next), t("roleChanged"))}
      />
      {!isSelf ? (
        <ConfirmDialog
          trigger={<Button variant="outline" className={suspended ? "" : "text-destructive hover:text-destructive"}>{suspended ? t("reactivate") : t("deactivate")}</Button>}
          title={suspended ? t("reactivate") : t("deactivate")}
          description={suspended ? undefined : t("suspendHint")}
          confirmLabel={tc("confirm")}
          cancelLabel={tc("cancel")}
          destructive={!suspended}
          onConfirm={() => run(setUserSuspended(userId, !suspended), suspended ? t("accountReactivated") : t("accountDeactivated"))}
        />
      ) : null}
    </div>
  );
}

export function GuestForm({ g }: { g: { id: string; first_name: string; last_name: string; email: string; phone: string | null; company: string | null; locale: string } }) {
  const tb = useTranslations("booking");
  const tc = useTranslations("common");
  const ta = useTranslations("admin");
  const { onSubmit, pending, fe, alert } = useAdminForm(updateGuest, ta("guests.saved"));
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2" noValidate>
      <input type="hidden" name="id" value={g.id} />
      {alert ? <div className="sm:col-span-2">{alert}</div> : null}
      <Field label={tb("firstName")} htmlFor="g-first" error={fe("first_name")}>
        <Input id="g-first" name="first_name" defaultValue={g.first_name} maxLength={100} />
      </Field>
      <Field label={tb("lastName")} htmlFor="g-last" error={fe("last_name")}>
        <Input id="g-last" name="last_name" defaultValue={g.last_name} maxLength={100} />
      </Field>
      <Field label={tc("email")} htmlFor="g-email" error={fe("email")}>
        <Input id="g-email" type="email" name="email" defaultValue={g.email} maxLength={254} />
      </Field>
      <Field label={tc("phone")} htmlFor="g-phone" error={fe("phone")}>
        <Input id="g-phone" name="phone" defaultValue={g.phone ?? ""} maxLength={40} />
      </Field>
      <Field label={tc("company")} htmlFor="g-company" error={fe("company")}>
        <Input id="g-company" name="company" defaultValue={g.company ?? ""} maxLength={200} />
      </Field>
      <Field label={ta("users.language")} htmlFor="g-locale">
        <NativeSelect id="g-locale" name="locale" defaultValue={g.locale}>
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </NativeSelect>
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton pending={pending}>{tc("save")}</SubmitButton>
      </div>
    </form>
  );
}

export function InquiryForm({ i }: { i: { id: string; status: string; admin_notes: string } }) {
  const t = useTranslations("admin.inquiries");
  const ts = useTranslations("status.inquiry");
  const tc = useTranslations("common");
  const { onSubmit, pending, fe, alert } = useAdminForm(updateInquiry, t("saved"));
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <input type="hidden" name="id" value={i.id} />
      {alert}
      <Field label={tc("status")} htmlFor="i-status">
        <NativeSelect id="i-status" name="status" defaultValue={i.status}>
          {["new", "in_progress", "resolved"].map((s) => <option key={s} value={s}>{ts(s)}</option>)}
        </NativeSelect>
      </Field>
      <Field label={t("notes")} htmlFor="i-notes" error={fe("admin_notes")}>
        <Textarea id="i-notes" name="admin_notes" rows={5} defaultValue={i.admin_notes} maxLength={10000} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{tc("save")}</SubmitButton>
      </div>
    </form>
  );
}

export type AnnouncementValues = {
  id: string;
  title_de: string;
  title_en: string;
  content_de: string;
  content_en: string;
  publish_at: string; // Berlin local "YYYY-MM-DDTHH:mm"
  expires_at: string;
  active: boolean;
};

export function AnnouncementForm({ a }: { a: AnnouncementValues | null }) {
  const t = useTranslations("admin.announcements");
  const tc = useTranslations("common");
  const ta = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();
  const { onSubmit, pending, fe, alert } = useAdminForm(saveAnnouncement, a ? ta("updated") : ta("created"), () => router.push(`/${locale}/admin/announcements`));
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="id" value={a?.id ?? ""} />
      {alert}
      <LocaleTabs
        missing={{ en: !!a && !a.title_en }}
        de={
          <div className="space-y-3">
            <Field label={t("titleField")} htmlFor="a-title-de" error={fe("title_de")}>
              <Input id="a-title-de" name="title_de" defaultValue={a?.title_de} maxLength={200} />
            </Field>
            <Field label={t("contentField")} error={fe("content_de")}>
              <RichTextEditor name="content_de" defaultValue={a?.content_de} minimal />
            </Field>
          </div>
        }
        en={
          <div className="space-y-3">
            <Field label={t("titleField")} htmlFor="a-title-en" error={fe("title_en")}>
              <Input id="a-title-en" name="title_en" defaultValue={a?.title_en} maxLength={200} />
            </Field>
            <Field label={t("contentField")} error={fe("content_en")}>
              <RichTextEditor name="content_en" defaultValue={a?.content_en} minimal />
            </Field>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("publishAt")} htmlFor="a-pub" error={fe("publish_at")}>
          <Input id="a-pub" type="datetime-local" name="publish_at" defaultValue={a?.publish_at} />
        </Field>
        <Field label={t("expiresAt")} htmlFor="a-exp" error={fe("expires_at")}>
          <Input id="a-exp" type="datetime-local" name="expires_at" defaultValue={a?.expires_at} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={a?.active ?? true} className="h-4 w-4 accent-primary" />
        {t("activeField")}
      </label>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{a ? ta("saveChanges") : tc("create")}</SubmitButton>
      </div>
    </form>
  );
}
