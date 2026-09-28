import { describe, expect, it } from "vitest";
import { cleanBoxes, MARGIN, overlap, readingOrder, toPixels, type Box } from "./split-boxes";

const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

describe("several receipts in one photo: the finder's boxes", () => {
  it("adds the margin and clips to the image", () => {
    const [b] = cleanBoxes([{ box: [0.01, 0.2, 0.3, 0.5] }]);
    expect(near(b, [0, 0.2 - MARGIN, 0.01 + 0.3 + MARGIN, 0.5 + 2 * MARGIN])).toBe(true);
  });

  it("accepts 0–1000 coordinates and bare arrays; drops junk and specks", () => {
    const boxes = cleanBoxes([[100, 100, 300, 400], { box: [0.5, 0.5, 0.01, 0.01] }, { box: "x" }, null, { box: [0, 0, -1, 1] }]);
    expect(boxes).toHaveLength(1);
    expect(boxes[0][0]).toBeCloseTo(0.1 - MARGIN);
  });

  it("drops a box that is almost the same as one already found", () => {
    expect(cleanBoxes([{ box: [0.1, 0.1, 0.3, 0.4] }, { box: [0.11, 0.1, 0.3, 0.4] }])).toHaveLength(1);
  });

  it("reads rows top to bottom, left to right", () => {
    const a: Box = [0.6, 0.05, 0.3, 0.4]; // top right
    const b: Box = [0.05, 0.08, 0.3, 0.4]; // top left, a bit lower
    const c: Box = [0.1, 0.55, 0.3, 0.4]; // bottom
    expect(readingOrder([c, a, b])).toEqual([b, a, c]);
  });

  it("measures overlap against the smaller box", () => {
    expect(overlap([0, 0, 1, 1], [0.25, 0.25, 0.5, 0.5])).toBe(1);
    expect(overlap([0, 0, 0.2, 0.2], [0.5, 0.5, 0.2, 0.2])).toBe(0);
  });

  it("turns a box into a pixel rectangle inside the image", () => {
    expect(toPixels([0.5, 0.25, 0.6, 0.5], 4000, 3000)).toEqual({ left: 2000, top: 750, width: 2000, height: 1500 });
  });
});
