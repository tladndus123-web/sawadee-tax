import { describe, expect, it } from "vitest";
import { hashKey, keyFromHeader, keyHint, makeKey } from "./bot-keys";

describe("agent connection keys", () => {
  it("are long random keys with our prefix, different every time", () => {
    const a = makeKey();
    const b = makeKey();
    expect(a).toMatch(/^sk_sawa_[A-Za-z0-9]{32}$/);
    expect(a).not.toBe(b);
  });
  it("are kept as a SHA-256 and shown by a short hint", () => {
    expect(hashKey("sk_sawa_x")).toMatch(/^[0-9a-f]{64}$/);
    expect(keyHint("sk_sawa_ABCDEFGH")).toBe("sk_sawa_ABCD…");
  });
  it("are read from the Authorization header only when they look like ours", () => {
    const k = makeKey();
    expect(keyFromHeader(`Bearer ${k}`)).toBe(k);
    expect(keyFromHeader(k)).toBe(k);
    expect(keyFromHeader("Bearer abc")).toBeNull();
    expect(keyFromHeader(null)).toBeNull();
    expect(keyFromHeader(`Bearer ${k}'; drop table`)).toBeNull();
  });
});
