import { describe, expect, it } from "vitest";
import { calendarItems } from "./company-calendar";
import { dueToday, reminderMessage } from "./calendar-remind";
import { inLang } from "./line-lang";

describe("calendar reminders", () => {
  const items = calendarItems({
    from: "2026-10-28",
    to: "2027-06-30",
    vatRegistered: true,
    payroll: true,
    events: [
      { id: "rent", title: "가게 임대료", date: "2026-11-01", repeat: "monthly", remindDays: 3, note: "", amount: 4500000 },
      { id: "lic", title: "주류 허가 갱신", date: "2026-11-27", repeat: "none", remindDays: 30, note: "" },
    ],
  });

  it("picks company dates on their reminder day and the day itself, yearly filings at 30/7/1/0 days", () => {
    expect(dueToday(items, "2026-10-29").map((i) => i.key)).toEqual(["event:rent:2026-11-01"]);
    expect(dueToday(items, "2026-10-28").map((i) => i.key)).toEqual(["event:lic:2026-11-27"]);
    expect(dueToday(items, "2026-11-01").map((i) => i.key)).toEqual(["event:rent:2026-11-01"]);
    // 50 ทวิ is due 15 Feb (a working day in 2027): 30 days before
    expect(dueToday(items, "2027-01-16").map((i) => i.kind)).toContain("cert50");
    // VAT and the monthly filings are left to the existing reminders (never sent twice)
    expect(dueToday(items, "2026-11-13").some((i) => i.kind === "vat" || i.kind === "monthly")).toBe(false);
  });

  it("leaves out what was ticked off, and carries every language for the reader's card", () => {
    expect(dueToday(items.map((i) => ({ ...i, done: true })), "2026-10-29")).toEqual([]);
    const msg = reminderMessage(dueToday(items, "2026-10-29"), "2026-10-29", "https://x.test")!;
    const ko = inLang(msg, "ko");
    expect(ko).toContain("가게 임대료");
    expect(ko).toContain("D-3");
    expect(ko).toContain("฿45,000");
    expect(ko.endsWith("https://x.test/calendar")).toBe(true);
    expect(inLang(msg, "ja")).toContain("あと3日");
    expect(inLang(msg, "th")).toContain("อีก 3 วัน");
    expect(reminderMessage([], "2026-10-29", "x")).toBeNull();
  });
});
