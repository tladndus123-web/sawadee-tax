import { describe, expect, it } from "vitest";
import { fromBase64 } from "./bot-docs-server";
import { lineCardText } from "./bot-server";
import { LANG_SPLIT } from "./line-lang";

describe("Grok Bot's LINE card", () => {
  it("title, a blank subtitle, the lines, the app link last", () => {
    expect(lineCardText("오늘 정리", ["매출: ฿25,000", "확인할 것: 2장"], "https://x.app")).toEqual({ text: "오늘 정리\n\n매출: ฿25,000\n확인할 것: 2장\nhttps://x.app/", count: 2 });
  });
  it("keeps it short and drops links the agent wrote", () => {
    const r = lineCardText("x".repeat(80), [...Array(20)].map((_, i) => `line ${i}`).concat("https://evil.com"), "https://x.app")!;
    expect(r.count).toBe(12);
    expect(r.text.split("\n")[0]).toHaveLength(40);
    expect(r.text).not.toContain("evil.com");
    expect(lineCardText("t", [`a${LANG_SPLIT}b`], "https://x.app")!.text).toContain("ab");
    expect(lineCardText("t", [], "https://x.app")).toBeNull();
  });
});

describe("receipt files from the agent", () => {
  it("reads base64, also as a data: URL", () => {
    expect(fromBase64("aGVsbG8=")?.toString()).toBe("hello");
    expect(fromBase64("data:image/png;base64,aGVsbG8=")?.toString()).toBe("hello");
    expect(fromBase64("not base64!")).toBeNull();
    expect(fromBase64("")).toBeNull();
  });
});
