import { describe, expect, it } from "vitest";
import { askData, askFromData, askFromText, uploadPrompt } from "./line-ask";
import { dueCard, excelCard, fiveDayMessage, salesCard, summaryCard, vatCard } from "./line-dash";
import { MENU_SIZE, menuDefinition, menuLang, UPLOAD_DATA } from "./line-menu";

describe("what the admin asks", () => {
  it("menu buttons carry their question", () => {
    expect(askFromData(askData("vat"))).toBe("vat");
    expect(askFromData("branch=1&doc=2")).toBeNull();
    expect(askFromData("ask=drop")).toBeNull();
  });
  it("understands short words in Korean, Japanese, Thai and English", () => {
    expect(askFromText("요약")).toBe("summary");
    expect(askFromText("📊 이번 달 요약")).toBe("summary");
    expect(askFromText("今月のまとめ")).toBe("summary");
    expect(askFromText("낼 돈")).toBe("due");
    expect(askFromText("ต้องจ่าย")).toBe("due");
    expect(askFromText("ภ.พ.30")).toBe("vat");
    expect(askFromText("부가세 마감")).toBe("vat");
    expect(askFromText("어제 매출")).toBe("sales");
    expect(askFromText("売上")).toBe("sales");
    expect(askFromText("엑셀 받기")).toBe("excel");
  });
  it("leaves ordinary chat alone", () => {
    expect(askFromText("สวัสดีครับ")).toBeNull();
    expect(askFromText("오늘 매출이 좋아서 다들 수고했다고 전해 주세요")).toBeNull();
  });
  it("a question that only mentions a word goes to the AI assistant, not to a card", () => {
    expect(askFromText("저번달 매출내역 보내줘")).toBeNull();
    expect(askFromText("先月の売上は？")).toBeNull();
    expect(askFromText("부가세 얼마 내야 해?")).toBeNull();
    expect(askFromText("💸 今週の支払い")).toBe("due");
    expect(askFromText("📈 Yesterday's sales")).toBe("sales");
    expect(askFromText("")).toBeNull();
  });
});

