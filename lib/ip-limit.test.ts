import { describe, expect, it } from "vitest";
import { guessingTooMuch, ipOf, wrongGuess } from "./ip-limit";

const req = (ip: string) => new Request("https://x.test/", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

describe("token guessing brake", () => {
  it("takes the first address of x-forwarded-for, 'local' without one", () => {
    expect(ipOf(req("203.0.113.5"))).toBe("203.0.113.5");
    expect(ipOf(new Request("https://x.test/"))).toBe("local");
  });
  it("refuses after N wrong tries in a minute, per address and scope, and forgets after the minute", () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      expect(guessingTooMuch(req("198.51.100.1"), "t", 5, t0 + i)).toBe(false);
      wrongGuess(req("198.51.100.1"), "t", t0 + i);
    }
    expect(guessingTooMuch(req("198.51.100.1"), "t", 5, t0 + 10)).toBe(true);
    expect(guessingTooMuch(req("198.51.100.2"), "t", 5, t0 + 10)).toBe(false);
    expect(guessingTooMuch(req("198.51.100.1"), "other", 5, t0 + 10)).toBe(false);
    expect(guessingTooMuch(req("198.51.100.1"), "t", 5, t0 + 61_000)).toBe(false);
  });
});
