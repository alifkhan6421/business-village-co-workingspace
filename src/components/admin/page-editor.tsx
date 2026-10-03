"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/submit-button";
import { useErrorText } from "@/components/forms/use-error-text";
import { useAdminForm } from "./people-forms";
import { LocaleTabs } from "./locale-tabs";
import { ImageField, type ImageValue } from "./media-picker";
import { SectionEditor, type SectionData } from "./section-editor";
import { addSection, createPage, reorderSections, savePageMeta } from "@/lib/admin/cms";
import { SECTION_TYPES } from "@/lib/cms-sections";

type PageTr = { title: string; seo_title: string; seo_description: string; og_title: string; og_description: string };
export type PageMeta = {
  id: string;
  slug: string;
  page_type: string;
  status: string;
  is_system: boolean;
  noindex: boolean;
  canonical_url: string | null;
  seoImage: ImageValue;
  de: PageTr;
  en: PageTr;
};

export function PageMetaForm({ page }: { page: PageMeta }) {
  const t = useTranslations("admin.pages");
  const tc = useTranslations("admin.common");
  const ts = useTranslations("status");
  const { onSubmit, pending, fe, alert } = useAdminForm(savePageMeta, t("metaSaved"));
  const pane = (l: "de" | "en") => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("pageTitle")} htmlFor={`pm-title-${l}`} error={fe(`title_${l}`)} className="sm:col-span-2">
        <Input id={`pm-title-${l}`} name={`title_${l}`} defaultValue={page[l].title} maxLength={200} />
      </Field>
      <Field label={t("seoTitle")} htmlFor={`pm-seo-${l}`} error={fe(`seo_title_${l}`)} hint="≤ 60–70">
        <Input id={`pm-seo-${l}`} name={`seo_title_${l}`} defaultValue={page[l].seo_title} maxLength={70} />
      </Field>
      <Field label={t("ogTitle")} htmlFor={`pm-og-${l}`} error={fe(`og_title_${l}`)}>
        <Input id={`pm-og-${l}`} name={`og_title_${l}`} defaultValue={page[l].og_title} maxLength={95} />
      </Field>
      <Field label={t("seoDescription")} htmlFor={`pm-desc-${l}`} error={fe(`seo_description_${l}`)} hint="≤ 160">
        <Textarea id={`pm-desc-${l}`} name={`seo_description_${l}`} defaultValue={page[l].seo_description} rows={2} maxLength={170} />
      </Field>
      <Field label={t("ogDescription")} htmlFor={`pm-ogd-${l}`} error={fe(`og_description_${l}`)}>
        <Textarea id={`pm-ogd-${l}`} name={`og_description_${l}`} defaultValue={page[l].og_description} rows={2} maxLength={200} />
      </Field>
    </div>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate data-testid="page-meta-form">
      <input type="hidden" name="id" value={page.id} />
      {alert}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={tc("status")} htmlFor="pm-status">
          <NativeSelect id="pm-status" name="status" defaultValue={page.status}>
            <option value="published">{ts("page.published")}</option>
            <option value="draft">{ts("page.draft")}</option>
          </NativeSelect>
        </Field>
        <Field label={tc("slug")} htmlFor="pm-slug" error={fe("slug")} hint={page.is_system ? t("systemHint") : (t.raw("slugSystemHint") as string)}>
          <Input id="pm-slug" name="slug" defaultValue={page.slug} disabled={page.is_system} maxLength={80} />
        </Field>
        <Field label={t("pageType")} htmlFor="pm-type">
          <NativeSelect id="pm-type" name="page_type" defaultValue={page.page_type} disabled={page.is_system}>
            {["standard", "landing", "legal"].map((x) => <option key={x} value={x}>{ts(`pageType.${x}`)}</option>)}
          </NativeSelect>
        </Field>
        <Field label={t("canonical")} htmlFor="pm-canon" error={fe("canonical_url")}>
          <Input id="pm-canon" name="canonical_url" defaultValue={page.canonical_url ?? ""} placeholder="https://" maxLength={500} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="noindex" defaultChecked={page.noindex} className="h-4 w-4 accent-primary" /> {t("noindex")}
      </label>
      <LocaleTabs de={pane("de")} en={pane("en")} missing={{ en: !page.en.title }} />
      <Field label={t("seoImage")}>
        <ImageField name="seo_image_id" value={page.seoImage} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton>
      </div>
    </form>
  );
}

export function SectionsManager({ pageId, sections, amenities }: { pageId: string; sections: SectionData[]; amenities: { id: string; name: string }[] }) {
  const t = useTranslations("admin.pages");
  const errorText = useErrorText();
  const router = useRouter();
  const [order, setOrder] = useState(sections.map((s) => s.id));
  const [type, setType] = useState("text");
  const [pending, start] = useTransition();
  const byId = new Map(sections.map((s) => [s.id, s]));
  const list = [...order.map((id) => byId.get(id)).filter((x): x is SectionData => !!x), ...sections.filter((s) => !order.includes(s.id))];

  const move = (i: number, d: -1 | 1) => {
    const ids = list.map((s) => s.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
    start(async () => {
      const r = await reorderSections(pageId, ids);
      if (!r.ok) toast.error(errorText(r.error));
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {list.map((s, i) => (
          <SectionEditor key={s.id} section={s} amenities={amenities} index={i} count={list.length} onMove={(d) => move(i, d)} />
        ))}
      </ul>
      <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center">
        <NativeSelect value={type} onChange={(e) => setType(e.target.value)} aria-label={t("addSection")} className="sm:w-72">
          {SECTION_TYPES.map((x) => <option key={x} value={x}>{t(`sectionTypes.${x}`)}</option>)}
        </NativeSelect>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await addSection(pageId, type);
              if (r.ok) {
                toast.success(t("sectionAdded"));
                setOrder((o) => [...o, r.data!.id]);
                router.refresh();
              } else toast.error(errorText(r.error));
            })
          }
        >
          <Plus /> {t("addSection")}
        </Button>
      </div>
    </div>
  );
}

export function NewPageForm() {
  const t = useTranslations("admin.pages");
  const tc = useTranslations("admin.common");
  const tcm = useTranslations("common");
  const ts = useTranslations("status.pageType");
  const router = useRouter();
  const locale = useLocale();
  const { onSubmit, pending, fe, alert } = useAdminForm(createPage, tc("created"), (r) => {
    if (r.ok && r.data) router.push(`/${locale}/admin/website/pages/${r.data.id}`);
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2" noValidate>
      {alert ? <div className="sm:col-span-2">{alert}</div> : null}
      <Field label={`${t("pageTitle")} (DE)`} htmlFor="np-de" error={fe("title_de")}>
        <Input id="np-de" name="title_de" maxLength={200} />
      </Field>
      <Field label={`${t("pageTitle")} (EN)`} htmlFor="np-en" error={fe("title_en")}>
        <Input id="np-en" name="title_en" maxLength={200} />
      </Field>
      <Field label={tc("slug")} htmlFor="np-slug" error={fe("slug")} hint={(t.raw("slugSystemHint") as string)}>
        <Input id="np-slug" name="slug" maxLength={80} />
      </Field>
      <Field label={t("pageType")} htmlFor="np-type">
        <NativeSelect id="np-type" name="page_type" defaultValue="standard">
          {["standard", "landing", "legal"].map((x) => <option key={x} value={x}>{ts(x)}</option>)}
        </NativeSelect>
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton pending={pending}>{tcm("create")}</SubmitButton>
      </div>
    </form>
  );
}
