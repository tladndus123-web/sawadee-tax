import { describe, expect, it } from "vitest";
import { averageHash, hashDistance, sameScene } from "./shot-hash";

// 8×8 "pictures": a receipt on the left half, and one on the right half
const left = Array.from({ length: 64 }, (_, i) => (i % 8 < 4 ? 230 : 40));
const right = Array.from({ length: 64 }, (_, i) => (i % 8 >= 4 ? 230 : 40));

describe("same scene detection", () => {
  it("hashes bright-vs-dark per pixel", () => {
    expect(averageHash(left)).toBe("11110000".repeat(8));
  });

  it("treats a slightly different exposure of the same scene as the same", () => {
    const again = left.map((v, i) => (i === 3 ? 120 : v + 10));
    expect(hashDistance(averageHash(left), averageHash(again))).toBeLessThanOrEqual(1);
    expect(sameScene(averageHash(left), averageHash(again))).toBe(true);
  });

  it("tells different receipts apart, and nothing matches the first shot", () => {
    expect(sameScene(averageHash(left), averageHash(right))).toBe(false);
    expect(sameScene(null, averageHash(left))).toBe(false);
  });
});
