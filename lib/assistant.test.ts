import { describe, expect, it } from "vitest";
import { assistantSay, chatText, DEEP_MARK, DEEP_MODEL, DEEP_PER_MONTH, deepSystem, QUICK_MODEL, quickSystem, wantsDeep } from "./assistant";
import { inLang } from "./line-lang";

describe("LINE AI assistant", () => {
  it("Haiku answers, Sonnet 5.5 takes the long analyses, 10 a month", () => {
    expect(QUICK_MODEL).toBe("claude-haiku-5-5");
    expect(DEEP_MODEL).toBe("claude-sonnet-5-5");
    expect(DEEP_PER_MONTH).toBe(10);
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
    expect(inLang(assistantSay.thinking(3), "ko")).toContain("3/10");
    expect(inLang(assistantSay.deepUsedUp, "ja")).toContain("10回");
    expect(inLang(assistantSay.failed, "th")).toMatch(/[ก-๛]/);
    expect(inLang(assistantSay.rate, "en")).toContain("Too many");
  });
});
