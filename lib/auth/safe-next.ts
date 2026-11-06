// Where to go after signing in (the "next" in a sign-in link): only a path on this site. A link someone else made
// must never send the person to another site once they are signed in (security check 2026-11-07: "/\evil.com" passed
// the old "starts with / but not //" test, and browsers read "\" as "/").

/** `next` when it is a plain path on this site, else `fallback` */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  // Backslashes and control characters (tabs, new lines) are cleaned or reread by browsers into "//"
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const base = "https://this.site";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
