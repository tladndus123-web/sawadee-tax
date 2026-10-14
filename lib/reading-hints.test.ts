import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase/admin", () => ({ supabaseAdmin: () => ({}) }));
const { vendorHintText } = await import("./reading-hints-server");

describe("known sellers in the reading instructions", () => {
  it("lists them most used first and skips rows without a tax ID or a name", () => {
    const text = vendorHintText([
      { tax_id: "0105551111111", name: { th: "แม็คโคร", en: "Makro" }, uses: 2 },
      { tax_id: "0105552222222", name: { th: "ฟู้ดโปรเจ็ค", en: "" }, uses: 9 },
      { tax_id: null, name: { th: "x" }, uses: 50 },
      { tax_id: "0105553333333", name: null, uses: 50 },
    ]);
    const lines = text.split("\n").filter((l) => /^\d{13} \|/.test(l));
    expect(lines).toEqual(["0105552222222 | ฟู้ดโปรเจ็ค | ", "0105551111111 | แม็คโคร | Makro"]);
    expect(text).toContain("Never copy a tax ID from this list");
  });
  it("is empty without known sellers", () => {
    expect(vendorHintText([])).toBe("");
  });
});
