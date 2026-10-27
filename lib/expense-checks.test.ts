import { describe, expect, it } from "vitest";
import { claimFlags, personalWord } from "./expense-checks";
import type { Claim } from "./expenses";
import { normalize } from "./normalize";

const claim = (over: Partial<Claim>): Claim => ({
  id: "c",
  userId: "u1",
  name: "Somchai",
  day: "2026-10-26",
  seller: "7-Eleven",
  amount: 35000,
  category: "supplies",
  note: "",
  photoPath: "co/c/1.jpg",
  photoHash: null,
  doc: null,
  status: "pending",
  reason: "",
  decidedAt: null,
  paidOn: null,
  paidHow: null,
  documentId: null,
  createdAt: "2026-10-26T05:00:00Z",
  ...over,
});
const H = "f0f0f0f0f0f0f0f0";

describe("claim checks", () => {
  it("passes an ordinary claim", () => {
    expect(claimFlags(claim({}), { claims: [] })).toEqual([]);
  });

  it("finds the same photo claimed before, or already in the ledger", () => {
    const first = claim({ id: "a", photoHash: H });
    expect(claimFlags(claim({ photoHash: H }), { claims: [first] })).toEqual([{ kind: "dupPhoto", ref: "a" }]);
    expect(claimFlags(claim({ photoHash: H }), { claims: [], ledgerPhotos: [{ id: "doc1", hash: H }] })).toEqual([{ kind: "dupPhoto", ref: "doc1" }]);
    // A paid-back claim is its own ledger document, and a rejected claim does not count
    expect(claimFlags(claim({ photoHash: H, documentId: "c" }), { claims: [{ ...first, status: "rejected" }], ledgerPhotos: [{ id: "c", hash: H }] })).toEqual([]);
  });

  it("finds the same shop, day and amount claimed twice", () => {
    expect(claimFlags(claim({}), { claims: [claim({ id: "b", userId: "u2", seller: "7-ELEVEN " })] })).toEqual([{ kind: "dupReceipt", ref: "b" }]);
  });

  it("points out personal things, a typed amount that differs from the receipt, old receipts and no photo", () => {
    const doc = normalize({ items: [{ desc: { th: "เบียร์ช้าง 620ml", en: "", ja: "" }, amount: 120 }], totals: { net: 350 } });
    expect(claimFlags(claim({ doc, amount: 45000, day: "2026-09-01", photoPath: null }), { claims: [] })).toEqual([
      { kind: "personal", word: "เบียร์" },
      { kind: "mismatch", n: 35000 },
      { kind: "old", n: 55 },
      { kind: "noPhoto" },
    ]);
    // a ledger document moved to a claim is old by nature
    expect(claimFlags(claim({ day: "2026-09-01", documentId: "d1" }), { claims: [] }).some((f) => f.kind === "old")).toBe(false);
    expect(personalWord(["HEINEKEN 330"])).toBe("HEINEKEN");
    expect(personalWord(["dish soap", "กระดาษทิชชู่"])).toBeNull();
  });

  it("points out a claim far above what the person usually claims", () => {
    const usual = [1, 2, 3].map((i) => claim({ id: `p${i}`, amount: 30000, createdAt: `2026-10-0${i}T00:00:00Z`, day: `2026-10-0${i}` }));
    expect(claimFlags(claim({ amount: 500000 }), { claims: usual })).toEqual([{ kind: "big", n: 30000 }]);
    expect(claimFlags(claim({ amount: 80000 }), { claims: usual })).toEqual([]);
    // Same rule as the 5-day report: under ฿5,000 is never news, however many times the usual
    expect(claimFlags(claim({ amount: 120000 }), { claims: usual })).toEqual([]);
  });
});
