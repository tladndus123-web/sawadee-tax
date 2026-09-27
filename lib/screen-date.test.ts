import { describe, expect, it } from "vitest";
import { screenDate } from "./screen-date";

describe("dates on screens", () => {
  it("Japanese readers get year/month/day with the weekday", () => {
    expect(screenDate("ja", "2026-09-27")).toBe("2026/09/27（日）");
    expect(screenDate("ja", "2026-10-15")).toBe("2026/10/15（木）");
  });
  it("other readers keep the Thai day/month/year", () => {
    expect(screenDate("th", "2026-09-27")).toBe("27/09/2026");
    expect(screenDate("ko", "2026-09-27")).toBe("27/09/2026");
    expect(screenDate("ja", "")).toBe("—");
  });
});
