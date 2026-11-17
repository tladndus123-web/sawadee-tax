import { describe, expect, it } from "vitest";
import { ilikeAny, matchMenu, nameOf, opensSearch, searchTerm } from "./top-search";

describe("top bar search", () => {
  it("cleans what was typed", () => {
    expect(searchTerm("  makro ")).toBe("makro");
    expect(searchTerm("a")).toBe("");
    expect(searchTerm("x,(y)*%:'\"")).toBe("x y");
    expect(searchTerm("ก".repeat(80))).toHaveLength(60);
  });
  it("builds an or filter", () => {
    expect(ilikeAny(["doc_no", "tax_id"], "IV12")).toBe("doc_no.ilike.*IV12*,tax_id.ilike.*IV12*");
    expect(ilikeAny(["doc_no"], "")).toBe("");
  });
  it("matches menu names by every word", () => {
    const items = ["Ledger", "Sales report", "Settings"];
    expect(matchMenu(items, "s rep", (i) => i)).toEqual(["Sales report"]);
    expect(matchMenu(items, "", (i) => i)).toEqual([]);
  });
  it("opens on / only outside text fields", () => {
    const base = { key: "/", ctrlKey: false, metaKey: false, altKey: false };
    expect(opensSearch({ ...base, target: { tagName: "BODY" } })).toBe(true);
    expect(opensSearch({ ...base, target: { tagName: "INPUT" } })).toBe(false);
    expect(opensSearch({ ...base, target: { isContentEditable: true } })).toBe(false);
    expect(opensSearch({ ...base, ctrlKey: true, target: null })).toBe(false);
  });
  it("names in the reader's language", () => {
    const n = { th: "แม็คโคร", en: "Makro", ja: "" };
    expect(nameOf(n, "ja")).toBe("Makro");
    expect(nameOf(n, "th")).toBe("แม็คโคร");
    expect(nameOf(null, "ko")).toBe("");
  });
});