describe("dashboard cards", () => {
  const j = (m: unknown) => JSON.stringify(m);
  const summary = { month: "2026-10", asOf: "09:12", today: "2026-10-26", sales: 1284500, target: 1890000, lastMonthSales: 1500000, purchases: 612300, count: 184, claimableVat: 38140, unpaid: 64200, unpaidCount: 3, overdueCount: 1, toCheck: 2 };
  it("month summary: sales against the target, purchases, VAT, unpaid, warnings", () => {
    const ko = j(summaryCard(summary, "ko", "https://app/"));
    expect(ko).toContain("10월 요약");
    expect(ko).toContain("฿ 1,284,500.00");
    expect(ko).toContain("목표의 68%");
    expect(ko).toContain('"width":"68%"');
    expect(ko).toContain("매입 (184장)");
    expect(ko).toContain("미지급 3건 · 기한 지남 1건");
    expect(ko).toContain("확인이 필요한 영수증 2장");
    expect(ko).toContain("https://app/");
  });
  it("no target: the bar compares with last month; no sales kept: no sales block", () => {
    expect(j(summaryCard({ ...summary, target: 0 }, "ja", "u"))).toContain("先月全体の86%");
    const th = j(summaryCard({ ...summary, sales: null }, "th", "u"));
    expect(th).not.toContain("ยอดขาย");
    expect(th).toContain("สรุปเดือน 10/2569");
  });
  it("each card is in one language only", () => {
    const th = j(summaryCard(summary, "th", "u"));
    expect(th).not.toMatch(/[぀-ヿ가-힣]/);
    const en = j(summaryCard(summary, "en", "u"));
    expect(en).toContain("October 2026 summary");
    expect(en).not.toMatch(/[ก-ฺเ-๛぀-ヿ가-힣]/);
  });
  it("bills to pay: total, names in the reader's language, overdue in orange, at most 8 listed", () => {
    const bills = Array.from({ length: 10 }, (_, i) => ({ vendor: { th: `ร้าน ${i}`, en: `Shop ${i}`, ja: "" }, amount: 100.5, due: "2026-10-28", days: i - 1 }));
    const ja = j(dueCard(bills, "ja", "u"));
    expect(ja).toContain("今週の支払い 10件");
    expect(ja).toContain("฿ 1,005.00");
    expect(ja).toContain("Shop 0"); // no Japanese name: English
    expect(ja).toContain("1日超過");
    expect(ja).toContain("ほか2件");
    expect(j(dueCard([], "ko", "u"))).toContain("7일 안에 낼 돈이 없어요");
  });
  it("VAT: deadline, output − claimable", () => {
    const v = { month: "2026-09", due: "2026-10-15", daysLeft: 3, onlineOnly: false, claimableVat: 7000, salesVat: 19600, toCheck: 0, drafts: 1 };
    const ko = j(vatCard(v, "ko", "u"));
    expect(ko).toContain("9월분 부가세 신고");
    expect(ko).toContain("15/10/2026");
    expect(ko).toContain("낼 부가세 (예상)");
    expect(ko).toContain("฿ 12,600.00");
    expect(j(vatCard({ ...v, salesVat: 5000 }, "en", "u"))).toContain("Estimated refund");
    expect(j(vatCard({ ...v, salesVat: null }, "th", "u"))).not.toContain("ต้องชำระ");
  });
  it("yesterday's sales: total, branches when there are several", () => {
    const one = j(salesCard({ date: "2026-10-25", branches: [{ name: { th: "สำนักงานใหญ่", ja: "本店", ko: "본점", en: "Head office" }, gross: 15000, bills: 80 }] }, "th", "u"));
    expect(one).toContain("฿ 15,000.00");
    expect(one).toContain("80 บิล");
    const two = j(salesCard({ date: "2026-10-25", branches: [{ name: { th: "A", ja: "A店", ko: "A점", en: "A" }, gross: 1000, bills: 0 }, { name: { th: "B", ja: "B店", ko: "B점", en: "B" }, gross: 500.25, bills: 0 }] }, "ko", "u"));
    expect(two).toContain("฿ 1,500.25");
    expect(two).toContain("B점");
    expect(j(salesCard({ date: "2026-10-25", branches: [] }, "ja", "u"))).toContain("まだありません");
  });
  it("Excel: one download button per month", () => {
    const m = j(excelCard([{ month: "2026-09", count: 40, url: "https://a" }, { month: "2026-10", count: 3, url: "https://b" }], "ko"));
    expect(m).toContain("2026년 9월");
    expect(m).toContain("https://a");
    expect(m).toContain("https://b");
  });
  it("5-day report: four cards to swipe — the 5 days, the month, AI suggestions, anything unusual", () => {
    const d = { from: "2026-10-20", to: "2026-10-24", company: "Sawadee Ramen", branchCount: 3, hasSales: true, sales: 420000, salesBefore: 400000, bestDay: { date: "2026-10-24", gross: 98000 }, receipts: 31, purchases: 102300, month: "2026-10", monthSales: 1284500, target: 0, lastMonthSales: 1500000, monthPurchases: 612300, foodCost: 33.8, vatEstimate: 41860, vatDue: "2026-11-17" };
    const tips = [{ title: "채소 매입가가 올랐어요", body: "다른 거래처 단가를 비교해 보세요." }];
    const odd = [{ level: "red" as const, title: "같은 영수증이 두 번 올라왔어요", detail: "PANFOOD · IV-1 · ฿ 64,200.00", url: "https://app/documents/x" }];
    const m = fiveDayMessage(d, tips, odd, "ko", "https://app", { tip: { title: "월말 예상", main: "M" }, next: ["📈 다음 달 매출 예상은?"] });
    const c = m.contents as { type: string; contents: unknown[] };
    expect(c.type).toBe("carousel");
    expect(c.contents).toHaveLength(4);
    const ko = j(m);
    expect(ko).toContain("5 DAYS · 20/10 – 24/10");
    expect(ko).toContain("▲ 5% 직전 5일보다");
    expect(ko).toContain("가장 높은 날");
    expect(ko).toContain("💡 TIP · 월말 예상");
    expect(ko).toContain("✨ 이번 달 운영 제안");
    expect(ko).toContain("채소 매입가가 올랐어요");
    expect(ko).toContain("🔴");
    expect(ko).toContain("https://app/documents/x");
    expect(m.quickReply?.items).toHaveLength(1);
    const calm = j(fiveDayMessage({ ...d, hasSales: false }, [], [], "ja", "https://app"));
    expect(calm).toContain("いつもと違う点はありません");
    expect(calm).toContain("AIの提案を作れませんでした");
  });
});

describe("the admins' LINE menu", () => {
  it("6 taps that cover the whole 2500 × 1686 picture without overlap", () => {
    const areas = menuDefinition("ko").areas ?? [];
    expect(areas).toHaveLength(6);
    const area = areas.reduce((a, x) => a + x.bounds!.width! * x.bounds!.height!, 0);
    expect(area).toBe(MENU_SIZE.width * MENU_SIZE.height);
    for (const row of [0, 843]) {
      const inRow = areas.filter((a) => a.bounds!.y === row);
      expect(inRow.reduce((a, x) => a + x.bounds!.width!, 0)).toBe(MENU_SIZE.width);
    }
  });
  it("follows the owner's picture: wide summary top left, wide upload bottom right", () => {
    const areas = menuDefinition("ja").areas ?? [];
    expect(areas.map((a) => (a.action as { data: string }).data)).toEqual(["ask=summary", "ask=due", "ask=vat", "ask=sales", "ask=excel", UPLOAD_DATA]);
    expect(areas[0].bounds).toMatchObject({ x: 0, y: 0, width: 1250 });
    expect(areas[5].bounds).toMatchObject({ x: 1250, y: 843, width: 1250 });
    expect(areas[0].action).toMatchObject({ displayText: "📊 今月のまとめ" });
  });
  it("speaks the phone's LINE language, English otherwise", () => {
    expect(menuLang("ko")).toBe("ko");
    expect(menuLang("ja")).toBe("ja");
    expect(menuLang("th")).toBe("th");
    expect(menuLang("zh-TW")).toBe("en");
    expect(menuLang(undefined)).toBe("en");
    expect(menuDefinition("th").chatBarText).toBe("เมนู");
  });
  it("the upload card answers with camera and photo buttons", () => {
    const m = uploadPrompt("ko");
    expect(m.quickReply.items.map((i) => i.action.type)).toEqual(["camera", "cameraRoll"]);
  });
});
