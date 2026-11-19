import { describe, expect, it } from "vitest";
import { dupNotice, noticeKeys, notSeen } from "./dup-notice";
import type { Sale } from "./sales";

const sale = (o: Partial<Sale>): Sale => ({ id: "x", branchId: "", date: "2026-11-05", channel: "store", docFrom: "", docTo: "", bills: 120, gross: 43268.9, vat: 2830.66, exempt: 0, note: "", photoPath: null, source: "photo", ...o });
const doc = (id: string, at: string) => ({ id, tax: "0105557035035", doc_no: "INV-1", doc_date: "2026-10-31", net: 68.08, created_at: at });

describe("duplicates popup list", () => {
  const docs = [doc("d1", "2026-11-01T04:22:00Z"), doc("d2", "2026-11-01T12:24:00Z"), { ...doc("d3", "2026-11-02T00:00:00Z"), doc_no: "INV-2" }];
  const sales = [sale({ id: "a", date: "2026-05-11" }), sale({ id: "b", date: "2026-11-05" })];
  it("lists document groups and sales pairs with keys of exactly what was compared", () => {
    const n = dupNotice(docs, sales, new Set());
    expect(n.docs).toEqual([{ key: "doc:0105557035035|INV-1|d1,d2", copies: 1, extra: 68.08 }]);
    expect(n.sales).toEqual([{ key: "sale:a|b", first: { id: "a", date: "2026-05-11" }, second: { id: "b", date: "2026-11-05", gross: 43268.9 } }]);
  });
  it("leaves out what someone marked fine, and a new copy asks again", () => {
    expect(noticeKeys(dupNotice(docs, sales, new Set(["doc:0105557035035|INV-1|d1,d2", "sale:a|b"])))).toEqual([]);
    const again = dupNotice([...docs, doc("d4", "2026-11-03T00:00:00Z")], sales, new Set(["doc:0105557035035|INV-1|d1,d2"]));
    expect(again.docs.map((d) => d.key)).toEqual(["doc:0105557035035|INV-1|d1,d2,d4"]);
  });
  it("hides what this person already checked", () => {
    const n = dupNotice(docs, sales, new Set());
    expect(noticeKeys(notSeen(n, new Set(["sale:a|b"])))).toEqual(["doc:0105557035035|INV-1|d1,d2"]);
  });
});
