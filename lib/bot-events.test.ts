import { describe, expect, it } from "vitest";
import { claimEvent, testEvent } from "./bot-events-server";
import { skillMarkdown } from "./bot-skill";
import type { Claim } from "./expenses";

const claim = { id: "c1", userId: "u1", name: "Kong", day: "2026-11-08", seller: "Air service", amount: 800000, category: "repair", note: "aircon", photoPath: null, photoHash: null, status: "pending" } as unknown as Claim;

describe("events for Grok Bot", () => {
  it("a new claim: who, how much, where to decide", () => {
    const ev = claimEvent(claim, 3, "https://x.app");
    expect(ev.event).toBe("claim");
    expect(ev.title).toContain("Kong");
    expect(ev.title).toContain("฿8,000");
    expect(ev.lines.join("\n")).toContain("Waiting for approval now: 3");
    expect(ev.open).toBe("https://x.app/expenses");
    expect(ev.data).toMatchObject({ claimId: "c1", amountBaht: 8000 });
  });
  it("the test event says what will come", () => {
    expect(testEvent("https://x.app")).toMatchObject({ event: "test", open: "https://x.app/" });
  });
});

describe("the skill for Grok Bot", () => {
  it("names every tool and the rules", () => {
    const md = skillMarkdown("https://x.app");
    expect(md.startsWith("---\nname: sawadee-tax\n")).toBe(true);
    for (const tool of ["day_summary", "books_overview", "calendar", "tax_return_numbers", "find_documents", "supplier_summary", "unusual_things", "price_rises", "sales_detail", "add_calendar_date", "remove_calendar_date", "add_document_note", "add_receipt", "set_event_webhook", "send_line_to_owner"]) expect(md).toContain(`**${tool}**`);
    expect(md).toContain("https://x.app/api/mcp");
    expect(md).toContain("DRAFT");
  });
});
