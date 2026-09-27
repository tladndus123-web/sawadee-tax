import { describe, expect, it } from "vitest";
import { nextInQueue, queueProgress, reviewQueue } from "./review-queue";
import { sampleDoc } from "./sample";

const CO = "0105557035035";
const good = () => ({ ...sampleDoc(), customer: { ...sampleDoc().customer, taxId: CO } });
const entry = (id: string, createdAt: number, over: Partial<{ status: "draft" | "final"; deletedAt: number | null; bad: boolean }> = {}) => {
  const doc = good();
  if (over.bad) doc.totals = { ...doc.totals, vat: 1 };
  return { id, createdAt, status: over.status ?? "final", deletedAt: over.deletedAt ?? null, doc: { ...doc, docNo: id } };
};

describe("check one by one", () => {
  it("lists drafts and flagged documents, oldest first, never clean or deleted ones", () => {
    const q = reviewQueue(
      [entry("clean", 1), entry("bad-new", 5, { bad: true }), entry("draft", 3, { status: "draft" }), entry("bad-old", 2, { bad: true }), entry("gone", 0, { bad: true, deletedAt: 9 })],
      CO,
      "2026-09-27",
    );
    expect(q).toEqual(["bad-old", "draft", "bad-new"]);
  });

  it("moves on past the current and already handled documents", () => {
    const q = ["a", "b", "c", "d"];
    expect(nextInQueue(q, "a", new Set())).toBe("b");
    expect(nextInQueue(q, "b", new Set(["a", "c"]))).toBe("d");
    expect(nextInQueue(q, "d", new Set(["a", "b", "c"]))).toBeNull();
  });

  it("counts progress as handled + current + waiting", () => {
    expect(queueProgress(["a", "b", "c"], "a", new Set())).toEqual({ at: 1, total: 3 });
    // "a" was saved and left the queue; "b" is open, "c" waits
    expect(queueProgress(["b", "c"], "b", new Set(["a"]))).toEqual({ at: 2, total: 3 });
  });
});
