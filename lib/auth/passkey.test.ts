import { describe, expect, it } from "vitest";
import { deviceLabel, isAlreadyRegistered, isCancel, LATER_DAYS, shouldOffer } from "./passkey";

describe("passkey helpers", () => {
  it("names the device and browser", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36")).toBe("Mac · Chrome");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0")).toBe("Windows · Edge");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/15.1.0")).toBe("iPhone · LINE");
    expect(deviceLabel("")).toBe("Passkey");
  });

  it("offers to register only where it helps", () => {
    const now = Date.UTC(2026, 9, 18);
    expect(shouldOffer({ supported: true, registeredHere: false, laterAt: null, now })).toBe(true);
    expect(shouldOffer({ supported: false, registeredHere: false, laterAt: null, now })).toBe(false);
    expect(shouldOffer({ supported: true, registeredHere: true, laterAt: null, now })).toBe(false);
    expect(shouldOffer({ supported: true, registeredHere: false, laterAt: now - 86_400_000, now })).toBe(false);
    expect(shouldOffer({ supported: true, registeredHere: false, laterAt: now - LATER_DAYS * 86_400_000, now })).toBe(true);
  });

  it("tells a closed system sheet and an already registered device from real errors", () => {
    expect(isCancel(new DOMException("The operation either timed out or was not allowed.", "NotAllowedError"))).toBe(true);
    expect(isCancel({ code: "ERROR_CEREMONY_ABORTED" })).toBe(true);
    expect(isCancel({ name: "WebAuthnError", cause: { name: "NotAllowedError" } })).toBe(true);
    expect(isCancel(new Error("network"))).toBe(false);
    expect(isAlreadyRegistered({ name: "WebAuthnError", code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" })).toBe(true);
    expect(isAlreadyRegistered(new DOMException("x", "InvalidStateError"))).toBe(true);
    expect(isAlreadyRegistered(null)).toBe(false);
  });
});
