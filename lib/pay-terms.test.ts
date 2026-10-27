import { describe, expect, it } from "vitest";
import { dueByTerms, parsePayTerms, PAY_TERMS } from "./pay-terms";

describe("supplier payment terms", () => {
  it("reads only the known forms", () => {
    expect(PAY_TERMS.every((t) => parsePayTerms(t) === t)).toBe(true);
    expect(parsePayTerms("days:0")).toBeNull();
    expect(parsePayTerms("next:32")).toBeNull();
    expect(parsePayTerms("weekly")).toBeNull();
    expect(parsePayTerms(null)).toBeNull();
  });
  it("works out the due date", () => {
    expect(dueByTerms("2026-10-20", "days:30")).toBe("2026-11-19");
    expect(dueByTerms("2026-12-15", "days:30")).toBe("2027-01-14");
    expect(dueByTerms("2026-02-10", "eom")).toBe("2026-02-28");
    expect(dueByTerms("2026-10-20", "next:5")).toBe("2026-11-05");
    // next month is short: its last day
    expect(dueByTerms("2026-01-20", "next:31")).toBe("2026-02-28");
    expect(dueByTerms("2026-12-01", "next:10")).toBe("2027-01-10");
    expect(dueByTerms("2026-10-20", "now")).toBe("");
    expect(dueByTerms("", "days:30")).toBe("");
  });
});
