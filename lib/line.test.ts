import { describe, expect, it } from "vitest";
import { runChecks } from "./checks";
import { dueReminder, imageType, receiptCard, say } from "./line";
import { sampleDoc } from "./sample";

describe("LINE bot", () => {
  it("recognises photos by their bytes", () => {
    expect(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("image/jpeg");
    expect(imageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(imageType(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(imageType(Buffer.from("%PDF-1.7"))).toBeNull();
  });

  it("answers in Thai and Japanese", () => {
    for (const s of [say.welcome, say.help, say.badCode, say.linked("Som")]) {
      expect(s).toMatch(/[฀-๿]/);
      expect(s).toMatch(/[぀-ヿ]/);
    }
  });

  it("builds the receipt card with the net total, the problems and the link", () => {
    const doc = sampleDoc();
    const checks = runChecks(doc, { companyTaxId: "" });
    const card = receiptCard(doc, checks, "https://app.example/documents/x");
    const json = JSON.stringify(card);
    expect(card.altText.length).toBeLessThanOrEqual(1500);
    expect(json).toContain("฿ 64,200.00");
    expect(json).toContain("https://app.example/documents/x");
    const problems = checks.filter((c) => !c.na && !c.ok).length;
    expect(json).toContain(problems ? `ต้องตรวจ ${problems} รายการ` : "ตรวจอัตโนมัติผ่าน");
  });
});

describe("payment reminder", () => {
  const item = (days: number | null, state: "overdue" | "soon" | "later" | "none", net = 1000) => {
    const doc = sampleDoc();
    doc.totals.net = net;
    return { id: `x${days}`, doc, days, state };
  };
  it("says nothing when nothing is overdue or due within a week", () => {
    expect(dueReminder([item(12, "later"), item(null, "none")], "https://app/")).toBeNull();
  });
  it("counts overdue and soon, lists them in Thai and Japanese with the app link", () => {
    const text = dueReminder([item(-2, "overdue", 64200), item(0, "soon"), item(5, "soon"), item(30, "later")], "https://app/")!;
    expect(text).toContain("期限切れ 1件 · 7日以内 2件");
    expect(text).toContain("เกิน 2 วัน / 2日超過");
    expect(text).toContain("วันนี้ / 本日");
    expect(text).toContain("฿ 64,200.00");
    expect(text).toContain("https://app/");
    expect(text).not.toContain("อีก 30 วัน");
  });
});
