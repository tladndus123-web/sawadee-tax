import { describe, expect, it } from "vitest";
import { goalCard, goalSetText, monthEndMessage, shareCard } from "./line-dash";
import { marginTip } from "./line-tips";
import { suggestGoals } from "./month-end-server";
import { isMonthEndDay } from "./report-server";
import type { Sale } from "./sales";

const sale = (branchId: string, date: string, gross: number, vat = 0): Sale => ({
  id: `${branchId}${date}`,
  branchId,
  date,
  channel: "store",
  docFrom: "",
  docTo: "",
  bills: 0,
  gross,
  vat,
  exempt: 0,
  note: "",
  photoPath: null,
  source: "manual",
});

describe("month-end report", () => {
  it("goes out on the 1st (from the owner's start day)", () => {
    expect(isMonthEndDay("2026-11-01")).toBe(true);
    expect(isMonthEndDay("2026-11-02")).toBe(false);
    expect(isMonthEndDay("2026-10-01")).toBe(false);
  });
  it("margin TIP: what is left of every ฿100, against last month", () => {
    const t = marginTip({ salesValue: 1_000_000, profit: 150_000, prevSalesValue: 900_000, prevProfit: 162_000 }, "ko")!;
    expect(t.main).toBe("매출 ฿100마다 ฿15이 남았어요 (이익률 15%, 지난달 18%).");
    expect(t.note).toContain("원가율");
    expect(marginTip({ salesValue: 0, profit: 0, prevSalesValue: 0, prevProfit: 0 }, "en")).toBeNull();
  });
  it("card: what was left vs last month, target, costs, VAT, withholding; share and files", () => {
    const m = monthEndMessage(
      { month: "2026-10", company: "Sawadee Ramen", hasSales: true, salesValue: 1_400_000, costs: 700_000, labor: 178_600, profit: 521_400, previousProfit: 482_778, vatPayable: 45_860, wht: 12_400, socialSecurity: 7_500, target: 1_300_000, documents: 184 },
      "ko",
      "https://app",
      { tip: { title: "이익률", main: "M" } },
    );
    const j = JSON.stringify(m);
    expect((m.contents as { type: string }).type).toBe("carousel");
    expect(j).toContain("10월 마감");
    expect(j).toContain("฿ 521,400.00");
    expect(j).toContain("▲ 8% 지난달보다");
    expect(j).toContain("목표 달성 ✓");
    expect(j).toContain('"data":"share=2026-10"');
    expect(j).toContain('"data":"goal=2026-11"');
    expect(j).toContain("11월 목표 정하기");
    expect(j).toContain("https://app/sales/report/2026-10");
    expect(j).toContain("매입 서류 184장");
  });
  it("accountant link: forward by LINE with the link inside, and a preview", () => {
    const j = JSON.stringify(shareCard({ month: "2026-10", url: "https://app/th/share/TOKEN", expires: "2026-11-30T00:00:00Z", company: "ร้าน" }, "ja"));
    expect(j).toContain("10月の資料リンク");
    expect(j).toContain("30/11/2026");
    expect(j).toContain("https://line.me/R/share?text=");
    expect(j).toContain(encodeURIComponent("https://app/th/share/TOKEN"));
  });
});

describe("next month's target", () => {
  const branches = [
    { id: "h", no: "00000", name: "" },
    { id: "s", no: "00001", name: "Silom" },
  ];
  const sales = [
    sale("h", "2026-10-03", 1_070_000, 70_000), // last month: 1,000,000 without VAT
    sale("", "2026-10-04", 107_000, 7_000), // no branch → head office
    sale("h", "2026-09-10", 500_000),
    sale("h", "2026-08-10", 500_000),
    sale("s", "2026-10-10", 200_000),
    sale("s", "2026-09-10", 400_000),
    sale("s", "2026-08-10", 600_000),
  ];
  it("the better of last month and the 3-month average, raised, rounded up to ฿10,000", () => {
    const [head, silom] = suggestGoals(branches, sales, "2026-11", 5);
    expect(head.base).toBe(1_100_000);
    expect(head.target).toBe(1_160_000);
    expect(silom.base).toBe(400_000); // average beats last month's 200,000
    expect(silom.target).toBe(420_000);
    expect(suggestGoals(branches, sales, "2026-11", 0)[0].target).toBe(1_100_000);
  });
  it("no sales: no target", () => {
    expect(suggestGoals(branches, [], "2026-11", 5).every((g) => g.target === 0)).toBe(true);
  });
  it("card: the total, each branch, and +5% / +0% / +10% buttons; a message once set", () => {
    const j = JSON.stringify(goalCard("2026-11", [{ name: "본점", base: 1, target: 1_160_000 }, { name: "Silom", base: 1, target: 420_000 }], "ko", "https://app"));
    expect(j).toContain("11월 목표");
    expect(j).toContain("฿ 1,580,000.00");
    expect(j).toContain('"data":"goalset=2026-11&p=5"');
    expect(j).toContain('"data":"goalset=2026-11&p=10"');
    expect(JSON.stringify(goalCard("2026-11", [], "en", "https://app"))).toContain("Not enough sales");
    expect(goalSetText("2026-11", 1_580_000, "ko")).toBe("✓ 11월 목표를 정했어요 · 합계 ฿ 1,580,000.00");
  });
});
