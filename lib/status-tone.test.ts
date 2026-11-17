import { describe, expect, it } from "vitest";
import { dueTone } from "./status-tone";

describe("deadline colours", () => {
  it("red within 3 days or late, amber within a week, blue further off", () => {
    expect(dueTone(-2)).toBe("bad");
    expect(dueTone(0)).toBe("bad");
    expect(dueTone(3)).toBe("bad");
    expect(dueTone(4)).toBe("warn");
    expect(dueTone(7)).toBe("warn");
    expect(dueTone(8)).toBe("brand");
  });
});
