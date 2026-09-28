// "Was this photo uploaded before?" (owner's request 2026-09-28) — before the AI reads it (so no reading cost) and
// before it reaches the ledger twice. Each photo gets a fingerprint: a difference hash (dHash) — the photo shrunk to
// 9×8 grey pixels, one bit per neighbouring pair (is the left one brighter?). Re-uploads of the same file, a
// re-compressed copy or the same picture sent again through LINE differ in only a few of the 64 bits; different
// receipts differ in many. The phone (canvas) and the server (sharp) shrink slightly differently, hence a distance.

export const HASH_W = 9;
export const HASH_H = 8;
/** Bits (of 64) two photos may differ by and still be the same photo */
export const DUP_BITS = 8;

/** dHash of a 9×8 grey image (72 values, row by row) as 64 "0"/"1" */
export function dHash(gray: ArrayLike<number>): string {
  let bits = "";
  for (let y = 0; y < HASH_H; y++) {
    for (let x = 0; x < HASH_W - 1; x++) bits += gray[y * HASH_W + x] > gray[y * HASH_W + x + 1] ? "1" : "0";
  }
  return bits;
}

/** 64 bits ⇄ 16 hex characters (how the database keeps it) */
export const toHex = (bits: string) => (bits.match(/.{4}/g) ?? []).map((b) => parseInt(b, 2).toString(16)).join("");
export const fromHex = (hex: string) => [...hex].map((c) => parseInt(c, 16).toString(2).padStart(4, "0")).join("");

export function distance(a: string, b: string): number {
  const x = fromHex(a);
  const y = fromHex(b);
  if (x.length !== y.length || x.length !== 64) return 64;
  let d = 0;
  for (let i = 0; i < 64; i++) if (x[i] !== y[i]) d++;
  return d;
}

/**
 * The closest earlier photo within DUP_BITS, or null. A blank or uniform photo (almost no edges) never matches:
 * its fingerprint says nothing about the receipt.
 */
export function findDuplicate<T extends { hash: string }>(hash: string, known: T[]): T | null {
  const ones = fromHex(hash).split("").filter((b) => b === "1").length;
  if (ones < 4 || ones > 60) return null;
  let best: T | null = null;
  let bestD = DUP_BITS + 1;
  for (const k of known) {
    const d = distance(hash, k.hash);
    if (d < bestD) {
      best = k;
      bestD = d;
    }
  }
  return best;
}

/** Browser only: the fingerprint of a photo (drawn upright, as the phone shows it) */
export async function photoHash(photo: Blob): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(photo);
    const c = document.createElement("canvas");
    c.width = HASH_W;
    c.height = HASH_H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, HASH_W, HASH_H);
    bmp.close();
    const px = ctx.getImageData(0, 0, HASH_W, HASH_H).data;
    const gray = Array.from({ length: HASH_W * HASH_H }, (_, i) => (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000);
    return toHex(dHash(gray));
  } catch {
    return null;
  }
}
