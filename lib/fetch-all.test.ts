import { describe, expect, it } from "vitest";
import { allRows, fetchAll, ID_CHUNK, inChunks, PAGE } from "./fetch-all";

// A fake query over `n` rows that, like the database, never answers more than `cap` rows
function fake(n: number, cap = 1000, fail = false) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const orders: string[] = [];
  const make = () => {
    const q = {
      order(c: string) {
        orders.push(c);
        return q;
      },
      range(from: number, to: number) {
        calls.push([from, to]);
        const end = Math.min(to + 1, from + cap);
        return Promise.resolve(fail ? { data: null, error: new Error("boom") } : { data: rows.slice(from, end), error: null });
      },
      then: undefined,
    };
    return q;
  };
  return { make, calls, orders };
}

describe("fetchAll (every row, past the 1000-row cap)", () => {
  it("1,500 rows come back whole in pages of 500, ordered by the key", async () => {
    const f = fake(1500);
    const rows = await fetchAll<{ id: number }>(f.make);
    expect(rows).toHaveLength(1500);
    expect(new Set(rows.map((r) => r.id)).size).toBe(1500);
    expect(f.calls).toEqual([[0, 499], [500, 999], [1000, 1499], [1500, 1999]]);
    expect(f.orders.every((o) => o === "id")).toBe(true);
  });
  it("an exact multiple of the page asks once more and stops on the empty page; fewer rows = one request", async () => {
    expect(await fetchAll(fake(PAGE * 2).make)).toHaveLength(PAGE * 2);
    const small = fake(12);
    expect(await fetchAll(small.make)).toHaveLength(12);
    expect(small.calls).toHaveLength(1);
  });
  it("no key = no extra sort; an error is thrown, or handed back by allRows", async () => {
    const f = fake(3);
    await fetchAll(f.make, null);
    expect(f.orders).toEqual([]);
    await expect(fetchAll(fake(3, 1000, true).make)).rejects.toThrow("boom");
    const r = await allRows(fake(3, 1000, true).make);
    expect(r.data).toBeNull();
    expect(r.error).toBeTruthy();
  });
});

describe("fetchAll while rows are being added", () => {
  it("a row that shows up on two pages is kept once", async () => {
    // Page 2 starts with the last row of page 1 (someone saved a document in between)
    const pages = [Array.from({ length: PAGE }, (_, i) => ({ id: i })), [{ id: PAGE - 1 }, { id: PAGE }]];
    let n = 0;
    const make = () => {
      const q = { order: () => q, range: () => Promise.resolve({ data: pages[n++], error: null }), then: undefined };
      return q;
    };
    const rows = await fetchAll<{ id: number }>(make);
    expect(rows.length).toBe(PAGE + 1);
    expect(new Set(rows.map((r) => r.id)).size).toBe(PAGE + 1);
  });
});

describe("inChunks (long id lists)", () => {
  const ids = Array.from({ length: 1607 }, (_, i) => `id-${i}`);
  it("1,607 ids go out 100 at a time, every id once, in order", async () => {
    const parts: string[][] = [];
    const rows = await inChunks<{ id: string }>(ids, (part) => (parts.push(part), Promise.resolve({ data: part.map((id) => ({ id })), error: null })));
    expect(parts.length).toBe(17);
    expect(Math.max(...parts.map((p) => p.length))).toBe(ID_CHUNK);
    expect(parts.flat()).toEqual(ids);
    expect(rows.length).toBe(1607);
    // one request's address stays far under a gateway's limit
    expect(parts[0].join(",").length).toBeLessThan(4000);
  });
  it("an update without returned rows works, and nothing is sent for no ids", async () => {
    let calls = 0;
    expect(await inChunks(ids.slice(0, 3), () => (calls++, Promise.resolve({ error: null })))).toEqual([]);
    expect(await inChunks([], () => (calls++, Promise.resolve({ error: null })))).toEqual([]);
    expect(calls).toBe(1);
  });
  it("stops at the first error", async () => {
    let calls = 0;
    await expect(inChunks(ids, () => (calls++, Promise.resolve({ error: calls === 2 ? new Error("boom") : null })))).rejects.toThrow("boom");
    expect(calls).toBe(2);
  });
});
