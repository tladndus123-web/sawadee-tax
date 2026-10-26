import { describe, expect, it } from "vitest";
import { APP_MODEL, appSystem, assistantSay, cardText, chatText, DEEP_MARK, DEEP_MODEL, DEEP_PER_MONTH, deepSystem, parseCard, parseEvent, QUICK_MODEL, quickSystem, wantsDeep } from "./assistant";
import { inLang } from "./line-lang";

describe("LINE AI assistant", () => {
  it("Haiku answers, Sonnet 5.5 takes the long analyses (no real monthly limit since 2026-10-26)", () => {
    expect(QUICK_MODEL).toBe("claude-haiku-5-5");
    expect(DEEP_MODEL).toBe("claude-sonnet-5-5");
    expect(DEEP_PER_MONTH).toBeGreaterThanOrEqual(1000);
  });
  it("Haiku hands over only with the mark alone at the start", () => {
    expect(wantsDeep(DEEP_MARK)).toBe(true);
    expect(wantsDeep(`  ${DEEP_MARK}\n`)).toBe(true);
    expect(wantsDeep("This month's sales are ฿1,000.")).toBe(false);
    expect(quickSystem("BOOKS")).toContain(DEEP_MARK);
    expect(quickSystem("BOOKS")).toContain("BOOKS");
    expect(deepSystem("BOOKS")).not.toContain(DEEP_MARK);
  });
  it("answers in the asker's language, from the books only", () => {
    const s = quickSystem("x");
    expect(s).toContain("language the person writes in");
    expect(s).toContain("Never invent figures");
  });
  it("cleans markdown for LINE", () => {
    expect(chatText("## Title\n**Sales** are up\n- one\n* two\n\n\n\n`x`")).toBe("Title\nSales are up\n• one\n• two\n\nx");
    expect(chatText("a".repeat(6000))).toHaveLength(4800);
  });
  it("its notices come in every language", () => {
    expect(inLang(assistantSay.thinking(3), "ko")).toContain("이번 달 3번째");
    expect(inLang(assistantSay.thinking(3), "ko")).not.toContain("/");
    expect(inLang(assistantSay.failed, "th")).toMatch(/[ก-๛]/);
    expect(inLang(assistantSay.rate, "en")).toContain("Too many");
  });
});

describe("the assistant's answer as a dashboard card", async () => {
  const { parseCard, cardText } = await import("./assistant");
  const { aiCard } = await import("./line-dash");
  const reply = JSON.stringify({
    title: "9월 매출",
    eyebrow: "sales",
    summary: "9월 매출은 ฿1,284,500으로 8월보다 8% 늘었어요.",
    hero: { label: "9월 매출 합계", value: "฿1,284,500", note: "8월보다 +8%", bar: 1.4 },
    tiles: [{ label: "매장", value: "฿900,000", tone: "up" }, { label: "배달", value: "฿384,500", note: "-3%", tone: "down" }, { label: "x" }],
    rows: [{ label: "1일 (월)", value: "฿41,000" }, { label: "2일 (화)", value: "฿39,500", tone: "warn" }],
    sections: [{ title: "다음에 할 일", items: ["**주말** 인력 확인", ""] }],
    links: [{ label: "매출 보고서", url: "https://app.example/sales/report/2026-09" }, { label: "elsewhere", url: "https://evil.example/x" }],
  });
  it("reads the card and keeps it safe: clamps the bar, drops empty parts and links outside the app", () => {
    const c = parseCard(`Here it is:\n${reply}`, "https://app.example")!;
    expect(c.title).toBe("9월 매출");
    expect(c.eyebrow).toBe("SALES");
    expect(c.hero).toMatchObject({ value: "฿1,284,500", bar: 1 });
    expect(c.tiles).toHaveLength(2);
    expect(c.rows[1]).toMatchObject({ tone: "warn" });
    expect(c.sections[0].items).toEqual(["주말 인력 확인"]);
    expect(c.links).toEqual([{ label: "매출 보고서", url: "https://app.example/sales/report/2026-09" }]);
  });
  it("not a card: null, so the text goes as it is", () => {
    expect(parseCard("Sales were ฿1,000.", "https://app.example")).toBeNull();
    expect(parseCard("{broken", "https://app.example")).toBeNull();
    expect(parseCard("{}", "https://app.example")).toBeNull();
  });
  it("is drawn like the other cards and kept as plain lines for the next question", () => {
    const c = parseCard(reply, "https://app.example")!;
    const flex = JSON.stringify(aiCard(c));
    expect(flex).toContain("9월 매출");
    expect(flex).toContain("฿1,284,500");
    expect(flex).toContain("#0d121c");
    expect(flex).toContain("https://app.example/sales/report/2026-09");
    expect(flex).not.toContain("evil");
    expect(cardText(c)).toContain("2일 (화): ฿39,500");
  });
});

describe("AI assistant inside the app", () => {
  it("Sonnet 5.5 answers, knows today, proposes dates without saving them", () => {
    expect(APP_MODEL).toBe("claude-sonnet-5-5");
    const s = appSystem("BOOKS", "2026-10-27");
    expect(s).toContain("BOOKS");
    expect(s).toContain("2026-10-27");
    expect(s).toContain("inside the Sawadee TAX app");
    expect(s).toContain("Never claim it is already saved");
    expect(s).not.toContain(DEEP_MARK);
  });
  it("checks a proposed date", () => {
    expect(parseEvent({ title: "가게 임대료", date: "2026-11-05", repeat: "monthly", remindDays: 3, amount: 45000, note: "" })).toEqual({ title: "가게 임대료", date: "2026-11-05", repeat: "monthly", remindDays: 3, amount: 45000, note: "" });
    // a date that does not exist, no title, odd values
    expect(parseEvent({ title: "x", date: "2026-02-30" })).toBeNull();
    expect(parseEvent({ title: "", date: "2026-11-05" })).toBeNull();
    expect(parseEvent({ title: "x", date: "next month" })).toBeNull();
    expect(parseEvent({ title: "x", date: "2026-11-05", repeat: "weekly", remindDays: 5, amount: -3 })).toEqual({ title: "x", date: "2026-11-05", repeat: "none", remindDays: 7, amount: null, note: "" });
  });
  it("the card carries the proposal, and its text says it is not saved yet", () => {
    const c = parseCard(JSON.stringify({ title: "Rent", summary: "Tap Save.", event: { title: "Rent", date: "2026-11-05", repeat: "monthly", remindDays: 3, amount: 45000 } }), "https://app.test")!;
    expect(c.event?.date).toBe("2026-11-05");
    expect(cardText(c)).toContain("not saved until Save is tapped");
    expect(parseCard(JSON.stringify({ title: "Sales", summary: "ok" }), "https://app.test")!.event).toBeNull();
  });
});
