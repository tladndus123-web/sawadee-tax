import { describe, expect, it } from "vitest";
import { askData, askFromData, askFromText, dueText, excelText, salesText, summaryText, uploadPrompt, vatText } from "./line-ask";
import { splitLangs } from "./line";
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
    expect(askFromText("")).toBeNull();
  });
});

describe("answers", () => {
  it("month summary: purchases, claimable VAT, sales, warnings, unpaid — Thai then Japanese", () => {
    const t = summaryText(
      { month: "2026-10", count: 42, total: 120000, claimableVat: 7000, toCheck: 3, sales: 300000, unpaid: 20000, unpaidCount: 5, overdueCount: 1 },
      "https://x/",
    );
    const [th, ja] = splitLangs(t);
    expect(th).toContain("สรุปเดือน 10/2569");
    expect(th).toContain("฿ 120,000.00 (42 ใบ)");
    expect(th).toContain("ยอดขาย ฿ 300,000.00");
    expect(th).toContain("เลยกำหนด 1");
    expect(ja).toContain("2026年10月のまとめ");
    expect(ja).toContain("要確認 3件");
    expect(ja.endsWith("https://x/")).toBe(true);
  });
  it("summary leaves out sales, warnings and unpaid when there are none", () => {
    const [th] = splitLangs(summaryText({ month: "2026-10", count: 0, total: 0, claimableVat: 0, toCheck: 0, sales: null, unpaid: 0, unpaidCount: 0, overdueCount: 0 }, "u"));
    expect(th).not.toContain("ยอดขาย");
    expect(th).not.toContain("รอตรวจ");
    expect(th).not.toContain("ค้างจ่าย");
  });
  it("bills to pay: total, overdue first as given, at most 10 listed", () => {
    const bills = Array.from({ length: 12 }, (_, i) => ({ vendorTh: `ร้าน ${i}`, vendorJa: "", amount: 100.5, due: "2026-10-28", days: i - 1 }));
    const [th, ja] = splitLangs(dueText(bills, "u"));
    expect(th).toContain("12 ใบ ฿ 1,206.00");
    expect(th).toContain("เลยกำหนด 1 วัน");
    expect(th).toContain("และอีก 2 ใบ");
    expect(ja).toContain("ร้าน 0"); // no Japanese name: the Thai one
    expect(ja).toContain("1日超過");
    expect(splitLangs(dueText([], "u"))[0]).toContain("ไม่มีบิล");
  });
  it("VAT return: deadline, output − claimable", () => {
    const v = { month: "2026-09", due: "2026-10-15", daysLeft: 3, onlineOnly: false, claimableVat: 7000, salesVat: 19600, toCheck: 2, drafts: 1 };
    const [th, ja] = splitLangs(vatText(v, "u"));
    expect(th).toContain("ภ.พ.30 เดือน 09/2569");
    expect(th).toContain("ต้องชำระประมาณ ฿ 12,600.00");
    expect(ja).toContain("納付見込み ฿ 12,600.00");
    expect(ja).toContain("下書き 1件");
    expect(splitLangs(vatText({ ...v, salesVat: 5000 }, "u"))[1]).toContain("還付・繰越見込み ฿ 2,000.00");
    expect(splitLangs(vatText({ ...v, salesVat: null }, "u"))[0]).not.toContain("ต้องชำระ");
  });
  it("yesterday's sales: total, branches when there are several", () => {
    const one = splitLangs(salesText({ date: "2026-10-25", branches: [{ th: "สำนักงานใหญ่", ja: "本店", gross: 15000, bills: 80 }] }, "u"));
    expect(one[0]).toContain("25/10/2026: ฿ 15,000.00 (80 บิล)");
    expect(one[0]).not.toContain("• ");
    const two = splitLangs(
      salesText({ date: "2026-10-25", branches: [{ th: "A", ja: "A店", gross: 1000, bills: 0 }, { th: "B", ja: "B店", gross: 500.25, bills: 0 }] }, "u"),
    );
    expect(two[1]).toContain("฿ 1,500.25");
    expect(two[1]).toContain("• B店 ฿ 500.25");
    expect(splitLangs(salesText({ date: "2026-10-25", branches: [] }, "u"))[1]).toContain("まだ入っていません");
  });
  it("Excel: one link per month", () => {
    const [th, ja] = splitLangs(excelText([{ month: "2026-09", count: 40, url: "https://a" }, { month: "2026-10", count: 3, url: "https://b" }]));
    expect(th).toContain("เดือน 09/2569 · 40 ใบ\nhttps://a");
    expect(ja).toContain("2026年10月 · 3件\nhttps://b");
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
