import { describe, expect, it } from "vitest";
import { isSlip, MAX_TILES, tileRects } from "./slip-tiles";

describe("long slip pieces", () => {
  it("leaves normal documents whole", () => {
    expect(tileRects(1800, 2400)).toEqual([{ left: 0, top: 0, width: 1800, height: 2400 }]);
    expect(isSlip(1800, 2400)).toBe(false);
  });

  it("cuts a long slip top to bottom with overlaps and no gaps", () => {
    const tiles = tileRects(1000, 5000);
    expect(isSlip(1000, 5000)).toBe(true);
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles[0].top).toBe(0);
    expect(tiles.at(-1)!.top + tiles.at(-1)!.height).toBe(5000);
    for (let i = 1; i < tiles.length; i++) {
      expect(tiles[i].top).toBeLessThan(tiles[i - 1].top + tiles[i - 1].height); // overlaps the one above
      expect(tiles[i].width).toBe(1000);
    }
    // each piece keeps a readable shape (not much longer than 1.5 × the width)
    for (const t of tiles) expect(t.height).toBeLessThanOrEqual(1500);
  });

  it("never sends more than MAX_TILES pieces, even for a very long slip", () => {
    const tiles = tileRects(600, 20000);
    expect(tiles.length).toBeLessThanOrEqual(MAX_TILES);
    expect(tiles.at(-1)!.top + tiles.at(-1)!.height).toBe(20000);
  });

  it("cuts a sideways slip left to right", () => {
    const tiles = tileRects(4000, 900);
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles.every((t) => t.top === 0 && t.height === 900)).toBe(true);
    expect(tiles.at(-1)!.left + tiles.at(-1)!.width).toBe(4000);
  });
});
