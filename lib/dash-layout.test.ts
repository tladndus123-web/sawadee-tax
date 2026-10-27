import { describe, expect, it } from "vitest";
import { arrange, DEFAULT_LAYOUT, moveCard, readLayout, toggleCard } from "./dash-layout";

describe("dashboard cards: order and hiding", () => {
  it("reads any stored shape into a full layout", () => {
    expect(readLayout(undefined)).toEqual(DEFAULT_LAYOUT);
    // a card that left the dashboard ("team") is dropped; new ones come at the end
    expect(readLayout({ order: ["cost", "x", "cost", "todo", "team"], hidden: ["team", "recent", "y"] })).toEqual({ order: ["cost", "todo", "profit", "tiles", "upcoming", "recent", "claims"], hidden: ["recent"] });
  });
  it("moves and hides", () => {
    const l = moveCard(DEFAULT_LAYOUT, "cost", -1);
    expect(l.order.indexOf("cost")).toBe(DEFAULT_LAYOUT.order.indexOf("cost") - 1);
    expect(moveCard(DEFAULT_LAYOUT, "profit", -1)).toBe(DEFAULT_LAYOUT);
    expect(toggleCard(toggleCard(DEFAULT_LAYOUT, "claims"), "claims").hidden).toEqual([]);
  });
  it("draws the wide cards on top, the rest below, in the person's order", () => {
    const l = readLayout({ order: ["cost", "tiles", "todo", "profit"], hidden: ["recent"] });
    expect(arrange(l)).toEqual({ wide: ["tiles", "profit"], rest: ["cost", "todo", "upcoming", "claims"] });
  });
});
