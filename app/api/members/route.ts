// Member management (admins only).
//   GET    list with sign-in status (last sign-in, invite accepted, LINE linked, access removed)
//   POST   invite by email. Sign-up is disabled, so this is the only way in: the service role sends
//          the invite email and records the membership with the chosen role (re-inviting restores access).
//   PATCH  { userId, action: "disable" | "enable" | "email", reason?, locale? }
//          disable: remove access (reason required) and ban the login so the session cannot be refreshed
//          enable:  restore access
//          email:   send a sign-in link (also serves as "resend invite")
// Access changes go through the admin's own session, so the database rules (admins only, never yourself,
// never the last admin) decide; the service role only handles the login side.

import { createClient } from "@supabase/supabase-js";
import { routing } from "@/i18n/routing";
import { endIfExpired } from "@/lib/auth/session-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const fail = (error: string, status: number) => Response.json({ error }, { status });
const localeOf = (v: unknown) => (/^(ko|th|en|ja)$/.test(String(v)) ? String(v) : routing.defaultLocale);

/** The caller's session client if they are an active admin (RLS hides removed members) */
async function adminSession() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await endIfExpired(supabase))) return { error: fail("signin", 401) };
  const { data: me } = await supabase.from("members").select("role, disabled_at").eq("user_id", user.id).maybeSingle();
  if (me?.role !== "admin" || me.disabled_at) return { error: fail("forbidden", 403) };
  return { supabase, user };
}

/** Sign-in link by email (implicit flow: the link works on any device, not only the admin's browser) */
async function sendSignInLink(email: string, redirectTo: string) {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
  });
  return anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
}

export async function GET() {
  const s = await adminSession();
  if (s.error) return s.error;
  const admin = supabaseAdmin();
  const [{ data: members, error }, { data: users }] = await Promise.all([
    admin.from("members").select("user_id, email, name, role, created_at, line_user_id, disabled_at, disabled_by, disable_reason").order("created_at"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (error) return fail(error.message, 502);
  const byId = new Map((users?.users ?? []).map((u) => [u.id, u]));
  const nameOf = new Map((members ?? []).map((m) => [m.user_id as string, (m.name as string) || (m.email as string)]));
  return Response.json({
    members: (members ?? []).map((m) => {
      const u = byId.get(m.user_id as string);
      return {
        userId: m.user_id,
        email: m.email,
        name: m.name,
        role: m.role,
        createdAt: m.created_at,
        line: !!m.line_user_id,
        lastSignIn: u?.last_sign_in_at ?? null,
        // An invite counts as accepted once the email link was used
        joined: !!(u?.email_confirmed_at || u?.last_sign_in_at),
        disabledAt: m.disabled_at,
        disabledBy: m.disabled_by ? (nameOf.get(m.disabled_by as string) ?? null) : null,
        disableReason: m.disable_reason,
      };
    }),
  });
}

export async function POST(req: Request) {
  const s = await adminSession();
  if (s.error) return s.error;

  const body = (await req.json().catch(() => ({}))) as { email?: string; role?: string; locale?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = body.role === "admin" ? "admin" : "staff";
  const locale = localeOf(body.locale);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("email", 400);

  const admin = supabaseAdmin();
  const origin = new URL(req.url).origin;
  let userId: string | undefined;
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/${locale}/auth/callback` });
  if (invited?.user) userId = invited.user.id;
  else if (error && /already|registered|exists/i.test(error.message)) {
    // Already has an account (e.g. someone who left and comes back): restore access and send a sign-in link
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (userId) {
      await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
      await admin.from("members").update({ disabled_at: null }).eq("user_id", userId);
    }
  } else if (error) return fail(error.message, 502);
  if (!userId) return fail("user", 502);

  const { error: memberErr } = await admin.from("members").upsert({ user_id: userId, email, role }, { onConflict: "user_id" });
  if (memberErr) return fail(memberErr.message, 502);
  if (!invited?.user) await sendSignInLink(email, `${origin}/${locale}/auth/callback`);
  return Response.json({ ok: true });
}

export async function PATCH(req: Request) {
  const s = await adminSession();
  if (s.error) return s.error;
  const body = (await req.json().catch(() => ({}))) as { userId?: string; action?: string; reason?: string; locale?: string };
  const userId = String(body.userId ?? "");
  if (!/^[0-9a-f-]{36}$/.test(userId)) return fail("user", 400);
  const admin = supabaseAdmin();

  if (body.action === "disable") {
    const reason = String(body.reason ?? "").trim().slice(0, 200);
    if (reason.length < 2) return fail("reason", 400);
    const { data, error } = await s.supabase
      .from("members")
      .update({ disabled_at: new Date().toISOString(), disable_reason: reason })
      .eq("user_id", userId)
      .select("user_id");
    if (error) return fail(/own access/.test(error.message) ? "self" : /admin is required/.test(error.message) ? "lastAdmin" : error.message, 409);
    if (!data?.length) return fail("user", 404);
    // ~100 years: the login cannot be refreshed; RLS already shut the data
    await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    return Response.json({ ok: true });
  }

  if (body.action === "enable") {
    const { data, error } = await s.supabase.from("members").update({ disabled_at: null }).eq("user_id", userId).select("user_id");
    if (error) return fail(error.message, 409);
    if (!data?.length) return fail("user", 404);
    await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
    return Response.json({ ok: true });
  }

  if (body.action === "email") {
    const { data: m } = await admin.from("members").select("email, disabled_at").eq("user_id", userId).maybeSingle();
    if (!m) return fail("user", 404);
    if (m.disabled_at) return fail("disabled", 409);
    const { error } = await sendSignInLink(m.email as string, `${new URL(req.url).origin}/${localeOf(body.locale)}/auth/callback`);
    if (error) return fail(/rate|seconds/i.test(error.message) ? "rate" : error.message, 429);
    return Response.json({ ok: true });
  }

  return fail("action", 400);
}
