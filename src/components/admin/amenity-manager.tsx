"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SubmitButton } from "@/components/forms/submit-button";
import { useErrorText } from "@/components/forms/use-error-text";
import { DeleteButton } from "./delete-button";
import { useAdminForm } from "./people-forms";
import { LocaleTabs } from "./locale-tabs";
import { deleteAmenity, reorderAmenities, saveAmenity, setAmenityActive } from "@/lib/admin/amenities";
import { Icon, ICON_NAMES } from "@/lib/icons";

export type AmenityRow = {
  id: string;
  slug: string;
  icon: string;
  amenity_type: string;
  display_order: number;
  active: boolean;
  name_de: string;
  name_en: string;
  description_de: string;
  description_en: string;
  usage: number;
};

function AmenityForm({ a, onDone }: { a: AmenityRow | null; onDone: () => void }) {
  const t = useTranslations("admin.amenities");
  const tc = useTranslations("admin.common");
  const tt = useTranslations("status.amenityType");
  const router = useRouter();
  const [icon, setIcon] = useState(a?.icon ?? "check");
  const { onSubmit, pending, fe, alert } = useAdminForm(saveAmenity, a ? tc("updated") : tc("created"), () => {
    onDone();
    router.refresh();
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate data-testid="amenity-form">
      <input type="hidden" name="id" value={a?.id ?? ""} />
      {alert}
      <LocaleTabs
        missing={{ en: !!a && !a.name_en }}
        de={
          <div className="space-y-3">
            <Field label={t("nameDe")} htmlFor="am-name-de" error={fe("name_de")}>
              <Input
                id="am-name-de"
                name="name_de"
                defaultValue={a?.name_de}
                maxLength={100}
                onBlur={(e) => {
                  const slug = e.currentTarget.form?.elements.namedItem("slug") as HTMLInputElement | null;
                  if (slug && !slug.value)
                    slug.value = e.currentTarget.value.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                }}
              />
            </Field>
            <Field label={t("descriptionDe")} htmlFor="am-desc-de" error={fe("description_de")}>
              <Textarea id="am-desc-de" name="description_de" defaultValue={a?.description_de} rows={2} maxLength={500} />
            </Field>
          </div>
        }
        en={
          <div className="space-y-3">
            <Field label={t("nameEn")} htmlFor="am-name-en" error={fe("name_en")}>
              <Input id="am-name-en" name="name_en" defaultValue={a?.name_en} maxLength={100} />
            </Field>
            <Field label={t("descriptionEn")} htmlFor="am-desc-en" error={fe("description_en")}>
              <Textarea id="am-desc-en" name="description_en" defaultValue={a?.description_en} rows={2} maxLength={500} />
            </Field>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tc("slug")} htmlFor="am-slug" error={fe("slug")}>
          <Input id="am-slug" name="slug" defaultValue={a?.slug} maxLength={80} />
        </Field>
        <Field label={t("type")} htmlFor="am-type">
          <NativeSelect id="am-type" name="amenity_type" defaultValue={a?.amenity_type ?? "general"}>
            {["workspace", "room", "general"].map((x) => <option key={x} value={x}>{tt(x)}</option>)}
          </NativeSelect>
        </Field>
        <Field label={tc("order")} htmlFor="am-order" error={fe("display_order")}>
          <Input id="am-order" type="number" name="display_order" min={0} max={9999} defaultValue={a?.display_order ?? 500} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={a?.active ?? true} className="h-4 w-4 accent-primary" />
          {tc("visible")}
        </label>
      </div>
      <Field label={t("icon")} error={fe("icon")}>
        <input type="hidden" name="icon" value={icon} />
        <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-12" role="radiogroup" aria-label={t("icon")}>
          {ICON_NAMES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={icon === n}
              title={n}
              onClick={() => setIcon(n)}
              className={`flex h-8 w-8 items-center justify-center rounded ${icon === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              <Icon name={n} className="h-4 w-4" />
            </button>
          ))}
        </div>
      </Field>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton>
      </div>
    </form>
  );
}

export function AmenityManager({ rows, locale }: { rows: AmenityRow[]; locale: "de" | "en" }) {
  const t = useTranslations("admin.amenities");
  const tc = useTranslations("admin.common");
  const tcm = useTranslations("common");
  const tt = useTranslations("status.amenityType");
  const errorText = useErrorText();
  const router = useRouter();
  const [editing, setEditing] = useState<AmenityRow | null | "new">(null);
  const [order, setOrder] = useState(rows.map((r) => r.id));
  const [, start] = useTransition();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sorted = order.map((id) => byId.get(id)).filter((x): x is AmenityRow => !!x);
  for (const r of rows) if (!order.includes(r.id)) sorted.push(r);

  const move = (i: number, d: -1 | 1) => {
    const ids = sorted.map((r) => r.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
    start(async () => {
      const r = await reorderAmenities(ids);
      if (!r.ok) toast.error(errorText(r.error));
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing("new")} data-testid="amenity-new">
          <Plus /> {t("new")}
        </Button>
      </div>
      <Table>
        <THead>
          <TR>
            <TH className="w-24">{tc("order")}</TH>
            <TH>{tc("name")}</TH>
            <TH className="hidden md:table-cell">{t("type")}</TH>
            <TH className="hidden md:table-cell">{t("usage")}</TH>
            <TH>{tc("visible")}</TH>
            <TH className="text-right">{tc("actions")}</TH>
          </TR>
        </THead>
        <TBody>
          {sorted.map((a, i) => (
            <TR key={a.id} data-testid={`amenity-row-${a.slug}`}>
              <TD>
                <div className="flex">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0} aria-label={tcm("moveUp")}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === sorted.length - 1} aria-label={tcm("moveDown")}><ArrowDown /></Button>
                </div>
              </TD>
              <TD>
                <div className="flex items-center gap-2">
                  <Icon name={a.icon} className="h-4 w-4 shrink-0 text-primary" />
                  <span className="font-medium">{locale === "en" && a.name_en ? a.name_en : a.name_de}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {locale === "en" ? a.name_de : a.name_en || <span className="text-amber-700">{tc("missingTranslation")}</span>}
                </div>
              </TD>
              <TD className="hidden md:table-cell">{tt(a.amenity_type)}</TD>
              <TD className="hidden md:table-cell"><Badge variant={a.usage ? "secondary" : "muted"}>{t("usageCount", { count: a.usage })}</Badge></TD>
              <TD>
                <Switch
                  checked={a.active}
                  aria-label={a.active ? t("deactivate") : t("activate")}
                  onCheckedChange={(v: boolean) =>
                    start(async () => {
                      const r = await setAmenityActive(a.id, v);
                      if (!r.ok) toast.error(errorText(r.error));
                      router.refresh();
                    })
                  }
                />
              </TD>
              <TD>
                <div className="flex justify-end gap-1">
                  <Button variant="outline" size="sm" onClick={() => setEditing(a)}><Pencil /> {tc("edit")}</Button>
                  <DeleteButton action={deleteAmenity.bind(null, a.id)} name={a.name_de} description={a.usage ? t("deleteInUse", { count: a.usage }) : t("deleteUnused")} />
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl" closeLabel={tcm("close")}>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? t("new") : t("edit")}</DialogTitle>
          </DialogHeader>
          {editing !== null ? <AmenityForm a={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
