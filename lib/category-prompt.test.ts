import { describe, expect, it } from "vitest";
import { categoryPrompt } from "./category-prompt";
import { isCategoryKey } from "./types";

describe("the company's categories", () => {
  it("keys: built-in names or c_ + 4–12 letters/digits", () => {
    expect(isCategoryKey("food")).toBe(true);
    expect(isCategoryKey("c_pack01")).toBe(true);
    expect(isCategoryKey("c_X")).toBe(false);
    expect(isCategoryKey("snacks")).toBe(false);
    expect(isCategoryKey(null)).toBe(false);
  });

  it("the AI is told the company's own categories with name and hint, and the hidden built-in ones", () => {
    const text = categoryPrompt([
      { key: "food", builtin: true, name: {}, hint: "", hidden: false },
      { key: "rent", builtin: true, name: {}, hint: "", hidden: true },
      { key: "other", builtin: true, name: {}, hint: "", hidden: true },
      { key: "c_pack01", builtin: false, name: { ko: "포장재", en: "Packaging" }, hint: "boxes,  tape and bags", hidden: false },
      { key: "c_old123", builtin: false, name: { en: "Old" }, hint: "", hidden: true },
    ]);
    expect(text).toContain("c_pack01 = Packaging — boxes, tape and bags");
    expect(text).not.toContain("c_old123");
    expect(text).toContain("Do not use these categories (the company does not use them): rent.");
  });

  it("nothing to add when the company changed nothing", () => {
    expect(categoryPrompt([{ key: "food", builtin: true, name: { ko: "식재료" }, hint: "", hidden: false }])).toBe("");
  });
});
