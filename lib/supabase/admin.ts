// Service-role client: bypasses RLS. Server only — used to invite members and by scripts/bootstrap.ts.
// Never import this from a client component.
import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
