import { describe, expect, it } from "vitest";
import { cleanFilter, triIlike } from "./ai-search";

describe("AI search filter", () => {
  const keys = ["food", "rent"];
  it("keeps a sound filter and drops what does not fit", () => {
    expect(cleanFilter({ kind: "purchases", from: "2026-10-31", to: "2026-10-01", seller: "Makro (Thai), x", item: "หมู", category: "pets", minAmount: 0, maxAmount: 5000, paid: "unpaid", docNo: "", explain: "Makro pork in October" }, keys)).toEqual({
      kind: "purchases",
      from: "2026-10-01",
      to: "2026-10-31",
      seller: "Makro Thai x",
      item: "หมู",
      category: "",
      minAmount: null,
      maxAmount: 5000,
      paid: "unpaid",
      docNo: "",
      explain: "Makro pork in October",
    });
  });
  it("needs at least one condition", () => {
    expect(cleanFilter({ from: "", to: "", seller: "", item: "", category: "", minAmount: 0, maxAmount: 0, paid: "any", docNo: "", explain: "" }, keys)).toBeNull();
  });
  it("knows a sales question and a question for the assistant", () => {
    const none = { from: "", to: "", seller: "", item: "", category: "", minAmount: 0, maxAmount: 0, paid: "any", docNo: "", explain: "" };
    expect(cleanFilter({ ...none, kind: "sales" }, keys)?.kind).toBe("sales");
    expect(cleanFilter({ ...none, kind: "ask" }, keys)?.kind).toBe("ask");
    expect(cleanFilter({ ...none, kind: "weird" }, keys)).toBeNull();
  });
  it("searches a name in three languages", () => {
    expect(triIlike("seller->name", "Makro")).toBe("seller->name->>th.ilike.*Makro*,seller->name->>en.ilike.*Makro*,seller->name->>ja.ilike.*Makro*");
  });
});
