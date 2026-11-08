import { describe, expect, it } from "vitest";
import { dupGroups, likelyCopies } from "./dup-groups";

const d = (id: string, taxId: string, docNo: string, date: string, total: number, createdAt: number) => ({ id, sellerTaxId: taxId, docNo, date, total, createdAt });

describe("duplicate review groups", () => {
  it("groups the same seller and number, oldest first; the later identical ones are pre-ticked", () => {
    const g = dupGroups([
      d("b", "0105557035035", "IV-1", "2026-10-05", 100, 2),
      d("a", "0-1055-57035-03-5", "IV-1 ", "2026-10-05", 100, 1),
      d("c", "0105557035035", "IV-2", "2026-10-06", 50, 3),
      d("x", "", "IV-9", "2026-10-06", 50, 4),
      d("y", "", "IV-9", "2026-10-06", 50, 5),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(g[0].identical).toBe(true);
    expect(likelyCopies(g)).toEqual(["b"]);
  });
  it("a group whose date or amount differs is shown but nothing is pre-ticked", () => {
    const g = dupGroups([d("a", "0105557035035", "7", "2026-10-03", 1459, 1), d("b", "0105557035035", "7", "2026-10-17", 1295, 2)]);
    expect(g[0].identical).toBe(false);
    expect(likelyCopies(g)).toEqual([]);
  });
});
