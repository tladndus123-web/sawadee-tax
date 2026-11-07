// Keys for a connected AI agent (Grok Bot): "sk_sawa_" + 32 random letters and digits. Only the SHA-256 is stored
// (public.bot_keys), so a key cannot be shown again — the owner copies it once and makes a new one if lost.

import { createHash, randomBytes } from "node:crypto";

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const KEY_PREFIX = "sk_sawa_";

export function makeKey(): string {
  const bytes = randomBytes(32);
  let s = "";
  for (const b of bytes) s += ABC[b % ABC.length];
  return KEY_PREFIX + s;
}

export const hashKey = (key: string): string => createHash("sha256").update(key, "utf8").digest("hex");

/** What the owner sees to tell keys apart */
export const keyHint = (key: string): string => `${key.slice(0, KEY_PREFIX.length + 4)}…`;

/** The key in an "Authorization: Bearer …" header (or a bare key), if it looks like one of ours */
export function keyFromHeader(header: string | null): string | null {
  const k = (header ?? "").replace(/^Bearer\s+/i, "").trim();
  return k.startsWith(KEY_PREFIX) && /^[A-Za-z0-9_]{40}$/.test(k) ? k : null;
}
