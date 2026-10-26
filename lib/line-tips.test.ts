import { describe, expect, it } from "vitest";
import { noticeMessage, summaryCard } from "./line-dash";
import { four } from "./line-lang";
import { cashTip, claimTip, costTip, forecastTip, NEXT, weekdayTip } from "./line-tips";

describe("💡 TIP under the cards", () => {
  it("month-end forecast at the current pace, against the target and what it takes a day", () => {
    const t = forecastTip({ sales: 1_000_000, daysDone: 20, daysInMonth: 31, target: 1_800_000, lastMonthSales: 1_400_000, month: "2026-10" }, "ko")!;
    expect(t.title).toBe("월말 예상");
    expect(t.main).toContain("10월 매출은 약 ฿1,550,000 (목표의 86%)");
    expect(t.note).toContain("남은 11일 동안 하루 ฿72,727");
    const noTarget = forecastTip({ sales: 1_000_000, daysDone: 20, daysInMonth: 31, target: 0, lastMonthSales: 1_400_000, month: "2026-10" }, "en")!;
    expect(noTarget.main).toContain("+11% vs last month");
    expect(noTarget.note).toBeUndefined();
    expect(forecastTip({ sales: 0, daysDone: 0, daysInMonth: 31, target: 0, lastMonthSales: 0, month: "2026-10" }, "ja")).toBeNull();
  });
  it("without sales: the biggest cost", () => {
    expect(costTip({ name: "仕入・材料費", share: 0.42 }, "ja")!.main).toBe("今月の仕入の42%が仕入・材料費です。");
    expect(costTip(null, "ko")).toBeNull();
  });
  it("cash: overdue bills first, else whether last week's sales cover the bills", () => {
    expect(cashTip({ dueTotal: 5000, overdue: 2, overdueTotal: 3000, last7Sales: 100 }, "th")!.main).toContain("เลยกำหนด 2 ใบ");
    expect(cashTip({ dueTotal: 5000, overdue: 0, overdueTotal: 0, last7Sales: 9000 }, "ko")!.main).toContain("충분해요");
    expect(cashTip({ dueTotal: 5000, overdue: 0, overdueTotal: 0, last7Sales: 1000 }, "en")!.main).toContain("may be short");
    expect(cashTip({ dueTotal: 0, overdue: 0, overdueTotal: 0, last7Sales: 1000 }, "en")).toBeNull();
  });
  it("VAT that cannot be claimed, else ready to file", () => {
    expect(claimTip({ lostCount: 11, lostVat: 4200, toCheck: 0 }, "ko").main).toContain("11장 (부가세 ฿4,200)");
    expect(claimTip({ lostCount: 0, lostVat: 0, toCheck: 2 }, "ja").main).toContain("2件");
    expect(claimTip({ lostCount: 0, lostVat: 0, toCheck: 0 }, "en").main).toContain("ready to file");
  });
  it("yesterday against the same weekday", () => {
    expect(weekdayTip({ date: "2026-10-25", total: 11200, usual: 10000 }, "ko")!.main).toBe("평소 일요일 평균 ฿10,000보다 +12%예요.");
    expect(weekdayTip({ date: "2026-10-25", total: 0, usual: 10000 }, "ko")).toBeNull();
  });
  it("every question button fits LINE (20 characters) in every language", () => {
    for (const kind of Object.values(NEXT)) for (const list of Object.values(kind)) for (const q of list) expect([...q].length).toBeLessThanOrEqual(20);
  });
  it("the card carries the TIP and the question buttons", () => {
    const card = summaryCard(
      { month: "2026-10", asOf: "09:00", today: "2026-10-26", sales: 100, target: 0, lastMonthSales: 0, purchases: 0, count: 0, claimableVat: 0, unpaid: 0, unpaidCount: 0, overdueCount: 0, toCheck: 0 },
      "ko",
      "u",
      { tip: { title: "월말 예상", main: "M", note: "N" }, next: NEXT.summary.ko },
    );
    expect(JSON.stringify(card)).toContain("💡 TIP · 월말 예상");
    expect(card.quickReply?.items).toHaveLength(4);
    expect(card.quickReply?.items?.[0].action).toMatchObject({ type: "message", text: "📈 다음 달 매출 예상은?" });
  });
});

describe("notices as cards", () => {
  const text = four("ไทย\nบรรทัด 2\n\nยอด: ฿1\nhttps://x/a", "日本\n2行目\n\n控除できる仕入VAT：฿100\n要確認 2件 · 下書き 1件 — 申告前に整理してください\nhttps://x/a", "한국\n둘째 줄\n\n공제받을 매입 부가세: ฿100\nhttps://x/a", "EN\nline 2\n\nTotal: ฿1\nhttps://x/a");
  it("title, the line under it, label: value rows, a list, the link as a button", () => {
    const j = JSON.stringify(noticeMessage([text], "REMINDER", "ja"));
    expect(j).toContain('"text":"日本"');
    expect(j).toContain("2行目");
    expect(j).toContain("控除できる仕入VAT");
    expect(j).toContain("要確認 2件");
    expect(j).toContain('"uri":"https://x/a"');
    expect(j).toContain("開く");
    expect(j).not.toContain("한국");
  });
  it("several reminders swipe as a carousel", () => {
    const m = noticeMessage([text, text], "REMINDER", "ko");
    expect((m.contents as { type: string }).type).toBe("carousel");
    expect(noticeMessage([text], "REMINDER", "ko").contents.type).toBe("bubble");
  });
});
