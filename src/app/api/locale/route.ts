import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isLocale } from "@/i18n/routing";
import { switchLocalePath } from "@/lib/href";

/**
 * Language switch: maps the current page to the other locale, remembers the
 * choice in a cookie (guests) and on the profile (signed-in users).
 */
export async function GET(request: NextRequest) {
  const to = request.nextUrl.searchParams.get("to");
  const path = request.nextUrl.searchParams.get("path") ?? "/";
  const search = request.nextUrl.searchParams.get("search") ?? "";
  if (!isLocale(to)) return NextResponse.redirect(new URL("/de", request.url));
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  const target = switchLocalePath(safePath, to) + (search.startsWith("?") ? search : "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from("profiles").update({ preferred_locale: to }).eq("id", user.id);

  const res = NextResponse.redirect(new URL(target, request.url), 303);
  res.cookies.set("NEXT_LOCALE", to, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
