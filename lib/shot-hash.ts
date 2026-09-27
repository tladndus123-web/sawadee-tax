// "Did I just shoot this?" — continuous shooting makes it easy to press twice on the same receipts. Each shot is
// shrunk to 8×8 grey pixels; every pixel brighter than the average is a 1 (an average hash). Two shots whose
// hashes differ in only a few of the 64 bits are the same scene, and the second one is not sent to the AI.

export const HASH_SIZE = 8;
/** Bits (of 64) two shots may differ by and still count as the same scene */
export const SAME_SCENE_BITS = 6;

/** Average hash of an 8×8 grey image (64 values 0–255), as a string of 64 "0"/"1" */
export function averageHash(gray: ArrayLike<number>): string {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = gray.length ? sum / gray.length : 0;
  let bits = "";
  for (let i = 0; i < gray.length; i++) bits += gray[i] > mean ? "1" : "0";
  return bits;
}

export function hashDistance(a: string, b: string): number {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

export const sameScene = (a: string | null, b: string) => a !== null && hashDistance(a, b) <= SAME_SCENE_BITS;
