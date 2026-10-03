"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ActionResult, fail, zodFieldErrors } from "@/lib/action-result";
import { emailSchema, formToObject, optString, passwordSchema, phoneSchema, reqString } from "@/lib/validation";
import { appUrl, localizeHref } from "@/lib/href";
import { emailConfigured } from "@/lib/email/send";
import { sendAccountEmail } from "@/lib/email/templates";
import { isLocale, type Locale } from "@/i18n/routing";

function safeNext(next: unknown, fallback: string) {
  return typeof next === "string" && /^\/(de|en)(\/|$)/.test(next) && !next.startsWith("//") ? next : fallback;
}

function localeFrom(v: unknown): Locale {
  return isLocale(v) ? v : "de";
}

function confirmUrl(tokenHash: string, type: string, next: string) {
  return appUrl(`/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}&next=${encodeURIComponent(next)}`);
}

function devLog(label: string, url: string) {
  if (!emailConfigured() && process.env.NODE_ENV !== "production") {
    console.info(`[auth] ${label} (email provider not configured): ${url}`);
  }
}

export async function signIn(_prev: unknown, formData: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  const raw = formToObject(formData);
  const parsed = z.object({ email: emailSchema, password: z.string().min(1, "required") }).safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") return fail("auth.emailNotConfirmed");
    if (error.status === 429) return fail("rateLimited");
    return fail("auth.invalidCredentials");
  }
  const { data: profile } = await supabase.from("profiles").select("role, preferred_locale").eq("id", data.user.id).single();
  const locale = localeFrom(profile?.preferred_locale ?? raw.locale);
  const fallback = profile?.role === "admin" ? `/${locale}/admin` : localizeHref("/account", locale);
  return { ok: true, data: { redirectTo: safeNext(raw.next, fallback) } };
}

const signUpSchema = z
  .object({
    firstName: reqString(100),
    lastName: reqString(100),
    email: emailSchema,
    company: reqString(200),
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    terms: z.literal("on", { message: "mustAcceptTerms" }),
    privacy: z.literal("on", { message: "mustAcceptPrivacy" }),
  })
  .refine((v) => v.password === v.confirmPassword, { message: "passwordMismatch", path: ["confirmPassword"] });

/**
 * Member signup. The account is created server-side; the database trigger
 * always assigns the role "member" (no input can choose a role).
 */
export async function signUp(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const raw = formToObject(formData);
  const locale = localeFrom(raw.locale);
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  const v = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email: v.email,
    password: v.password,
    options: {
      data: {
        first_name: v.firstName,
        last_name: v.lastName,
        company: v.company,
        phone: v.phone ?? "",
        preferred_locale: locale,
        terms_accepted: "true",
        privacy_accepted: "true",
      },
    },
  });

  if (error) {
    // Do not reveal whether an address is registered: same response as success.
    if (/already|registered|exists/i.test(error.message)) return { ok: true };
    return fail("unknown");
  }

  const url = confirmUrl(data.properties.hashed_token, "signup", localizeHref("/account", locale));
  devLog("verification link", url);
  await sendAccountEmail("verify_email", v.email, locale, v.firstName, url);
  return { ok: true };
}

export async function resendVerification(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const raw = formToObject(formData);
  const locale = localeFrom(raw.locale);
  const parsed = emailSchema.safeParse(raw.email);
  if (!parsed.success) return fail("validation", { email: "invalidEmail" });
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("first_name, email_verified").ilike("email", parsed.data).maybeSingle();
  if (profile && !profile.email_verified) {
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: parsed.data });
    if (data?.properties?.hashed_token) {
      const url = confirmUrl(data.properties.hashed_token, "magiclink", localizeHref("/account", locale));
      devLog("verification link", url);
      await sendAccountEmail("verify_email", parsed.data, locale, profile.first_name, url);
    }
  }
  return { ok: true };
}

export async function requestPasswordReset(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const raw = formToObject(formData);
  const locale = localeFrom(raw.locale);
  const parsed = emailSchema.safeParse(raw.email);
  if (!parsed.success) return fail("validation", { email: "invalidEmail" });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("first_name, preferred_locale").ilike("email", parsed.data).maybeSingle();
  if (profile) {
    const { data } = await admin.auth.admin.generateLink({ type: "recovery", email: parsed.data });
    if (data?.properties?.hashed_token) {
      const userLocale = localeFrom(profile.preferred_locale ?? locale);
      const url = confirmUrl(data.properties.hashed_token, "recovery", localizeHref("/reset-password", userLocale));
      devLog("password reset link", url);
      await sendAccountEmail("password_reset", parsed.data, userLocale, profile.first_name, url);
    }
  }
  // Same answer whether or not the address exists.
  return { ok: true };
}

export async function updatePassword(_prev: unknown, formData: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  const raw = formToObject(formData);
  const locale = localeFrom(raw.locale);
  const parsed = z
    .object({ password: passwordSchema, confirmPassword: z.string() })
    .refine((v) => v.password === v.confirmPassword, { message: "passwordMismatch", path: ["confirmPassword"] })
    .safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("auth.resetLinkExpired");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(error.code === "same_password" ? "auth.samePassword" : "unknown");
  return { ok: true, data: { redirectTo: localizeHref("/account", locale) } };
}

export async function signOut(locale: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${localeFrom(locale)}`);
}

export async function updateProfile(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const raw = formToObject(formData);
  const parsed = z
    .object({
      firstName: reqString(100),
      lastName: reqString(100),
      phone: phoneSchema,
      company: optString(200),
      department: optString(200),
      preferredLocale: z.enum(["de", "en"], { message: "invalidValue" }),
    })
    .safeParse(raw);
  if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("notAuthenticated");
  // Only the columns members may change (enforced by column privileges too).
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      phone: parsed.data.phone,
      company: parsed.data.company,
      department: parsed.data.department,
      preferred_locale: parsed.data.preferredLocale,
    })
    .eq("id", user.id);
  if (error) return fail("unknown");
  return { ok: true };
}
