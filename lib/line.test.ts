import { describe, expect, it } from "vitest";
import { runChecks } from "./checks";
import { imageType, receiptCard, say } from "./line";
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
