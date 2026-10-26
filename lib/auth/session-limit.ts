// Sign-in stays until the person signs out (owner 2026-10-26: no more signing in again every 12 hours — opening the
// app from LINE kept asking). A limit can still be set with NEXT_PUBLIC_SESSION_HOURS; it then lasts a fixed time per
// device, even across browser restarts.
// The clock starts at the sign-in itself: Supabase puts that moment in the access token's `amr` claim
// ({ method, timestamp }) and keeps it unchanged when the token is refreshed, so a refresh never extends it.
// Each device has its own session, so signing in on a phone does not reset or end the PC's session.

/** Hours a sign-in stays valid; null = until signing out. NEXT_PUBLIC_SESSION_HOURS sets a limit. */
export const SESSION_HOURS: number | null = (() => {
  const n = Number(process.env.NEXT_PUBLIC_SESSION_HOURS);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

/** JWT payload without verifying it — only call on a token the auth server has already accepted. */
function payload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const obj: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** When this session signed in (ms since epoch), from the token's amr claim; null if the token has none. */
export function signedInAt(accessToken: string): number | null {
  const amr = payload(accessToken)?.amr;
  if (!Array.isArray(amr)) return null;
  const times = amr
    .map((a) => (a && typeof a === "object" ? Number((a as { timestamp?: unknown }).timestamp) : NaN))
    .filter((t) => Number.isFinite(t) && t > 0);
  // Several entries (e.g. a second factor added later): the first sign-in is what counts
  return times.length ? Math.min(...times) * 1000 : null;
}

/** How this session signed in (the token's amr methods, e.g. "otp", "magiclink", "passkey") */
export function signInMethods(accessToken: string): string[] {
  const amr = payload(accessToken)?.amr;
  if (!Array.isArray(amr)) return [];
  return amr.map((a) => (a && typeof a === "object" ? String((a as { method?: unknown }).method ?? "") : "")).filter(Boolean);
}

/** When the sign-in stops being valid (ms), or null when there is no limit or the token carries no sign-in time. */
export function sessionEndsAt(accessToken: string, hours: number | null = SESSION_HOURS): number | null {
  if (hours == null) return null;
  const at = signedInAt(accessToken);
  return at == null ? null : at + hours * 3_600_000;
}

/**
 * true once `hours` have passed since sign-in. A token without a sign-in time is not treated as expired:
 * its validity is still checked by Supabase itself (getUser), this only adds the time limit.
 */
export function isSessionExpired(accessToken: string, now: number = Date.now(), hours: number | null = SESSION_HOURS): boolean {
  const end = sessionEndsAt(accessToken, hours);
  return end != null && now >= end;
}
