import { describe, expect, it } from "vitest";
import { baht, bahtWhole } from "./money";

describe("money on screen", () => {
  it("exact amounts keep satang", () => {
    expect(baht(64200)).toBe("฿ 64,200.00");
  });
  it("short amounts round to the baht, no space, minus in front", () => {
    expect(bahtWhole(663602.8)).toBe("฿663,603");
    expect(bahtWhole(0.4)).toBe("฿0");
    expect(bahtWhole(-1234.5)).toBe("−฿1,235");
  });
});
