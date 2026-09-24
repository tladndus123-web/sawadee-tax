import { describe, expect, it } from "vitest";
import sample from "@/docs/reference/sample-document.json";
import { type DocumentRow, docToRow, type ItemRow, rowToDoc } from "./db-map";
import { normalize } from "./normalize";

const doc = { ...normalize(sample), id: "00000000-0000-0000-0000-000000000001", stickers: ["red" as const], fieldBoxes: { "customer.name": [0.1, 0.2, 0.3, 0.04] as [number, number, number, number] } };

/** What PostgREST sends back: numeric columns may arrive as strings */
function asStored(row: Record<string, unknown>, items: ItemRow[]): [DocumentRow, ItemRow[]] {
  const money = ["total", "discount", "after_disc", "deposit", "after_dep", "exempt", "taxable", "vat", "net", "wht"];
  const r = { ...row, id: doc.id, created_at: "", updated_at: "", created_by: null, updated_by: null, photo_path: null, deleted_at: null, deleted_by: null, delete_reason: null } as Record<string, unknown>;
  for (const k of money) r[k] = Number(r[k]).toFixed(2);
  return [r as unknown as DocumentRow, items.map((i) => ({ ...i, qty: Number(i.qty).toFixed(4), price: Number(i.price).toFixed(2) }))];
}

describe("database mapping", () => {
  it("round-trips a document unchanged", () => {
    const { row, items } = docToRow(doc, "reviewed");
    expect(rowToDoc(...asStored(row, items))).toEqual(doc);
  });

  it("stores empty dates as null and records the failing checks as flags", () => {
    const { row } = docToRow({ ...doc, dueDate: "", paidDate: "" }, "draft", "0105557035035");
    expect(row.due_date).toBeNull();
    expect(row.paid_date).toBeNull();
    expect(row.flags).toEqual(["unclear"]);
  });

  it("keeps item order by line number", () => {
    const two = { ...doc, items: [doc.items[0], { ...doc.items[0], code: "SECOND" }] };
    const { row, items } = docToRow(two, "reviewed");
    expect(rowToDoc(...asStored(row, [...items].reverse())).items.map((i) => i.code)).toEqual([doc.items[0].code, "SECOND"]);
  });
});
