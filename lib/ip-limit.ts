// A brake on token guessing (security check 2026-11-09): the routes anyone can call without signing in — the OAuth
// code exchange, the accountant's share links, the calendar feed — answer 404 / invalid_grant to a wrong token, and
// each wrong try costs a database read. After `perMinute` wrong tries from one address in a minute, that address is
// refused before the read. Right tries are never counted, so a page that loads 200 photos is not slowed down.
// Memory per server instance like the other limiters here (Vercel runs several), and the tokens themselves are long
// random strings — this cuts a flood short, it is not what keeps the links safe.

const fails = new Map<string, number[]>();
const WINDOW = 60_000;

export const ipOf = (req: Request): string => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

const recent = (key: string, now: number) => (fails.get(key) ?? []).filter((t) => now - t < WINDOW);

/** Too many wrong tries from this address lately? Check before the lookup. */
export function guessingTooMuch(req: Request, scope: string, perMinute: number, now = Date.now()): boolean {
  return recent(`${scope}:${ipOf(req)}`, now).length >= perMinute;
}

/** Count a wrong try (a token that did not match). */
export function wrongGuess(req: Request, scope: string, now = Date.now()): void {
  const key = `${scope}:${ipOf(req)}`;
  fails.set(key, [...recent(key, now), now]);
  // Keep the map small: drop addresses whose tries are all old
  if (fails.size > 2000) for (const [k, v] of fails) if (!v.some((t) => now - t < WINDOW)) fails.delete(k);
}

export const TOO_MANY = () => new Response("Too many requests", { status: 429, headers: { "retry-after": "60", "cache-control": "no-store" } });
