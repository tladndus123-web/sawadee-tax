import { describe, expect, it } from "vitest";
import { isValidReason, type LedgerEntry, pick, thumbPath } from "./ledger-store";

const e = (id: string, createdAt: number, deletedAt: number | null = null, status: "draft" | "final" = "final") =>
  ({ id, status, createdAt, updatedAt: createdAt, deletedAt, deletedBy: deletedAt ? "Admin" : null, deleteReason: deletedAt ? "dup" : null }) as LedgerEntry;

describe("soft delete helpers", () => {
  it("requires a real reason", () => {
    expect(isValidReason("")).toBe(false);
    expect(isValidReason("  a ")).toBe(false);
    expect(isValidReason("업체 측 이중 발급")).toBe(true);
  });

  it("hides deleted documents from the ledger and lists them in the trash", () => {
    const all = [e("a", 1), e("b", 3), e("c", 2, 10), e("d", 4, 20), e("x", 5, null, "draft"), e("y", 6, 30, "draft")];
    expect(pick(all, "ledger").map((x) => x.id)).toEqual(["b", "a"]);
    expect(pick(all, "drafts").map((x) => x.id)).toEqual(["x"]);
    expect(pick(all, "trash").map((x) => x.id)).toEqual(["y", "d", "c"]);
  });
});

describe("list thumbnails", () => {
  it("sit next to the photo with a .thumb.jpg ending", () => {
    expect(thumbPath("7f3c/1790350472098.jpg")).toBe("7f3c/1790350472098.thumb.jpg");
    expect(thumbPath("sample/panfood-1790282809483.JPG")).toBe("sample/panfood-1790282809483.thumb.jpg");
    expect(thumbPath("line/abc")).toBe("line/abc.thumb.jpg");
  });
});
