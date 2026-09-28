import { describe, expect, it } from "vitest";
import { dHash, distance, findDuplicate, fromHex, toHex } from "./photo-hash";

// A 9×8 grey "photo" from a function of (x, y)
const img = (f: (x: number, y: number) => number) => Array.from({ length: 72 }, (_, i) => f(i % 9, Math.floor(i / 9)));
const receipt = img((x, y) => ((x * 37 + y * 91) % 256) ^ (y % 3 ? 40 : 0));
const other = img((x, y) => ((x * 53 + y * 17 + 90) % 256) ^ (x % 2 ? 60 : 0));

describe("photo fingerprints", () => {
  it("64 bits, kept as 16 hex characters", () => {
    const h = toHex(dHash(receipt));
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(fromHex(h)).toBe(dHash(receipt));
  });
  it("the same photo a little brighter or re-compressed is the same; another receipt is not", () => {
    const a = toHex(dHash(receipt));
    const brighter = toHex(dHash(receipt.map((v) => Math.min(255, v * 1.1 + 5))));
    const noisy = toHex(dHash(receipt.map((v, i) => v + ((i * 7) % 3) - 1)));
    expect(distance(a, brighter)).toBeLessThanOrEqual(8);
    expect(distance(a, noisy)).toBeLessThanOrEqual(8);
    expect(distance(a, toHex(dHash(other)))).toBeGreaterThan(8);
  });
  it("finds the closest earlier photo; nothing for a new one or a blank page", () => {
    const a = toHex(dHash(receipt));
    const known = [{ id: "x", hash: toHex(dHash(other)) }, { id: "r", hash: a }];
    expect(findDuplicate(toHex(dHash(receipt.map((v) => v + 2))), known)?.id).toBe("r");
    expect(findDuplicate(toHex(dHash(img(() => 200))), [{ id: "blank", hash: "0000000000000000" }])).toBeNull();
    expect(findDuplicate(toHex(dHash(other)), [{ id: "r", hash: a }])).toBeNull();
  });
  it("a broken fingerprint never matches", () => {
    expect(distance("abc", "abc")).toBe(64);
  });
});
