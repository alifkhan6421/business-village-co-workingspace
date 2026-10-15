import { redirect } from "next/navigation";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Coworking is no longer offered on the public site; old links lead to the meeting rooms. */
export default async function Page({ params }: Props) {
  const locale = (await params).locale as Locale;
  redirect(localizeHref("/meeting-rooms", locale));
}
