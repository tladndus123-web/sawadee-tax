import { describe, expect, it } from "vitest";
import { addView, isOn, MAX_VIEWS, readViews } from "./ledger-views";

const none = { stickers: [], unpaidOnly: false };

describe("saved ledger views", () => {
  it("keeps only clean views", () => {
    expect(readViews(null)).toEqual([]);
    expect(readViews([{ name: "  이번 달 미지급 ", filter: { unpaidOnly: true, period: "this", stickers: ["red", "pink"] }, query: "" }, { name: "" }, { name: "이번 달 미지급" }])).toEqual([
      { name: "이번 달 미지급", filter: { stickers: ["red"], unpaidOnly: true, period: "this" }, query: "" },
    ]);
  });
  it("saves under a name, replacing the same name, at most a dozen", () => {
    let v = addView([], "식재료", { ...none, category: "food" }, "");
    v = addView(v, "식재료", { ...none, category: "food", unpaidOnly: true }, "");
    expect(v).toHaveLength(1);
    expect(v[0].filter.unpaidOnly).toBe(true);
    for (let i = 0; i < 20; i++) v = addView(v, `v${i}`, none, "");
    expect(v).toHaveLength(MAX_VIEWS);
  });
  it("knows which view is on screen", () => {
    const [v] = addView([], "MAKRO", { ...none, unpaidOnly: true }, "makro");
    expect(isOn(v, { ...none, unpaidOnly: true }, " makro ")).toBe(true);
    expect(isOn(v, none, "makro")).toBe(false);
  });
});
