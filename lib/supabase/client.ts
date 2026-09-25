"use client";

// Browser client: anon key only. Every table is protected by RLS (supabase/migrations).
import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let linkSender: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}

/**
 * Only for sending sign-in emails. The implicit flow puts the session in the link itself (#access_token),
 * so the link works in whatever browser opens it — a phone's mail app, another browser or another device.
 * (The default PKCE flow only works in the browser that asked for the link: on phones the mail app often
 * opens its own browser, which showed "link expired".) Keeps no session of its own.
 */
export function supabaseLinkSender(): SupabaseClient {
  linkSender ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    // Own storage key so it never touches the signed-in session's storage
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "trl-link-sender" },
  });
  return linkSender;
}
