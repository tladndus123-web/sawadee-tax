// Server only: the same photo fingerprint as lib/photo-hash.ts, with sharp (LINE photos, and the one-off backfill of
// documents saved before fingerprints existed).

import { loadSharp } from "./extract-server";
import { dHash, HASH_H, HASH_W, toHex } from "./photo-hash";

export async function photoHashServer(image: Buffer): Promise<string | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    const { data } = await sharp(image).rotate().resize(HASH_W, HASH_H, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
    return toHex(dHash(data));
  } catch {
    return null;
  }
}
