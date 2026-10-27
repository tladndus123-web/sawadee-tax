import { describe, expect, it } from "vitest";
import { arrange, DEFAULT_LAYOUT, moveCard, readLayout, toggleCard } from "./dash-layout";

describe("dashboard cards: order and hiding", () => {
  it("reads any stored shape into a full layout", () => {
    expect(readLayout(undefined)).toEqual(DEFAULT_LAYOUT);
    expect(readLayout({ order: ["cost", "x", "cost", "todo"], hidden: ["team", "y"] })).toEqual({ order: ["cost", "todo", "profit", "tiles", "recent", "team"], hidden: ["team"] });
  });
  it("moves and hides", () => {
    const l = moveCard(DEFAULT_LAYOUT, "cost", -1);
    expect(l.order.indexOf("cost")).toBe(DEFAULT_LAYOUT.order.indexOf("cost") - 1);
    expect(moveCard(DEFAULT_LAYOUT, "profit", -1)).toBe(DEFAULT_LAYOUT);
    expect(toggleCard(toggleCard(DEFAULT_LAYOUT, "team"), "team").hidden).toEqual([]);
  });
  it("draws the wide cards on top, the rest below, in the person's order", () => {
    const l = readLayout({ order: ["cost", "tiles", "todo", "profit"], hidden: ["recent"] });
    expect(arrange(l)).toEqual({ wide: ["tiles", "profit"], rest: ["cost", "todo", "team"] });
  });
});
