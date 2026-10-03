"use client";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SubmitButton } from "@/components/forms/submit-button";
import { useErrorText } from "@/components/forms/use-error-text";
import { useAdminForm } from "./people-forms";
import { LocaleTabs } from "./locale-tabs";
import { RichTextEditor } from "./rich-text-editor";
import { ImageField, MediaPickerDialog, type ImageValue } from "./media-picker";
import { deleteSection, saveSection, setSectionActive } from "@/lib/admin/cms";
import { FIELD_LABELS, SECTION_CONFIG, type LocalField, type SharedField } from "@/lib/cms-sections";
import { Icon, ICON_NAMES } from "@/lib/icons";
import { cn } from "@/lib/utils";

type Tr = { title: string; subtitle: string; content: string; data: Record<string, unknown> };
export type SectionData = {
  id: string;
  type: string;
  active: boolean;
  settings: Record<string, unknown>;
  media: ImageValue;
  gallery: { id: string; url: string; alt: string }[];
  de: Tr;
  en: Tr;
};

type Item = { icon?: string; title?: string; text?: string; question?: string; answer?: string };

function ItemsEditor({ name, kind, initial }: { name: string; kind: "cards" | "faq"; initial: Item[] }) {
  const t = useTranslations("admin.pages.fields");
  const tc = useTranslations("common");
  const [items, setItems] = useState<Item[]>(initial);
  const set = (i: number, patch: Item) => setItems((x) => x.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: -1 | 1) =>
    setItems((x) => {
      const j = i + d;
      if (j < 0 || j >= x.length) return x;
      const n = [...x];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      {items.map((it, i) => (
        <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[auto_1fr_auto]">
          {kind === "cards" ? (
            <NativeSelect value={it.icon ?? "check"} onChange={(e) => set(i, { icon: e.target.value })} aria-label={t("icon")} className="sm:w-40">
              {ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
            </NativeSelect>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="min-w-0 space-y-2">
            {kind === "cards" ? (
              <>
                <div className="flex items-center gap-2">
                  <Icon name={it.icon} className="h-4 w-4 shrink-0 text-primary" />
                  <Input value={it.title ?? ""} onChange={(e) => set(i, { title: e.target.value })} placeholder={t("itemTitle")} aria-label={t("itemTitle")} maxLength={200} />
                </div>
                <Textarea value={it.text ?? ""} onChange={(e) => set(i, { text: e.target.value })} placeholder={t("itemText")} aria-label={t("itemText")} rows={2} maxLength={1000} />
              </>
            ) : (
              <>
                <Input value={it.question ?? ""} onChange={(e) => set(i, { question: e.target.value })} placeholder={t("question")} aria-label={t("question")} maxLength={300} />
                <Textarea value={it.answer ?? ""} onChange={(e) => set(i, { answer: e.target.value })} placeholder={t("answer")} aria-label={t("answer")} rows={3} maxLength={3000} />
              </>
            )}
          </div>
          <div className="flex gap-1 sm:flex-col">
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0} aria-label={tc("moveUp")}><ArrowUp /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={tc("moveDown")}><ArrowDown /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setItems((x) => x.filter((_, j) => j !== i))} aria-label={tc("delete")}><Trash2 /></Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setItems((x) => [...x, kind === "cards" ? { icon: "check", title: "", text: "" } : { question: "", answer: "" }])} disabled={items.length >= 24}>
        <Plus /> {t("addItem")}
      </Button>
    </div>
  );
}

function GalleryField({ name, initial }: { name: string; initial: { id: string; url: string; alt: string }[] }) {
  const t = useTranslations("admin.gallery");
  const tc = useTranslations("common");
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      {items.map((m) => <input key={m.id} type="hidden" name={name} value={m.id} />)}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {items.map((m, i) => (
          <li key={m.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.url} alt={m.alt} className="aspect-square w-full rounded-md object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 p-0.5">
              <button type="button" className="p-0.5 text-white disabled:opacity-30" disabled={i === 0} aria-label={tc("moveUp")} onClick={() => setItems((x) => { const n = [...x]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>
                <ArrowUp className="h-3.5 w-3.5 -rotate-90" />
              </button>
              <button type="button" className="p-0.5 text-white" aria-label={t("remove")} onClick={() => setItems((x) => x.filter((y) => y.id !== m.id))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ImagePlus /> {t("fromLibrary")}
      </Button>
      <MediaPickerDialog open={open} onOpenChange={setOpen} multiple excludeIds={items.map((m) => m.id)} onPick={(picked) => setItems((x) => [...x, ...picked.map((p) => ({ id: p.id, url: p.file_url, alt: p.alt_text_de }))])} />
    </div>
  );
}

function SharedInput({ f, s, amenities, gallery, error }: { f: SharedField; s: Record<string, unknown>; amenities: { id: string; name: string }[]; gallery: SectionData["gallery"]; error?: string }) {
  const t = useTranslations("admin.pages.fields");
  const label = t(FIELD_LABELS[f.key] ?? f.key);
  const name = `s_${f.key}`;
  const val = s[f.key];
  const id = `${name}-${useId()}`;
  if (f.kind === "bool")
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name={name} defaultChecked={val === true} className="h-4 w-4 accent-primary" /> {label}
      </label>
    );
  if (f.kind === "select")
    return (
      <Field label={label} htmlFor={id} error={error}>
        <NativeSelect id={id} name={name} defaultValue={typeof val === "string" ? val : f.options[0]}>
          {f.options.map((o) => <option key={o} value={o}>{t.has(o) ? t(o) : t.has(`variants.${o}`) ? t(`variants.${o}`) : o}</option>)}
        </NativeSelect>
      </Field>
    );
  if (f.kind === "mediaList") return <Field label={label} error={error}><GalleryField name={name} initial={gallery} /></Field>;
  if (f.kind === "amenityList") {
    const sel = Array.isArray(val) ? (val as string[]) : [];
    return (
      <Field label={label} error={error}>
        <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
          {amenities.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={name} value={a.id} defaultChecked={sel.includes(a.id)} className="h-4 w-4 accent-primary" /> {a.name}
            </label>
          ))}
        </div>
      </Field>
    );
  }
  return (
    <Field label={label} htmlFor={id} error={error} hint={f.kind === "mapUrl" ? t("embedUrlHint") : undefined}>
      <Input
        id={id}
        name={name}
        type={f.kind === "number" ? "number" : "text"}
        defaultValue={val == null ? "" : String(val)}
        min={f.kind === "number" ? f.min : undefined}
        max={f.kind === "number" ? f.max : undefined}
        maxLength={f.kind === "text" ? f.max : 500}
        placeholder={f.kind === "href" ? "/kontakt · https://…" : undefined}
      />
    </Field>
  );
}

function LocalInputs({ fields, l, tr, fe }: { fields: LocalField[]; l: "de" | "en"; tr: Tr; fe: (k: string) => string | undefined }) {
  const t = useTranslations("admin.pages.fields");
  return (
    <div className="space-y-3">
      {fields.map((f) => {
        const name = `${l}_${f.key}`;
        const label = t(FIELD_LABELS[f.key] ?? f.key);
        if (f.kind === "rich") return <Field key={name} label={label} error={fe(name)}><RichTextEditor name={name} defaultValue={tr.content} /></Field>;
        if (f.kind === "cards" || f.kind === "faq") {
          const items = Array.isArray(tr.data.items) ? (tr.data.items as Item[]) : [];
          return <Field key={name} label={label} error={fe(name)}><ItemsEditor name={name} kind={f.kind} initial={items} /></Field>;
        }
        if (!("max" in f)) return null;
        const value = "data" in f ? (typeof tr.data[f.key] === "string" ? (tr.data[f.key] as string) : "") : tr[f.key as "title" | "subtitle"];
        return (
          <Field key={name} label={label} htmlFor={`${name}-in`} error={fe(name)}>
            {f.kind === "textarea" ? (
              <Textarea id={`${name}-in`} name={name} defaultValue={value} rows={2} maxLength={f.max} data-testid={`field-${name}`} />
            ) : (
              <Input id={`${name}-in`} name={name} defaultValue={value} maxLength={f.max} data-testid={`field-${name}`} />
            )}
          </Field>
        );
      })}
    </div>
  );
}

export function SectionEditor({
  section,
  amenities,
  index,
  count,
  onMove,
}: {
  section: SectionData;
  amenities: { id: string; name: string }[];
  index: number;
  count: number;
  onMove: (d: -1 | 1) => void;
}) {
  const t = useTranslations("admin.pages");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(section.active);
  const [, start] = useTransition();
  const cfg = SECTION_CONFIG[section.type] ?? { shared: [], local: [] };
  const { onSubmit, pending, fe, alert } = useAdminForm(saveSection, t("sectionSaved"));
  const missingEn = !section.en.title && !!section.de.title;
  const headline = section.de.title || section.en.title;

  return (
    <li className={cn("rounded-lg border bg-card", !active && "opacity-70")} data-testid={`section-${section.type}`}>
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open} data-testid="section-toggle">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="font-medium">{t(`sectionTypes.${section.type}`)}</span>
          {headline ? <span className="min-w-0 truncate text-sm text-muted-foreground">– {headline}</span> : null}
          {missingEn ? <Badge variant="warning" className="shrink-0">EN</Badge> : null}
        </button>
        <div className="flex items-center gap-1">
          <Switch
            checked={active}
            aria-label={active ? t("sectionActive") : t("sectionInactive")}
            onCheckedChange={(v: boolean) => {
              setActive(v);
              start(async () => {
                const r = await setSectionActive(section.id, v);
                if (!r.ok) {
                  setActive(!v);
                  toast.error(errorText(r.error));
                } else router.refresh();
              });
            }}
          />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMove(-1)} disabled={index === 0} aria-label={tc("moveUp")}><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={tc("moveDown")}><ArrowDown /></Button>
          <ConfirmDialog
            trigger={<Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={tc("delete")}><Trash2 /></Button>}
            title={`${t(`sectionTypes.${section.type}`)}: ${tc("delete")}?`}
            description={tc("cannotUndo")}
            confirmLabel={tc("yesDelete")}
            cancelLabel={tc("cancel")}
            onConfirm={async () => {
              const r = await deleteSection(section.id);
              if (r.ok) {
                toast.success(t("sectionDeleted"));
                router.refresh();
              } else toast.error(errorText(r.error));
            }}
          />
        </div>
      </div>
      {open ? (
        <form onSubmit={onSubmit} className="space-y-5 border-t p-4" noValidate>
          <input type="hidden" name="id" value={section.id} />
          <input type="hidden" name="active" value={active ? "true" : "false"} />
          {alert}
          {cfg.shared.length === 0 && cfg.local.length <= 2 && !cfg.media ? <p className="text-sm text-muted-foreground">{t("fields.noFields")}</p> : null}
          {cfg.media ? (
            <Field label={t("fields.image")}>
              <ImageField name="media_id" value={section.media} />
            </Field>
          ) : null}
          {cfg.shared.length ? (
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold">{t("fields.sharedFields")}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {cfg.shared.map((f) => (
                  <div key={f.key} className={f.kind === "mediaList" || f.kind === "amenityList" ? "sm:col-span-2" : ""}>
                    <SharedInput f={f} s={section.settings} amenities={amenities} gallery={section.gallery} error={fe(`s_${f.key}`)} />
                  </div>
                ))}
              </div>
            </fieldset>
          ) : null}
          {cfg.local.length ? (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">{t("fields.localizedFields")}</legend>
              <LocaleTabs
                missing={{ en: missingEn }}
                de={<LocalInputs fields={cfg.local} l="de" tr={section.de} fe={fe} />}
                en={<LocalInputs fields={cfg.local} l="en" tr={section.en} fe={fe} />}
              />
            </fieldset>
          ) : null}
          <div className="flex justify-end">
            <SubmitButton pending={pending} data-testid="section-save">{tc("save")}</SubmitButton>
          </div>
        </form>
      ) : null}
    </li>
  );
}
