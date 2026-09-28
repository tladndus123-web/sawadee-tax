import { describe, expect, it } from "vitest";
import sample from "@/docs/reference/sample-document.json";
import { amountWords } from "./baht-text";
import { BLOCKS, DEFAULT_FORM_CONFIG, isDefaultFormConfig, sanitizeFormConfig } from "./form-config";
import { formLabel, LABEL_KEYS } from "./form-labels";
import { normalize } from "./normalize";

describe("sanitizeFormConfig", () => {
  it("returns defaults for junk", () => {
    expect(sanitizeFormConfig(null)).toEqual(DEFAULT_FORM_CONFIG);
    expect(sanitizeFormConfig("x")).toEqual(DEFAULT_FORM_CONFIG);
    expect(isDefaultFormConfig(sanitizeFormConfig({}))).toBe(true);
  });

  it("keeps a valid order and appends missing blocks", () => {
    const c = sanitizeFormConfig({ order: ["items", "header", "items", "nope"] });
    expect(c.order).toEqual(["items", "header", "title", "parties", "bottom", "words", "signs", "footer"]);
    expect(c.order).toHaveLength(BLOCKS.length);
  });

  it("only allows hiding optional blocks and known fields", () => {
    const c = sanitizeFormConfig({ hiddenBlocks: ["signs", "items"], hidden: ["colUnit", "colUnit", "colWh", "bogus"] });
    expect(c.hiddenBlocks).toEqual(["signs"]);
    expect(c.hidden).toEqual(["colUnit"]); // the warehouse column is gone (2026-09-29)
  });

  it("trims label overrides and drops empty or unknown ones", () => {
    const c = sanitizeFormConfig(
      { labels: { taxId: { en: "  Tax Identification No. ", th: "" }, customer: { ja: "" }, bogus: { en: "x" } } },
      LABEL_KEYS,
    );
    expect(c.labels).toEqual({ taxId: { en: "Tax Identification No." } });
    expect(formLabel("taxId", "en", c.labels)).toBe("Tax Identification No.");
    expect(formLabel("taxId", "th", c.labels)).toBe("เลขประจำตัวผู้เสียภาษีอากร");
  });
});

describe("amount in words", () => {
  it("keeps Thai words and writes English / Japanese as digits", () => {
    expect(amountWords(64200, "หกหมื่นสี่พันสองร้อยบาทถ้วน")).toEqual({
      th: "หกหมื่นสี่พันสองร้อยบาทถ้วน",
      en: "฿ 64,200.00",
      ja: "฿ 64,200.00",
    });
  });

  it("generates Thai words when none were printed", () => {
    expect(amountWords(11.25).th).toBe("สิบเอ็ดบาทยี่สิบห้าสตางค์");
  });

  it("normalize replaces AI-translated words with digits", () => {
    const d = normalize(sample);
    expect(d.words).toEqual({ th: "หกหมื่นสี่พันสองร้อยบาทถ้วน", en: "฿ 64,200.00", ja: "฿ 64,200.00" });
  });
});
