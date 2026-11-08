import { describe, expect, it } from "vitest";
import { shared } from "./shared-load";

describe("shared (one request at a time)", () => {
  it("calls at the same moment share one request; a later call asks again", async () => {
    let calls = 0;
    const load = shared(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return calls;
    });
    const [a, b, c] = await Promise.all([load(), load(), load()]);
    expect([a, b, c, calls]).toEqual([1, 1, 1, 1]);
    expect(await load()).toBe(2);
  });
  it("a failure is passed on and the next call tries again", async () => {
    let n = 0;
    const load = shared(async () => {
      n++;
      if (n === 1) throw new Error("x");
      return n;
    });
    await expect(load()).rejects.toThrow("x");
    expect(await load()).toBe(2);
  });
});
