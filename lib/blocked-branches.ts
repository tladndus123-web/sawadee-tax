// The branches this person is kept out of (my_blocked_branches()): role-store counts them, branch-store hides them.
// Both ask while a page loads; they share one request (lib/shared-load).

import { shared } from "./shared-load";
import { supabaseBrowser } from "./supabase/client";

export const myBlockedBranches = shared(async () => supabaseBrowser().rpc("my_blocked_branches"));
