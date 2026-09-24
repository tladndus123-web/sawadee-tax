// Invite a member (admin only). Sign-up is disabled, so this is the only way in:
// the service role sends the invite email and records the membership with the chosen role.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(req: Request) {
  // The caller must be a signed-in admin (checked with their own session, i.e. through RLS)
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("signin", 401);
  const { data: me } = await supabase.from("members").select("role").eq("user_id", user.id).maybeSingle();
  if (me?.role !== "admin") return fail("forbidden", 403);

  const body = (await req.json().catch(() => ({}))) as { email?: string; role?: string; locale?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = body.role === "admin" ? "admin" : "staff";
  const locale = /^(ko|th|en|ja)$/.test(String(body.locale)) ? body.locale : "ko";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("email", 400);

  const admin = supabaseAdmin();
  const origin = new URL(req.url).origin;
  let userId: string | undefined;
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/${locale}/auth/callback` });
  if (invited?.user) userId = invited.user.id;
  else if (error && /already|registered|exists/i.test(error.message)) {
    // Already has an account (e.g. removed and re-added): just (re)grant membership
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
  } else if (error) return fail(error.message, 502);
  if (!userId) return fail("user", 502);

  const { error: memberErr } = await admin.from("members").upsert({ user_id: userId, email, role }, { onConflict: "user_id" });
  if (memberErr) return fail(memberErr.message, 502);
  return Response.json({ ok: true });
}
