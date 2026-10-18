"use client";

// Registering this device's passkey, shared by the offer after an email sign-in and Settings (lib/auth/passkey).

import { supabaseBrowser } from "@/lib/supabase/client";
import { deviceLabel, isAlreadyRegistered, isCancel, setPasskeyHere } from "./passkey";

/** "ok" registered · "already" this device had one · "cancel" the system sheet was closed. Other failures throw. */
export async function registerThisDevice(): Promise<"ok" | "already" | "cancel"> {
  const sb = supabaseBrowser();
  const { data, error } = await sb.auth.registerPasskey();
  if (error) {
    if (isAlreadyRegistered(error)) {
      setPasskeyHere("registered");
      return "already";
    }
    if (isCancel(error)) return "cancel";
    throw error;
  }
  setPasskeyHere(data?.id || "registered");
  // A name that says which device it is, for the list in Settings (the passkey works without it)
  if (data?.id) await sb.auth.passkey.update({ passkeyId: data.id, friendlyName: deviceLabel(navigator.userAgent) }).catch(() => {});
  return "ok";
}
