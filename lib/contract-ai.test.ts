import { describe, expect, it } from "vitest";
import { cleanAnswer, cleanContractAi, readContractAi } from "./contract-ai";

describe("contract AI", () => {
  it("cleans the summary and keeps where it came from", () => {
    const c = cleanContractAi(
      { summary: "Shop lease for 2 years.", terms: [{ label: "Rent", value: "฿45,000 a month" }, { label: "", value: "x" }], dates: [{ label: "End", date: "2026-11-30" }, { label: "Bad", date: "30/11" }], watch: ["Renews by itself", ""] },
      "contracts/a/b.pdf",
      "2026-11-18T00:00:00Z",
    )!;
    expect(c.terms).toEqual([{ label: "Rent", value: "฿45,000 a month" }]);
    expect(c.dates).toEqual([{ label: "End", date: "2026-11-30" }]);
    expect(c.watch).toEqual(["Renews by itself"]);
    expect(readContractAi(c)).toEqual(c);
    expect(cleanContractAi({ summary: "" }, "x")).toBeNull();
  });
  it("cleans an answer", () => {
    expect(cleanAnswer({ answer: "60 days.", quote: "ข้อ 5" })).toEqual({ answer: "60 days.", quote: "ข้อ 5" });
    expect(cleanAnswer({ answer: "" })).toBeNull();
  });
});
