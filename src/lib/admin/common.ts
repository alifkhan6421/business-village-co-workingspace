import "server-only";
import { revalidatePath } from "next/cache";
import { ActionError, assertAdmin } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/action-result";

export type AdminContext = Awaited<ReturnType<typeof assertAdmin>>;

/**
 * Wraps an admin server action: checks the session is an admin (RLS enforces
 * the same again in the database) and turns thrown errors into result keys.
 */
export async function adminAction<R extends ActionResult<unknown>>(fn: (ctx: AdminContext) => Promise<R>): Promise<R | ActionResult<never>> {
  try {
    const ctx = await assertAdmin();
    return await fn(ctx);
  } catch (e) {
    if (e instanceof ActionError) return fail(e.key);
    console.error("[admin action]", e);
    return fail("unknown");
  }
}

/** Writes an entry to the activity log (only for actions without a DB trigger). */
export async function logActivity(
  ctx: AdminContext,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await ctx.supabase.rpc("log_admin_activity", {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId as string,
    p_metadata: metadata as never,
  });
  if (error) console.error("[activity]", error.message);
}

/** Public pages read CMS content at request time; this refreshes any cached RSC payloads. */
export function revalidateSite() {
  revalidatePath("/", "layout");
}

/** Rich-text form fields arrive as HTML strings from the editor. */
export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}
