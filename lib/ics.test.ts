import { describe, expect, it } from "vitest";
import { buildIcs, fold, icsText } from "./ics";

describe("calendar feed (.ics)", () => {
  it("escapes text and folds long lines", () => {
    expect(icsText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
    const long = `SUMMARY:${"부가세 신고 ".repeat(10)}`;
    const folded = fold(long);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });

  it("makes all-day events with a reminder", () => {
    const ics = buildIcs("Sawadee TAX", [{ uid: "vat:2026-10", date: "2026-11-16", title: "부가세 신고 (ภ.พ.30) · 10월분", description: "예상 납부 ฿148,148", remindDays: 3 }], new Date("2026-11-06T01:02:03Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261116\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261117\r\n");
    expect(ics).toContain("UID:vat:2026-10@sawadee-tax");
    expect(ics).toContain("TRIGGER:-PT63H");
    expect(ics).toContain("DTSTAMP:20261106T010203Z");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    // on the day: 9:00
    expect(buildIcs("x", [{ uid: "a", date: "2026-11-16", title: "t", remindDays: 0 }])).toContain("TRIGGER:PT9H");
    // a bad date is left out
    expect(buildIcs("x", [{ uid: "b", date: "16/11/2026", title: "t" }])).not.toContain("BEGIN:VEVENT");
  });
});
