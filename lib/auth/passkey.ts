// Passkey sign-in (owner's request 2026-10-18): Face ID / Touch ID / fingerprint / Windows Hello instead of the
// email each time. The 12-hour limit stays (lib/auth/session-limit): a passkey sign-in is a new sign-in, so it just
// makes signing in again one tap. The first sign-in on a device is by email; then the app offers to register the
// device (PasskeyOffer), and the login page shows "sign in with Face ID". Email sign-in always stays.
// This device remembers which passkey it registered (localStorage), only to put the passkey button first and not
// offer again; the list of passkeys itself lives in Supabase Auth (Settings → sign in with Face ID).

const HERE = "sawadee.passkey.here";
const LATER = "sawadee.passkey.later";
/** "Later" hides the offer this long */
export const LATER_DAYS = 14;

/** A short name for this device, kept with the passkey so the list in Settings says which one it is */
export function deviceLabel(ua: string): string {
  const device = /iPad/.test(ua)
    ? "iPad"
    : /iPhone|iPod/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh|Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : /Linux/.test(ua)
                ? "Linux"
                : "";
  const browser = /\bLine\//i.test(ua)
    ? "LINE"
    : /EdgA?\//.test(ua)
      ? "Edge"
      : /SamsungBrowser\//.test(ua)
        ? "Samsung Internet"
        : /FxiOS|Firefox\//.test(ua)
          ? "Firefox"
          : /CriOS|Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "";
  return [device, browser].filter(Boolean).join(" · ") || "Passkey";
}

/** Whether to offer registering this device (not registered here, not put off recently) */
export function shouldOffer(o: { supported: boolean; registeredHere: boolean; laterAt: number | null; now: number }): boolean {
  if (!o.supported || o.registeredHere) return false;
  return o.laterAt === null || o.now - o.laterAt >= LATER_DAYS * 86_400_000;
}

/** The user closed the system sheet (or it timed out): not an error worth a red message */
export function isCancel(e: unknown): boolean {
  const o = (e ?? {}) as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };
  const text = [o.name, o.code, o.message, (o.cause as { name?: unknown } | undefined)?.name].map((v) => String(v ?? "")).join(" ");
  return /NotAllowed|Abort|CEREMONY_ABORTED|cancel/i.test(text);
}

/** This device already has a passkey for the account (registering again is refused by the authenticator) */
export function isAlreadyRegistered(e: unknown): boolean {
  const o = (e ?? {}) as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };
  const text = [o.name, o.code, o.message, (o.cause as { name?: unknown } | undefined)?.name].map((v) => String(v ?? "")).join(" ");
  return /InvalidState|AUTHENTICATOR_PREVIOUSLY_REGISTERED|already registered/i.test(text);
}

/** Face ID / Touch ID / fingerprint / Windows Hello is there (false in browsers without passkeys, e.g. some in-app ones) */
export async function passkeySupported(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // private mode: the offer may show again, nothing else depends on it
  }
};

/** The passkey this device registered (its id), if any */
export const passkeyHere = () => read(HERE);
export const setPasskeyHere = (id: string | null) => write(HERE, id);
export const laterAt = () => {
  const n = Number(read(LATER));
  return Number.isFinite(n) && n > 0 ? n : null;
};
export const setLater = () => write(LATER, String(Date.now()));
