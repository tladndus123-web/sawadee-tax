import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("where to go after signing in", () => {
  it("keeps a path on this site, with its query and hash", () => {
    expect(safeNext("/ko/ledger", "/ko")).toBe("/ko/ledger");
    expect(safeNext("/ja/documents/abc?tab=photo#top", "/ja")).toBe("/ja/documents/abc?tab=photo#top");
  });

  it("falls back when there is none", () => {
    expect(safeNext(null, "/ko")).toBe("/ko");
    expect(safeNext("", "/ko")).toBe("/ko");
  });

  it("never sends anyone to another site", () => {
    for (const bad of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "\\\\evil.com",
      "/\tevil.com",
      "/\n/evil.com",
      "javascript:alert(1)",
      "evil.com",
      "/%5Cevil.com",
    ]) {
      const to = safeNext(bad, "/ko");
      expect(to.startsWith("/") && !to.startsWith("//") && !to.includes("\\")).toBe(true);
      expect(new URL(to, "https://this.site").origin).toBe("https://this.site");
    }
  });
});
