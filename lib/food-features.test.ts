import { describe, expect, it } from "vitest";
import { menuFeatures, readFoodFeatures } from "./food-features";

describe("restaurant extras", () => {
  it("are all off unless stored as true", () => {
    expect(readFoodFeatures(null)).toEqual({ delivery: false, prep: false, waste: false });
    expect(readFoodFeatures({ delivery: true, prep: "yes", waste: 1 })).toEqual({ delivery: true, prep: false, waste: false });
    expect(readFoodFeatures([true])).toEqual({ delivery: false, prep: false, waste: false });
  });
  it("bring the waste log into the menu only when on", () => {
    expect(menuFeatures(readFoodFeatures({}))).toEqual([]);
    expect(menuFeatures(readFoodFeatures({ waste: true }))).toEqual(["waste"]);
  });
});
