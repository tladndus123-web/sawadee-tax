import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { sampleDoc } from "./sample";
import { applyTranslations, translationJobs } from "./translate-gaps";

describe("type in one language, get the other two", () => {
  it("translates nothing when nothing was touched", () => {
    expect(translationJobs(sampleDoc(), sampleDoc())).toEqual([]);
  });

  it("translates a field changed in one language into the other two", () => {
    const before = sampleDoc();
    const now = sampleDoc();
    now.seller.name = { ...now.seller.name, en: "Siam Bakery Supply" };
    now.items[0].desc = { ...now.items[0].desc, th: "เนยจืด" };
    const jobs = translationJobs(now, before);
    expect(jobs).toEqual([
      { path: "seller.name", from: "en", text: "Siam Bakery Supply", to: ["th", "ja"] },
      { path: "items.0.desc", from: "th", text: "เนยจืด", to: ["en", "ja"] },
    ]);
  });

  it("leaves fields edited in two languages, or emptied, as the person left them", () => {
    const before = sampleDoc();
    const now = sampleDoc();
    now.seller.name = { th: "ก", en: "A", ja: now.seller.name.ja };
    now.note = { ...now.note, en: "" };
    expect(translationJobs(now, before)).toEqual([]);
  });

  it("fills a new, typed-by-hand document (new item lines too)", () => {
    const before = normalize({});
    const now = normalize({ seller: { name: { th: "", en: "", ja: "サイアムベーカリー" } }, items: [{ desc: { th: "", en: "Butter 5 kg", ja: "" }, qty: 1, price: 10, amount: 10 }] });
    expect(translationJobs(now, before).map((j) => [j.path, j.from])).toEqual([
      ["seller.name", "ja"],
      ["items.0.desc", "en"],
    ]);
  });

  it("puts results in, keeping what has no result", () => {
    const now = normalize({ seller: { name: { th: "", en: "Siam Bakery", ja: "" } }, note: { th: "", en: "x", ja: "" } });
    const jobs = translationJobs(now, normalize({}));
    const out = applyTranslations(now, jobs, [{ th: "สยามเบเกอรี่", ja: "サイアムベーカリー" }, {}]);
    expect(out.seller.name).toEqual({ th: "สยามเบเกอรี่", en: "Siam Bakery", ja: "サイアムベーカリー" });
    expect(out.note).toEqual({ th: "", en: "x", ja: "" });
    expect(now.seller.name.th).toBe(""); // the original is not changed
  });
});

describe("translate request check", async () => {
  const { parseTranslateBody, MAX_TRANSLATE_ITEMS } = await import("./translate-server");
  it("accepts a clean list and drops the source language from the targets", () => {
    expect(parseTranslateBody({ items: [{ from: "en", text: "Butter", to: ["th", "en", "ja"] }] })).toEqual([{ from: "en", text: "Butter", to: ["th", "ja"] }]);
  });
  it("refuses empty, oversized or malformed requests", () => {
    expect(parseTranslateBody(null)).toBeNull();
    expect(parseTranslateBody({ items: [] })).toBeNull();
    expect(parseTranslateBody({ items: [{ from: "ko", text: "x", to: ["th"] }] })).toBeNull();
    expect(parseTranslateBody({ items: [{ from: "en", text: "   ", to: ["th"] }] })).toBeNull();
    expect(parseTranslateBody({ items: [{ from: "en", text: "x".repeat(501), to: ["th"] }] })).toBeNull();
    expect(parseTranslateBody({ items: Array.from({ length: MAX_TRANSLATE_ITEMS + 1 }, () => ({ from: "en", text: "x", to: ["th"] })) })).toBeNull();
  });
});
