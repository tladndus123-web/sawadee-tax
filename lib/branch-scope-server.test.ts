import { describe, expect, it } from "vitest";
import { notIn, scopedAdmin } from "./branch-scope-server";

describe("scopedAdmin", () => {
  it("adds the branch filter to selects on branch tables only", () => {
    const calls: string[] = [];
    const builder = (table: string) => ({
      select: () => ({ or: (f: string) => (calls.push(`${table}:${f}`), "filtered") }),
      insert: () => "inserted",
    });
    const fake = { from: builder, storage: "s" } as never;
    const db = scopedAdmin(fake, ["b1", "b2"]) as unknown as { from: (t: string) => { select: () => unknown; insert: () => unknown }; storage: string };
    expect(db.from("sales").select()).toBe("filtered");
    expect(db.from("branches").select()).toBe("filtered");
    expect((db.from("company_settings").select() as { or?: unknown }).or).toBeTypeOf("function");
    expect(db.from("sales").insert()).toBe("inserted");
    expect(db.storage).toBe("s");
    expect(calls).toEqual([`sales:${notIn("branch_id", ["b1", "b2"])}`, `branches:${notIn("id", ["b1", "b2"])}`]);
    expect(notIn("branch_id", ["b1"])).toBe("branch_id.is.null,branch_id.not.in.(b1)");
  });
  it("is the same client when nothing is hidden", () => {
    const fake = { from: () => 1 } as never;
    expect(scopedAdmin(fake, [])).toBe(fake);
  });
});
