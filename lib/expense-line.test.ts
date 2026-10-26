import { describe, expect, it } from "vitest";
import { expensePostback, expenseWords, fillIn, flagTexts, isExpenseWord } from "./expense-line";
import { claimCard } from "./line-dash";

const card = { id: "00000000-0000-0000-0000-00000000c001", name: "Somchai", day: "2026-10-26", seller: "7-Eleven", amount: 35000, what: "소모품", note: "주방 세제", monthTotal: 124000, photoUrl: null, appUrl: "https://x.test/expenses" };

describe("expense claims on LINE", () => {
  it("shows the claim with approve / reject buttons in the reader's language, in the dashboard design", () => {
    const m = claimCard(card, "ko");
    const json = JSON.stringify(m);
    expect(m.altText).toBe("🧾 경비 청구가 왔어요 · Somchai ฿350");
    expect(json).toContain("26/10/2026");
    expect(json).toContain("주방 세제");
    expect(json).toContain("฿1,240");
    expect(json).toContain("expense=approve&id=00000000-0000-0000-0000-00000000c001");
    expect(json).toContain("expense=reject&id=");
    expect(json).toContain("#0d121c");
    expect(json).not.toContain('"hero":{"type":"image"');
    expect(JSON.stringify(claimCard({ ...card, photoUrl: "https://x.test/p.jpg" }, "th"))).toContain('"hero":{"type":"image"');
  });

  it("puts the admin's warnings on the card, worded like the app's", () => {
    const flags = flagTexts([{ kind: "personal", word: "เบียร์" }, { kind: "big", n: 30000 }], "ko");
    expect(flags).toHaveLength(2);
    expect(flags[0]).toContain("เบียร์");
    expect(flags[1]).toContain("฿300");
    expect(JSON.stringify(claimCard({ ...card, flags }, "ko"))).toContain("⚠️");
  });

  it("reads only its own postbacks", () => {
    expect(expensePostback("expense=approve&id=00000000-0000-0000-0000-00000000c001")).toEqual({ action: "approve", id: "00000000-0000-0000-0000-00000000c001" });
    expect(expensePostback("expense=pay&id=00000000-0000-0000-0000-00000000c001")).toBeNull();
    expect(expensePostback("expense=approve&id=x")).toBeNull();
    expect(expensePostback("ask=summary")).toBeNull();
  });

  it("fills the words in", () => {
    expect(fillIn(expenseWords("en").toStaffOk, { amount: "฿350" })).toBe("✓ Your expense claim of ฿350 was approved.");
  });

  it("knows the expense-mode word in every language, alone", () => {
    for (const w of ["경비", " เบิก ", "経費", "Expense", "เบิกค่าใช้จ่าย"]) expect(isExpenseWord(w)).toBe(true);
    for (const w of ["경비 얼마야", "summary", "เบิกได้ไหม"]) expect(isExpenseWord(w)).toBe(false);
  });
});
