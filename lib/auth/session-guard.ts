// Server side of the sign-in time limit (see session-limit.ts). Used by the middleware and the API routes.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSessionExpired } from "./session-limit";

/**
 * Call after `auth.getUser()` has accepted the session. When this device signed in too long ago,
 * ends only this device's session on the auth server (other devices keep theirs) and returns true.
 */
export async function endIfExpired(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session || !isSessionExpired(session.access_token)) return false;
  await supabase.auth.signOut({ scope: "local" });
  return true;
}
