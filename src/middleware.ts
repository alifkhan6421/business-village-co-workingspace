import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

// Areas that need a signed-in user (role checks happen server-side in the
// layouts, server actions and RLS policies; this is only the first gate).
const PROTECTED = /^\/(de|en)\/(admin|konto|account)(\/|$)/;

export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  // Refresh the Supabase session cookie on every request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const match = pathname.match(PROTECTED);
  if (match && !user) {
    const locale = match[1];
    const loginPath = locale === "de" ? "/de/anmelden" : "/en/login";
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
