// Server: admins an owner did not limit (no screen list, kept out of no branch) and owners — the ones the AI
// assistant, the LINE number answers and the company reminders are for (lib/screens fullAdmin). Server only.

import type { supabaseAdmin } from "./supabase/admin";

type Admin = ReturnType<typeof supabaseAdmin>;

/** The active admins who see everything, with their LINE ids */
export async function fullAdmins(admin: Admin): Promise<{ user_id: string; line_user_id: string | null }[]> {
  const [{ data: ms, error }, { data: blocks }] = await Promise.all([
    admin.from("members").select("user_id, line_user_id, owner, admin_screens").eq("role", "admin").is("disabled_at", null),
    admin.from("member_branch_blocks").select("user_id"),
  ]);
  if (error) throw error;
  const kept = new Set((blocks ?? []).map((b) => b.user_id as string));
  return (ms ?? [])
    .filter((m) => m.owner || (m.admin_screens === null && !kept.has(m.user_id as string)))
    .map((m) => ({ user_id: m.user_id as string, line_user_id: (m.line_user_id as string | null) ?? null }));
}

/** Is this member one of them? */
export async function isFullAdmin(admin: Admin, userId: string): Promise<boolean> {
  return (await fullAdmins(admin)).some((m) => m.user_id === userId);
}
