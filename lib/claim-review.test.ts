import { describe, expect, it } from "vitest";
import { type ClaimSheet, cleanClaimReview, cleanClaimSheet } from "./claim-review";

const sheet: ClaimSheet = {
  today: "2026-11-18",
  claims: [
    { n: 1, name: "Nok", amount: 350, category: "Supplies", seller: "Makro", day: "2026-11-17", bought: ["Ice"], note: "", hasPhoto: true, flags: [], usual: 400 },
    { n: 2, name: "Tom", amount: 1200, category: "Supplies", seller: "7-Eleven", day: "2026-11-16", bought: ["Leo beer"], note: "", hasPhoto: true, flags: ["Looks personal: beer"], usual: null },
  ],
};

describe("AI claim review", () => {
  it("keeps a clean answer", () => {
    const r = cleanClaimReview(
      {
        summary: "1 looks fine, 1 to check.",
        verdicts: [
          { n: 1, verdict: "ok", reason: "Ice from Makro, ฿350 is below the usual ฿400." },
          { n: 2, verdict: "reject", reason: "Beer is personal." },
        ],
      },
      sheet,
    );
    expect(r?.verdicts.map((v) => v.verdict)).toEqual(["ok", "reject"]);
  });
  it("never lets a flagged claim be ok", () => {
    const r = cleanClaimReview({ summary: "All fine.", verdicts: [{ n: 2, verdict: "ok", reason: "Fine." }] }, sheet);
    expect(r?.verdicts[0].verdict).toBe("check");
  });
  it("drops unknown claims, repeats and made-up numbers", () => {
    const r = cleanClaimReview({ summary: "Fine.", verdicts: [{ n: 9, verdict: "ok", reason: "" }, { n: 1, verdict: "ok", reason: "" }, { n: 1, verdict: "reject", reason: "" }] }, sheet);
    expect(r?.verdicts).toHaveLength(1);
    expect(cleanClaimReview({ summary: "฿9,999 too much.", verdicts: [{ n: 1, verdict: "check", reason: "" }] }, sheet)).toBeNull();
  });
  it("cleans what the browser sends", () => {
    expect(cleanClaimSheet({ claims: [] })).toBeNull();
    const s = cleanClaimSheet({ today: "2026-11-18", claims: [{ name: "A", amount: 10.005, hasPhoto: "yes", flags: ["x", 3] }] });
    expect(s?.claims[0]).toMatchObject({ n: 1, amount: 10.01, hasPhoto: false, flags: ["x"] });
  });
});
