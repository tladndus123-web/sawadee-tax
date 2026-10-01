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
    for (const s of [say.welcome, say.checking, say.badCode, say.linked("Som")]) {
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

describe("VAT return reminder (LINE)", async () => {
  const { vatReminder } = await import("./line");
  const base = { month: "2026-09", due: "2026-10-15", toCheck: 2, drafts: 1, claimableVat: 8400 };
  it("is sent only 3 days and 1 day before the deadline", () => {
    expect(vatReminder({ ...base, daysLeft: 5 }, "https://x")).toBeNull();
    expect(vatReminder({ ...base, daysLeft: 0 }, "https://x")).toBeNull();
    expect(vatReminder({ ...base, daysLeft: 3 }, "https://x")).not.toBeNull();
    expect(vatReminder({ ...base, daysLeft: 1 }, "https://x")).not.toBeNull();
  });
  it("names the month (Thai year too), the deadline, what is left and the claimable VAT", () => {
    const text = vatReminder({ ...base, daysLeft: 3 }, "https://x")!;
    expect(text).toContain("09/2569");
    expect(text).toContain("2026年9月分");
    expect(text).toContain("15/10/2026");
    expect(text).toContain("要確認 2件 · 下書き 1件");
    expect(text).toContain("8,400.00");
    expect(text.endsWith("https://x")).toBe(true);
  });
  it("a test is sent on any day", () => {
    expect(vatReminder({ ...base, daysLeft: 17 }, "https://x", { force: true })).toContain("あと17日");
  });
  it("says the documents are ready when nothing is left", () => {
    expect(vatReminder({ ...base, toCheck: 0, drafts: 0, daysLeft: 1 }, "https://x")).toContain("準備ができています");
  });
});

describe("phone notification made from a reminder", async () => {
  const { toPush } = await import("./push-server");
  it("first line is the title, the next two the body; the link line is dropped", () => {
    const m = toPush("Title · タイトル\nline one\nline two\n\n• item\n\nhttps://x/", "https://x/");
    expect(m).toEqual({ title: "Title · タイトル", body: "line one\nline two", url: "https://x/" });
  });
});

describe("branch buttons under the LINE receipt card", async () => {
  const { branchButtons, lineBranchLabel } = await import("./line");
  it("one postback button per branch, naming the document; names as the bot says them", () => {
    const q = branchButtons("doc-1", [{ id: "h", no: "00000", name: "" }, { id: "s", no: "00001", name: "Silom" }, { id: "a", no: "00002", name: "" }]);
    expect(q.items).toHaveLength(3);
    const a = q.items![1].action as { type: string; label: string; data: string };
    expect(a).toMatchObject({ type: "postback", label: "Silom", data: "branch=s&doc=doc-1" });
    expect(lineBranchLabel({ no: "00000", name: "" })).toBe("สำนักงานใหญ่ / 本店");
    expect(lineBranchLabel({ no: "00002", name: "" })).toBe("สาขา 00002");
  });
  it("LINE allows 13 buttons at most", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, no: String(i).padStart(5, "0"), name: "" }));
    expect(branchButtons("d", many).items).toHaveLength(13);
    expect(branchButtons("d", many).items?.length).toBe(13);
  });
});

describe("payroll filing reminder (LINE)", async () => {
  const { payrollReminder } = await import("./line");
  const base = { month: "2026-09", pnd1Paper: "2026-10-07", due: "2026-10-15", wht: 1704.17, ss: 3500 };
  it("is sent 3 days and 1 day before, naming the month, deadline and amounts", () => {
    expect(payrollReminder({ ...base, daysLeft: 5 }, "https://x")).toBeNull();
    const text = payrollReminder({ ...base, daysLeft: 3 }, "https://x")!;
    expect(text).toContain("09/2569");
    expect(text).toContain("15/10/2026");
    expect(text).toContain("1,704.17");
    expect(text).toContain("3,500.00");
    expect(text.endsWith("https://x")).toBe(true);
  });
});

describe("Thai and Japanese as separate messages", async () => {
  const { langMessages, say, splitLangs, vatReminder } = await import("./line");
  it("every bot text splits into a Thai part and a Japanese part, nothing mixed", () => {
    const [th, ja] = splitLangs(say.welcome);
    expect(th).toMatch(/[฀-๿]/);
    expect(th).not.toMatch(/[぀-ヿ]/);
    expect(ja).toMatch(/[぀-ヿ]/);
    expect(ja).not.toMatch(/[ก-ฺเ-๛]/);
    expect(splitLangs(say.branchAsk)).toHaveLength(2);
  });
  it("the morning reminders: one bubble in Thai, one in Japanese", () => {
    const base = { month: "2026-09", due: "2026-10-15", toCheck: 0, drafts: 0, claimableVat: 100, daysLeft: 3 };
    const m = langMessages([vatReminder(base, "https://x")!, vatReminder({ ...base, toCheck: 2 }, "https://x")!]);
    expect(m).toHaveLength(2);
    // (฿ sits in the Thai block too, so only Thai letters count)
    expect(m[0].text).not.toMatch(/[぀-ヿ]/);
    expect(m[1].text).not.toMatch(/[ก-ฺเ-๛]/);
    expect(m[1].text.match(/付加価値税/g)).toHaveLength(2);
  });
});

describe("sales file reply (LINE)", async () => {
  const { say } = await import("./line");
  it("names the days, the totals, the branch and what was skipped", () => {
    const text = say.salesSaved({ days: 2, from: "2026-09-26", to: "2026-09-27", gross: 3745, vat: 245, locked: 1, invalid: 0, branch: { th: "สาขา 00001", ja: "支店 00001" } }, "https://x/sales");
    expect(text).toContain("2 วัน (26/09/2026 – 27/09/2026) · สาขา 00001");
    expect(text).toContain("3,745.00");
    expect(text).toContain("ข้าม 1 วัน");
    expect(text).toContain("締めた月の1日分");
    expect(text.endsWith("https://x/sales")).toBe(true);
    const none = say.salesSaved({ days: 0, from: "", to: "", gross: 0, vat: 0, locked: 2, invalid: 0, branch: null }, "https://x/sales");
    expect(none).toContain("ไม่ได้บันทึกยอดขาย");
    expect(none).toContain("ข้าม 2 วัน");
  });
});

describe("employee document reminder (LINE)", async () => {
  const { documentReminder } = await import("./line");
  it("is sent 30 / 7 / 1 / 0 days before and daily once expired, naming person and document", async () => {
    expect(documentReminder([{ name: "Somchai", doc: "Work permit", daysLeft: 12 }], "https://x")).toBeNull();
    const text = documentReminder([{ name: "Somchai", doc: "Work permit", daysLeft: 7 }, { name: "Mai", doc: "Visa", daysLeft: -3 }], "https://x")!;
    const { splitLangs } = await import("./line");
    const [th, ja] = splitLangs(text);
    expect(th).toContain("Somchai — Work permit: อีก 7 วัน");
    expect(th).toContain("Mai — Visa: หมดอายุแล้ว 3 วัน");
    expect(ja).toContain("Somchai — Work permit：あと7日");
    expect(ja).toContain("Mai — Visa：期限切れ 3日");
    expect(th.endsWith("https://x") && ja.endsWith("https://x")).toBe(true);
  });
});
