import { describe, expect, it } from "vitest";
import { rankBranches, type RankInput } from "./branch-rank";

const row = (id: string, o: Partial<RankInput> = {}): RankInput => ({ id, sales: 0, profit: 0, margin: 0, fl: null, target: 0, days: 10, ...o });

describe("rankBranches", () => {
  const rows = [
    row("a", { sales: 100_000, profit: 20_000, margin: 0.2, fl: 55, target: 200_000 }),
    row("b", { sales: 300_000, profit: 30_000, margin: 0.1, fl: 62, target: 250_000 }),
    row("c", { sales: 200_000, profit: 50_000, margin: 0.25, fl: 48 }),
  ];
  const ids = (by: Parameters<typeof rankBranches>[1]) => rankBranches(rows, by).map((r) => `${r.row.id}${r.rank ?? "-"}`).join(" ");

  it("ranks by sales, profit and margin, highest first", () => {
    expect(ids("sales")).toBe("b1 c2 a3");
    expect(ids("profit")).toBe("c1 b2 a3");
    expect(ids("margin")).toBe("c1 a2 b3");
  });

  it("ranks the food + labour share lowest first", () => {
    expect(ids("fl")).toBe("c1 a2 b3");
  });

  it("ranks by progress towards the target; a branch without one comes last, unranked", () => {
    expect(ids("goal")).toBe("b1 a2 c-");
  });

  it("puts a branch without sales last and gives equal values the same rank", () => {
    const r = rankBranches([row("x", { days: 0 }), row("y", { sales: 5 }), row("z", { sales: 5 })], "sales");
    expect(r.map((x) => `${x.row.id}${x.rank ?? "-"}`).join(" ")).toBe("y1 z1 x-");
  });
});
