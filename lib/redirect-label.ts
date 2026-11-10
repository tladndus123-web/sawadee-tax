// Where an agent sign-in sends its one-time code, in words an owner can judge (final check 2026-11-10): anyone may
// register a client with any name, so the "허용" page also shows the address the code goes to. Browser-safe.

/** "example.com" for a website, "this computer" kinds as "localhost", an app link as "cursor://" */
export function redirectLabel(uri: string): string {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:" || u.protocol === "http:") return u.hostname;
    return `${u.protocol}//`;
  } catch {
    return "";
  }
}

/** True when the code stays on the owner's own device (loopback or an app link), false for a website */
export function staysOnDevice(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return false;
    if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    return true;
  } catch {
    return false;
  }
}
