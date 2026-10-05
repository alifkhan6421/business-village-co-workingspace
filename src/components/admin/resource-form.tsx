"use client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useServerForm } from "@/components/forms/use-server-form";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { LocaleTabs } from "./locale-tabs";
import { RichTextEditor } from "./rich-text-editor";
import { saveResource, type ResourceKind } from "@/lib/admin/resources";
import { Icon } from "@/lib/icons";

export type ResourceFormValues = {
  id: string;
  name: string;
  slug: string;
  desk_number?: string | null;
  floor: string;
  zone?: string;
  capacity: number;
  display_order: number;
  status: string;
  featured: boolean;
  public_visible: boolean;
  short_description_de: string;
  short_description_en: string;
  full_description_de: string;
  full_description_en: string;
  price_hourly?: number | string | null;
  price_daily?: number | string | null;
};

function slugify(v: string) {
  return v
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ResourceForm({
  kind,
  initial,
  amenities,
  selectedAmenities,
}: {
  kind: ResourceKind;
  initial: ResourceFormValues | null;
  amenities: { id: string; name: string; icon: string; type: string }[];
  selectedAmenities: string[];
}) {
  const t = useTranslations("admin.resources");
  const tc = useTranslations("admin.common");
  const ts = useTranslations("status.resource");
  const ta = useTranslations("status.amenityType");
  const tCommon = useTranslations("common");
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const router = useRouter();
  const locale = useLocale();
  const { state, pending, onSubmit } = useServerForm(async (prev: unknown, fd: FormData) => {
    const res = await saveResource(kind, prev, fd);
    if (res.ok) {
      if (!initial && res.data) {
        toast.success(t("created"));
        router.push(`/${locale}/admin/${kind === "workspace" ? "workspaces" : "rooms"}/${res.data.id}`);
      } else {
        toast.success(tc("updated"));
        router.refresh();
      }
    }
    return res;
  });
  const fe = (k: string) => (state && !state.ok ? fieldError(state.fieldErrors?.[k]) : undefined);
  const v = initial;
  const relevant = amenities.filter((a) => a.type === kind || a.type === "general" || selectedAmenities.includes(a.id));

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <input type="hidden" name="id" value={v?.id ?? ""} />
      <input type="hidden" name="amenities_present" value="1" />
      {state && !state.ok ? <FormAlert>{state.error === "validation" ? errorText("validation") : errorText(state.error)}</FormAlert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("basics")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("name")} htmlFor="name" error={fe("name")}>
            <Input
              id="name"
              name="name"
              defaultValue={v?.name}
              required
              maxLength={80}
              onBlur={(e) => {
                const slug = e.currentTarget.form?.elements.namedItem("slug") as HTMLInputElement | null;
                if (slug && !slug.value) slug.value = slugify(e.currentTarget.value);
              }}
            />
          </Field>
          <Field label={tc("slug")} htmlFor="slug" error={fe("slug")} hint={tc("slugHint")}>
            <Input id="slug" name="slug" defaultValue={v?.slug} required maxLength={80} pattern="[a-z0-9-]+" />
          </Field>
          {kind === "workspace" ? (
            <Field label={t("deskNumber")} htmlFor="desk_number" error={fe("desk_number")}>
              <Input id="desk_number" name="desk_number" defaultValue={v?.desk_number ?? ""} maxLength={20} />
            </Field>
          ) : null}
          <Field label={t("floor")} htmlFor="floor" error={fe("floor")}>
            <Input id="floor" name="floor" defaultValue={v?.floor} maxLength={40} />
          </Field>
          {kind === "workspace" ? (
            <Field label={t("zone")} htmlFor="zone" error={fe("zone")}>
              <Input id="zone" name="zone" defaultValue={v?.zone ?? ""} maxLength={40} />
            </Field>
          ) : null}
          <Field label={t("capacity")} htmlFor="capacity" error={fe("capacity")}>
            <Input id="capacity" name="capacity" type="number" min={1} max={500} defaultValue={v?.capacity ?? (kind === "room" ? 6 : 1)} required />
          </Field>
          <Field label={tCommon("status")} htmlFor="status" error={fe("status")} hint={t("statusHint")}>
            <NativeSelect id="status" name="status" defaultValue={v?.status ?? "available"}>
              {["available", "maintenance", "disabled"].map((s) => (
                <option key={s} value={s}>
                  {ts(s)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("displayOrder")} htmlFor="display_order" error={fe("display_order")}>
            <Input id="display_order" name="display_order" type="number" min={0} max={9999} defaultValue={v?.display_order ?? 100} />
          </Field>
          <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:gap-8">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="public_visible" defaultChecked={v?.public_visible ?? true} className="h-4 w-4 accent-primary" />
              {t("publicVisible")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="featured" defaultChecked={v?.featured ?? false} className="h-4 w-4 accent-primary" />
              {t("featured")} <span className="text-muted-foreground">({t("featuredHint")})</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("pricing")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("priceHourly")} htmlFor="price_hourly" error={fe("price_hourly")} hint={t("priceHint")}>
            <div className="relative">
              <Input id="price_hourly" name="price_hourly" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={v?.price_hourly ?? ""} className="pr-9" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
            </div>
          </Field>
          <Field label={t("priceDaily")} htmlFor="price_daily" error={fe("price_daily")}>
            <div className="relative">
              <Input id="price_daily" name="price_daily" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={v?.price_daily ?? ""} className="pr-9" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("descriptions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LocaleTabs
            missing={{ en: !!v && !v.short_description_en && !v.full_description_en }}
            de={
              <div className="space-y-4">
                <Field label={t("shortDescription")} htmlFor="short_description_de" error={fe("short_description_de")}>
                  <Textarea id="short_description_de" name="short_description_de" defaultValue={v?.short_description_de} rows={2} maxLength={400} />
                </Field>
                <Field label={t("fullDescription")} error={fe("full_description_de")}>
                  <RichTextEditor name="full_description_de" defaultValue={v?.full_description_de} />
                </Field>
              </div>
            }
            en={
              <div className="space-y-4">
                <Field label={t("shortDescription")} htmlFor="short_description_en" error={fe("short_description_en")}>
                  <Textarea id="short_description_en" name="short_description_en" defaultValue={v?.short_description_en} rows={2} maxLength={400} />
                </Field>
                <Field label={t("fullDescription")} error={fe("full_description_en")}>
                  <RichTextEditor name="full_description_en" defaultValue={v?.full_description_en} />
                </Field>
              </div>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("amenities")}</CardTitle>
        </CardHeader>
        <CardContent>
          {relevant.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noAmenities")}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {relevant.map((a) => (
                <label key={a.id} className="flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-surface has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                  <input
                    type="checkbox"
                    name="amenity_ids"
                    value={a.id}
                    defaultChecked={selectedAmenities.includes(a.id)}
                    className="h-4 w-4 shrink-0 accent-primary"
                  />
                  <Icon name={a.icon} className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 break-words">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{ta(a.type)}</span>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm">
        <SubmitButton pending={pending}>{v ? tc("saveChanges") : tCommon("create")}</SubmitButton>
      </div>
    </form>
  );
}
