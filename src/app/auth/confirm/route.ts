import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sendAccountEmail } from "@/lib/email/templates";
import { localizeHref } from "@/lib/href";

const ALLOWED: EmailOtpType[] = ["signup", "magiclink", "recovery", "email", "email_change"];

/** Verifies email confirmation / password-reset links and starts the session. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const nextParam = params.get("next") ?? "/de";
  const next = /^\/(de|en)(\/|$)/.test(nextParam) ? nextParam : "/de";
  const locale = next.startsWith("/en") ? "en" : "de";

  if (tokenHash && type && ALLOWED.includes(type)) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error && data.user) {
      if (type === "signup" || type === "magiclink") {
        const { data: profile } = await supabase.from("profiles").select("first_name, preferred_locale").eq("id", data.user.id).single();
        if (type === "signup" && profile) {
          await sendAccountEmail("welcome", data.user.email!, profile.preferred_locale === "en" ? "en" : "de", profile.first_name);
        }
        return NextResponse.redirect(new URL(`${next}?welcome=1`, request.url));
      }
      return NextResponse.redirect(new URL(next, request.url));
    }
  }
  return NextResponse.redirect(new URL(`${localizeHref("/login", locale)}?error=link`, request.url));
}
