// Links to the app in LINE open in the phone's own browser (owner, 2026-10-27: "라인에서 들어가면 자동로그인 안돼").
// LINE's in-app browser keeps no sign-in and cannot use Face ID; Safari / Chrome keep the sign-in (no time limit since
// 2026-10-26) and offer Face ID. LINE opens a link outside when it carries openExternalBrowser=1, so every link to the
// app in an outgoing message gets it — texts, card buttons and images alike. Other links (signed file links, LINE's own)
// stay as they are.

export const EXTERNAL = "openExternalBrowser";

/** One link to the app with the mark (before a #fragment); anything else unchanged */
export function outside(url: string, origin: string): string {
  if (!origin || !url.startsWith(origin) || (url.length > origin.length && !"/?#".includes(url[origin.length]))) return url;
  try {
    const u = new URL(url);
    if (u.searchParams.has(EXTERNAL)) return url;
    u.searchParams.set(EXTERNAL, "1");
    return u.toString();
  } catch {
    return url;
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every app link inside a message (any depth: texts, flex buttons, quick replies) gets the mark */
export function linksOutside<T>(message: T, origin: string): T {
  if (!origin) return message;
  const inText = new RegExp(`${escape(origin)}(?=[/?#]|$)[^\\s"'<>)]*`, "g");
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.includes(origin) ? v.replace(inText, (u) => outside(u, origin)) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(message) as T;
}
