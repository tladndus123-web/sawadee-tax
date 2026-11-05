import { describe, expect, it } from "vitest";
import { dropLoginDraft, finishLoginSwitch, isLoginSwitching, keepLoginDraft, loginShouldEnter, loginStayCookie, markLoginSwitch, peekLoginDraft } from "./login-entrance";

describe("login entrance", () => {
  it("plays on a fresh visit and stays put on a language change", () => {
    expect(loginShouldEnter(undefined)).toBe(true);
    expect(loginShouldEnter("")).toBe(true);
    expect(loginShouldEnter("1")).toBe(false);
  });

  it("the cookie is short-lived and can be cleared", () => {
    expect(loginStayCookie(true)).toContain("sawadee_login_stay=1");
    expect(loginStayCookie(true)).toContain("Max-Age=60");
    expect(loginStayCookie(false)).toContain("Max-Age=0");
  });

  it("a language click is remembered until the next screen takes over", () => {
    expect(isLoginSwitching()).toBe(false);
    markLoginSwitch();
    expect(isLoginSwitching()).toBe(true);
    finishLoginSwitch();
    expect(isLoginSwitching()).toBe(false);
  });

  it("what was typed survives a language change and is dropped when leaving", () => {
    keepLoginDraft({ email: "stay@company.com", code: "123456", sent: false });
    expect(peekLoginDraft()).toEqual({ email: "stay@company.com", code: "123456", sent: false });
    dropLoginDraft();
    expect(peekLoginDraft()).toBeNull();
  });
});
