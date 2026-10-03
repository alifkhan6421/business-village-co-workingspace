"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/forms/submit-button";
import { useErrorText } from "@/components/forms/use-error-text";
import { DeleteButton } from "./delete-button";
import { useAdminForm } from "./people-forms";
import { deleteNavItem, reorderNav, saveNavItem } from "@/lib/admin/cms";

export type NavItem = { id: string; menu: string; label_de: string; label_en: string; href: string; open_in_new_tab: boolean; active: boolean; display_order: number };

function NavForm({ item, menu, onDone }: { item: NavItem | null; menu: string; onDone: () => void }) {
  const t = useTranslations("admin.navigation");
  const tc = useTranslations("admin.common");
  const tm = useTranslations("status.menu");
  const router = useRouter();
  const { onSubmit, pending, fe, alert } = useAdminForm(saveNavItem, item ? tc("updated") : tc("created"), () => {
    onDone();
    router.refresh();
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2" noValidate>
      <input type="hidden" name="id" value={item?.id ?? ""} />
      {alert ? <div className="sm:col-span-2">{alert}</div> : null}
      <Field label={t("labelDe")} htmlFor="nv-de" error={fe("label_de")}><Input id="nv-de" name="label_de" defaultValue={item?.label_de} maxLength={80} /></Field>
      <Field label={t("labelEn")} htmlFor="nv-en" error={fe("label_en")}><Input id="nv-en" name="label_en" defaultValue={item?.label_en} maxLength={80} /></Field>
      <Field label={t("href")} htmlFor="nv-href" error={fe("href")} hint={t("hrefHint")} className="sm:col-span-2"><Input id="nv-href" name="href" defaultValue={item?.href ?? "/"} maxLength={500} /></Field>
      <Field label={t("menu")} htmlFor="nv-menu">
        <NativeSelect id="nv-menu" name="menu" defaultValue={item?.menu ?? menu}>
          {["header", "footer", "legal"].map((m) => <option key={m} value={m}>{tm(m)}</option>)}
        </NativeSelect>
      </Field>
      <div className="flex flex-col justify-end gap-2 pb-1">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="open_in_new_tab" defaultChecked={item?.open_in_new_tab} className="h-4 w-4 accent-primary" /> {t("newTab")}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={item?.active ?? true} className="h-4 w-4 accent-primary" /> {tc("visible")}</label>
      </div>
      <div className="flex justify-end sm:col-span-2"><SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton></div>
    </form>
  );
}

export function NavManager({ items }: { items: NavItem[] }) {
  const t = useTranslations("admin.navigation");
  const tc = useTranslations("admin.common");
  const tcm = useTranslations("common");
  const tm = useTranslations("status.menu");
  const errorText = useErrorText();
  const router = useRouter();
  const [editing, setEditing] = useState<{ item: NavItem | null; menu: string } | null>(null);
  const [, start] = useTransition();
  const move = (list: NavItem[], i: number, d: -1 | 1) => {
    const ids = list.map((x) => x.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    start(async () => {
      const r = await reorderNav(ids);
      if (!r.ok) toast.error(errorText(r.error));
      router.refresh();
    });
  };
  return (
    <div className="space-y-6">
      {["header", "footer", "legal"].map((menu) => {
        const list = items.filter((x) => x.menu === menu).sort((a, b) => a.display_order - b.display_order);
        return (
          <Card key={menu}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{tm(menu)}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setEditing({ item: null, menu })}><Plus /> {t("add")}</Button>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {list.map((n, i) => (
                  <li key={n.id} className="flex flex-wrap items-center gap-2 py-2">
                    <div className="flex">
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => move(list, i, -1)} aria-label={tcm("moveUp")}><ArrowUp /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === list.length - 1} onClick={() => move(list, i, 1)} aria-label={tcm("moveDown")}><ArrowDown /></Button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{n.label_de} <span className="text-muted-foreground">/ {n.label_en || <span className="text-amber-700">{tc("missingTranslation")}</span>}</span></div>
                      <div className="flex items-center gap-1 break-all text-xs text-muted-foreground">{n.href} {n.open_in_new_tab ? <ExternalLink className="h-3 w-3" /> : null}</div>
                    </div>
                    {!n.active ? <Badge variant="muted">{tc("hidden")}</Badge> : null}
                    <Button size="sm" variant="outline" onClick={() => setEditing({ item: n, menu })}><Pencil /> {tc("edit")}</Button>
                    <DeleteButton action={deleteNavItem.bind(null, n.id)} name={n.label_de} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl" closeLabel={tcm("close")}>
          <DialogHeader><DialogTitle>{editing?.item ? t("edit") : t("add")}</DialogTitle></DialogHeader>
          {editing ? <NavForm item={editing.item} menu={editing.menu} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
