import { describe, expect, it } from "vitest";
import { brightness, photoIssues, sharpness } from "./photo-quality";

// 60x60 grey pictures: crisp black-on-white stripes (text-like) vs a smooth ramp (out of focus)
const W = 60;
const stripes = Array.from({ length: W * W }, (_, i) => ((i % W) % 6 < 2 ? 20 : 230));
const ramp = Array.from({ length: W * W }, (_, i) => 100 + ((i % W) * 50) / W);

describe("photo check", () => {
  it("tells crisp edges from soft ones", () => {
    expect(sharpness(stripes, W, W)).toBeGreaterThan(200);
    expect(sharpness(ramp, W, W)).toBeLessThan(5);
  });
  it("measures the average grey", () => {
    expect(brightness([0, 255])).toBe(127.5);
  });
  it("names what is wrong, and nothing for a good photo", () => {
    expect(photoIssues({ brightness: 150, sharpness: 110, width: 1330, height: 1773 })).toEqual([]);
    expect(photoIssues({ brightness: 59, sharpness: 48, width: 1330, height: 1773 })).toEqual(["dark"]);
    expect(photoIssues({ brightness: 147, sharpness: 16, width: 1330, height: 1773 })).toEqual(["blurry"]);
    expect(photoIssues({ brightness: 150, sharpness: 110, width: 480, height: 640 })).toEqual(["small"]);
  });
});
