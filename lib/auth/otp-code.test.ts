import { describe, expect, it } from "vitest";
import { pickCode } from "./otp-code";

describe("the sign-in code out of pasted text", () => {
  it("the code alone, typed or auto-filled", () => {
    expect(pickCode("482913")).toBe("482913");
    expect(pickCode("48 29 13")).toBe("482913");
    expect(pickCode("4829")).toBe("4829");
  });
  it("from the email subject or a whole copied email, ignoring dates and phone numbers", () => {
    expect(pickCode("482913 · 로그인 코드 · Sign-in code")).toBe("482913");
    expect(pickCode("29/09/2026 เวลา 10:30 รหัสของคุณ 482913 โทร 0812345678")).toBe("482913");
  });
  it("never more than six digits", () => {
    expect(pickCode("12345678901")).toBe("123456");
  });
});

describe("works on older phones", () => {
  it("no lookbehind in the code pattern (older iPhones cannot load a script that has one)", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("lib/auth/otp-code.ts", "utf8")).not.toMatch(/\(\?<[!=]/);
  });
  it("a code at the very start, in the middle, or at the end", () => {
    expect([pickCode("123456 · code"), pickCode("code: 123456."), pickCode("x123456")]).toEqual(["123456", "123456", "123456"]);
  });
});
